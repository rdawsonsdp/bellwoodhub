/*
 * run.ts — the triage pass. Server-only (touches the DB).
 *
 * A system-level pass over the tenant's mail, NOT an agent: it reads structured
 * thread facts + one batched Haiku call for soft signals, buckets every thread,
 * ranks the needs_reply items by the named weights, and upserts one current row
 * per thread. Re-running REPLACES the tenant's rows (idempotent — BUG-2's
 * lesson), never accumulates.
 *
 * Cost is bounded on purpose: only inbound mail from non-automated senders needs
 * the model (outbound → awaiting_others, no-reply senders → fyi, both decided in
 * code). And the pass is windowed to recent threads — a six-month-old thread is
 * not "needs you now".
 */
import { query } from "../db";
import { TENANT_ID } from "../tenant";

// canonical.messages.tenant_id — the synthetic single-tenant UUID the whole
// codebase pins to (agent-runner.ts, capabilities.ts). Distinct from TENANT_ID,
// which is the app tenant NAME ("bellwood"/"brownsugar") stored in the text
// `tenant` column. Data isolation between customers is per-Supabase-project, so
// one canonical tenant_id per DB is correct.
const CANON_TENANT = "00000000-0000-0000-0000-000000000001";
import { classifyThread, type ThreadFacts, type SoftSignals } from "./signals";
import { buildReason } from "./reason";
import { softSignalsBatch, SOFT_BATCH } from "./soft-signals";
import { SENDER_SEEDS, type ImportantSender } from "./senders";

/** How far back to consider threads. Older mail isn't actionable "now". */
const WINDOW_DAYS = 45;
/** Safety cap on threads per pass (bounds model calls). */
const MAX_THREADS = 400;
const FYI_SENDER = /(no-?reply|do-?not-?reply|notifications?|newsletter|mailer|updates?@|noreply@|automated|postmaster|bounce|marketing@|substack\.com|mailchimp|sendgrid|@mail\.|@email\.|@e\.|@em\.|@news\.|@marketing\.|@info\.|@go\.|@try\.|@get\.|hello@|team@|demand@)/i;

interface ThreadRow {
  message_id: string;
  direction: "inbound" | "outbound" | "internal";
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  sent_at: string;
  snippet: string | null;
  inbound_streak: number;
}

/** Load the tenant's important-senders list, seeding defaults on first run so
 *  ranking works day one. Exec edits are additive on top. */
export async function loadImportantSenders(tenant = TENANT_ID): Promise<ImportantSender[]> {
  const rows = await query<{ match: string; label: string }>(
    `SELECT match, label FROM app.important_senders WHERE tenant = $1 ORDER BY created_at`,
    [tenant],
  ).catch(() => [] as { match: string; label: string }[]);
  if (rows.length) return rows.map((r) => ({ match: r.match, label: r.label }));

  // seed once
  const seeds = SENDER_SEEDS[tenant] ?? [];
  for (const s of seeds) {
    await query(
      `INSERT INTO app.important_senders (tenant, match, label, seeded)
       VALUES ($1, $2, $3, true) ON CONFLICT (tenant, match) DO NOTHING`,
      [tenant, s.match, s.label],
    ).catch(() => {});
  }
  return seeds;
}

export interface TriageRunResult {
  tenant: string;
  threads: number;
  needsReply: number;
  awaitingOthers: number;
  fyi: number;
}

