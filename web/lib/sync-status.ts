/*
 * sync-status.ts — data for the Sync page (RD 2026-07-06: "for transparency,
 * we need a Sync page that shows the syncing processes" — the Mayor's first
 * mirror takes hours, especially the Voyage index). Read-only assembly over
 * pipeline.connector_accounts, app.audit_log, and the ING-4 reconciliation
 * counts. The page's Run control drives the existing POST /api/sync passes;
 * nothing here writes.
 */
import { query } from "./db";
import { graphConnector } from "./connectors/graph";
import { gmailConnector } from "./connectors/gmail";
import { getRefreshToken } from "./connectors/token-store";
import { embedCounts } from "./embed-mail";

export interface SyncAccount {
  provider: "outlook" | "gmail";
  address: string;
  mailbox: string; // gov = public record, biz = walled (DEC-6)
  status: string; // active | pending | error
  phase: "backfill" | "incremental" | "first-pull" | "error";
  mirrored: number;
  mailboxTotal: number | null; // live ask of the provider — best-effort
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SyncStatus {
  live: boolean;
  accounts: SyncAccount[];
  index: {
    messages: number;
    indexed: number;
    remaining: number;
    ratePerMin: number | null; // from recent embed.run ledger rows
    etaMinutes: number | null;
  };
  /** Mail arriving, measured directly off pipeline.ingest_log timestamps
   *  rather than the audit ledger — the ledger only records whole runs, so a
   *  4-minute backfill round reads as one lump. The per-minute series is what
   *  makes "it's working, here's the pace" legible during a long first sync. */
  mail: {
    mirrored: number;
    total: number | null; // summed live mailbox sizes; null if any ask failed
    remaining: number | null;
    ratePerMin: number | null; // trailing 10-minute average
    etaMinutes: number | null;
    /** Newest-last, one entry per minute for the last 30 minutes, zero-filled
     *  so a stall reads as a gap in the chart instead of a missing bar. */
    history: { minute: string; n: number }[];
  };
  calendar: { events: number; lastRunAt: string | null };
  scheduler: {
    lastIngestAt: string | null;
    lastEmbedAt: string | null;
    cadenceMinutes: number;
    stale: boolean; // no automatic run inside 2× cadence + slack
  };
  recent: { at: string; action: string; summary: string }[];
}

const SCHED_CADENCE_MIN = 15; // the pilot's GitHub Actions tick / prod Vercel cron
const TOTAL_TIMEOUT_MS = 8_000; // a throttled provider must not hang the page

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

interface AccountRow {
  id: string;
  provider: "outlook" | "gmail";
  address: string;
  mailbox_id: string;
  status: string;
  cursor: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

function phaseOf(a: AccountRow): SyncAccount["phase"] {
  if (a.status === "error") return "error";
  if (!a.cursor) return "first-pull";
  return a.cursor.startsWith("bf:") ? "backfill" : "incremental";
}

/** Ask the provider how big the mailbox is — the honest denominator under the
 *  progress bar. Any failure (dead token, throttle, timeout) degrades to null;
 *  the bar falls back to a plain mirrored count. */
async function liveTotal(a: AccountRow): Promise<number | null> {
  try {
    const refreshToken = await getRefreshToken(a.id);
    if (!refreshToken) return null;
    const c = a.provider === "gmail" ? gmailConnector(a.address) : graphConnector(a.address);
    const { accessToken } = await c.refreshAccessToken(refreshToken);
    return await c.mailboxTotal(accessToken);
  } catch {
    return null;
  }
}

function summarize(action: string, meta: Record<string, unknown>): string {
  if (action === "ingest.run") {
    const rs = (meta.results ?? []) as {
      pulled?: number; landed?: number; ok?: boolean; provider?: string; backfillRemaining?: boolean;
    }[];
    if (!rs.length) return "no active accounts";
    const pulled = rs.reduce((n, r) => n + (r.pulled ?? 0), 0);
    const landed = rs.reduce((n, r) => n + (r.landed ?? 0), 0);
    const err = rs.find((r) => r.ok === false);
    const bf = rs.some((r) => r.backfillRemaining);
    return `pulled ${pulled} · landed ${landed}${bf ? " · backfill continues" : ""}${err ? ` · ${err.provider ?? "account"} ERROR` : ""}`;
  }
  if (action === "embed.run") {
    const m = meta as { embeddedMessages?: number; chunks?: number; remaining?: number };
    return `indexed ${m.embeddedMessages ?? 0} msgs · ${m.chunks ?? 0} chunks · ${(m.remaining ?? 0).toLocaleString()} to go`;
  }
  if (action === "ingest.calendar") {
    return `${Number(meta.accounts ?? 0)} account(s) mirrored`;
  }
  if (action === "sync.manual") {
    return meta.backfillRemaining || meta.embedRemaining ? "manual pass — more to do" : "manual pass — caught up";
  }
  return "";
}

export async function getSyncStatus(withTotals: boolean): Promise<SyncStatus> {
  const rows = await query<AccountRow>(
    `SELECT id, provider, address, mailbox_id, status, cursor,
            last_synced_at::text, last_error
       FROM pipeline.connector_accounts ORDER BY created_at`,
  );

  // mirrored per account: the real-mail rows this address landed
  const mirrored = await query<{ account: string; n: number }>(
    `SELECT provenance->>'_account' AS account, count(*)::int AS n
       FROM canonical.messages
      WHERE is_synthetic = false AND provenance->>'_account' IS NOT NULL
      GROUP BY 1`,
  );
  const mirroredBy = new Map(mirrored.map((r) => [r.account, r.n]));

  const totals = withTotals
    ? await Promise.all(rows.map((a) => withTimeout(liveTotal(a), TOTAL_TIMEOUT_MS, null)))
    : rows.map(() => null);

  const accounts: SyncAccount[] = rows.map((a, i) => ({
    provider: a.provider,
    address: a.address,
    mailbox: a.mailbox_id,
    status: a.status,
    phase: phaseOf(a),
    mirrored: mirroredBy.get(a.address) ?? 0,
    mailboxTotal: totals[i],
    lastSyncedAt: a.last_synced_at,
    lastError: a.last_error,
  }));

  const counts = await embedCounts();
  const remaining = Math.max(0, counts.messages - counts.indexed);

  // throughput from the ledger: indexed-count deltas across recent embed runs
  const embedRuns = await query<{ at: string; meta: { indexed?: number } }>(
    `SELECT at::text, meta FROM app.audit_log
      WHERE action = 'embed.run' ORDER BY at DESC LIMIT 8`,
  );
  let ratePerMin: number | null = null;
  if (embedRuns.length >= 2) {
    const newest = embedRuns[0];
    const oldest = embedRuns[embedRuns.length - 1];
    const dIdx = Number(newest.meta?.indexed ?? 0) - Number(oldest.meta?.indexed ?? 0);
    const dMin = (new Date(newest.at).getTime() - new Date(oldest.at).getTime()) / 60_000;
    if (dIdx > 0 && dMin > 0.2) ratePerMin = Math.round(dIdx / dMin);
  }
  const etaMinutes = ratePerMin && remaining > 0 ? Math.max(1, Math.round(remaining / ratePerMin)) : null;

  // ── mail throughput, straight off the landing timestamps ──
  // 30 one-minute buckets. generate_series zero-fills the quiet minutes so the
  // chart shows a stall honestly instead of compressing it away.
  const mailHist = await query<{ minute: string; n: number }>(
    `WITH mins AS (
       SELECT generate_series(
                date_trunc('minute', now()) - interval '29 minutes',
                date_trunc('minute', now()),
                interval '1 minute') AS m
     )
     SELECT mins.m::text AS minute, COALESCE(count(l.ingest_key), 0)::int AS n
       FROM mins
       LEFT JOIN pipeline.ingest_log l
         ON date_trunc('minute', l.landed_at) = mins.m
      GROUP BY mins.m ORDER BY mins.m`,
  ).catch(() => [] as { minute: string; n: number }[]);

  // Rate = trailing 10 minutes. Short enough to react when a backfill finishes,
  // long enough that the gap between 4-minute rounds doesn't read as "stopped".
  const last10 = mailHist.slice(-10);
  const landed10 = last10.reduce((s, r) => s + r.n, 0);
  const mailRatePerMin = last10.length ? Math.round(landed10 / last10.length) : null;

  const mailMirrored = accounts.reduce((s, a) => s + a.mirrored, 0);
  // Only a denominator every account answered for is honest — one failed
  // provider ask would otherwise understate the total and overstate progress.
  const allTotalsKnown = accounts.length > 0 && accounts.every((a) => a.mailboxTotal !== null);
  const mailTotal = allTotalsKnown ? accounts.reduce((s, a) => s + (a.mailboxTotal ?? 0), 0) : null;
  const mailRemaining = mailTotal !== null ? Math.max(0, mailTotal - mailMirrored) : null;
  const mailEta =
    mailRatePerMin && mailRatePerMin > 0 && mailRemaining && mailRemaining > 0
      ? Math.max(1, Math.round(mailRemaining / mailRatePerMin))
      : null;

  const cal = await query<{ events: number }>(
    `SELECT count(*)::int AS events FROM app.calendar_events`,
  ).catch(() => [{ events: 0 }]);

  const lastRuns = await query<{ action: string; at: string }>(
    `SELECT action, max(at)::text AS at FROM app.audit_log
      WHERE action IN ('ingest.run','embed.run','ingest.calendar')
      GROUP BY action`,
  );
  const lastBy = new Map(lastRuns.map((r) => [r.action, r.at]));
  const lastIngestAt = lastBy.get("ingest.run") ?? null;
  const staleAfterMs = (2 * SCHED_CADENCE_MIN + 5) * 60_000;
  const stale = !lastIngestAt || Date.now() - new Date(lastIngestAt).getTime() > staleAfterMs;

  const recent = await query<{ at: string; action: string; meta: Record<string, unknown> }>(
    `SELECT at::text, action, meta FROM app.audit_log
      WHERE action IN ('ingest.run','embed.run','ingest.calendar','sync.manual')
      ORDER BY at DESC LIMIT 14`,
  );

  return {
    live: true,
    accounts,
    index: { ...counts, remaining, ratePerMin, etaMinutes },
    mail: {
      mirrored: mailMirrored,
      total: mailTotal,
      remaining: mailRemaining,
      ratePerMin: mailRatePerMin,
      etaMinutes: mailEta,
      history: mailHist,
    },
    calendar: { events: cal[0]?.events ?? 0, lastRunAt: lastBy.get("ingest.calendar") ?? null },
    scheduler: {
      lastIngestAt,
      lastEmbedAt: lastBy.get("embed.run") ?? null,
      cadenceMinutes: SCHED_CADENCE_MIN,
      stale,
    },
    recent: recent.map((r) => ({ at: r.at, action: r.action, summary: summarize(r.action, r.meta ?? {}) })),
  };
}