/** Run the whole pass for the active tenant. `now` injected for testing. */
export async function runTriage(now: Date = new Date()): Promise<TriageRunResult> {
  const tenant = TENANT_ID;
  const important = await loadImportantSenders(tenant);
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();

  // Latest message per thread + inbound streak since the last exec reply.
  const rows = await query<ThreadRow>(
    `WITH scoped AS (
       SELECT m.message_id, m.thread_id, m.direction, m.from_email, m.from_name,
              m.subject, m.sent_at, LEFT(m.clean_body, 400) AS snippet,
              COALESCE(m.thread_id::text, m.message_id::text) AS tkey
         FROM canonical.messages m
        WHERE m.tenant_id = $1
          AND COALESCE(m.provenance->>'_mailbox','gov') = 'gov'
          AND m.sent_at >= $2
     ),
     last_out AS (
       SELECT tkey, max(sent_at) AS ts FROM scoped WHERE direction = 'outbound' GROUP BY tkey
     ),
     latest AS (
       SELECT DISTINCT ON (tkey) tkey, message_id, direction, from_email, from_name,
              subject, sent_at, snippet
         FROM scoped ORDER BY tkey, sent_at DESC
     ),
     streak AS (
       SELECT s.tkey,
              count(*) FILTER (
                WHERE s.direction = 'inbound' AND (lo.ts IS NULL OR s.sent_at > lo.ts)
              ) AS inbound_streak
         FROM scoped s LEFT JOIN last_out lo USING (tkey)
        GROUP BY s.tkey
     )
     SELECT l.message_id, l.direction, l.from_email, l.from_name, l.subject,
            l.sent_at::text AS sent_at, l.snippet, s.inbound_streak
       FROM latest l JOIN streak s USING (tkey)
      ORDER BY l.sent_at DESC
      LIMIT $3`,
    [CANON_TENANT, since, MAX_THREADS],
  );

  // Only inbound mail from non-automated senders needs the model. Everything
  // else buckets deterministically with no call.
  const needsModel = rows.filter((r) => r.direction === "inbound" && !FYI_SENDER.test(r.from_email ?? ""));
  const soft = new Map<string, SoftSignals>();
  const todayISO = now.toISOString().slice(0, 10);
  for (let i = 0; i < needsModel.length; i += SOFT_BATCH) {
    const batch = needsModel.slice(i, i + SOFT_BATCH).map((r) => ({
      id: r.message_id, subject: r.subject, from: r.from_email, snippet: r.snippet ?? "",
    }));
    const res = await softSignalsBatch(batch, todayISO);
    res.forEach((v, k) => soft.set(k, v));
  }

  // Classify + score every thread.
  type Scored = { row: ThreadRow; res: ReturnType<typeof classifyThread>; reason: string };
  const scored: Scored[] = rows.map((r) => {
    const facts: ThreadFacts = {
      messageId: r.message_id, fromEmail: r.from_email, fromName: r.from_name,
      subject: r.subject, direction: r.direction, sentAt: r.sent_at,
      inboundStreak: Number(r.inbound_streak) || 0, bodyText: r.snippet,
    };
    const s = soft.get(r.message_id) ?? { explicitDeadline: null, informationalOnly: false };
    const res = classifyThread(facts, s, important, now);
    return { row: r, res, reason: buildReason(res) };
  });

  // Rank needs_reply by score desc; nulls elsewhere.
  const needs = scored.filter((s) => s.res.bucket === "needs_reply").sort((a, b) => b.res.score - a.res.score);
  const rankOf = new Map<string, number>();
  needs.forEach((s, i) => rankOf.set(s.row.message_id, i + 1));

  // Idempotent write: replace this tenant's rows wholesale.
  await query(`DELETE FROM app.message_triage WHERE tenant = $1`, [tenant]);
  for (const s of scored) {
    await query(
      `INSERT INTO app.message_triage
         (message_id, tenant, bucket, rank, score, signals, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s.row.message_id, tenant, s.res.bucket,
        rankOf.get(s.row.message_id) ?? null, s.res.score,
        JSON.stringify(s.res.signals), s.reason,
      ],
    ).catch(() => {});
  }

  return {
    tenant,
    threads: scored.length,
    needsReply: needs.length,
    awaitingOthers: scored.filter((s) => s.res.bucket === "awaiting_others").length,
    fyi: scored.filter((s) => s.res.bucket === "fyi").length,
  };
}
