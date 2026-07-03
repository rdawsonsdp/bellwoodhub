import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { DEMO } from "@/lib/demo";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { graphConnector } from "@/lib/connectors/graph";
import { gmailConnector } from "@/lib/connectors/gmail";
import { getRefreshToken } from "@/lib/connectors/token-store";
import type { PulledMessage } from "@/lib/connectors/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full pull is up to CAP messages × N accounts

// The incremental email ingest (ING stages 3–4, Go-Live L1.4): for every
// 'active' pipeline.connector_accounts row, refresh the token, pull since the
// stored cursor (Graph deltaLink / Gmail historyId), and LAND each message —
// immutable RAW + ingest_log + staged + canonical upsert keyed on
// (source, source_ref), mirroring pipeline/medallion.py. Idempotent: re-runs
// are no-ops. An account that fails flips to status='error' and the loop
// continues — one bad token never stalls the fleet. Gated exactly like
// cron/agent-runs.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return false;
}

const TENANT = "00000000-0000-0000-0000-000000000001";
const SOURCE = "email"; // real mail (vs synthetic_email); streams stay read-time
const CAP = 200; // messages per batch — the inner loop below strings batches together
// One run keeps pulling batches until the account is caught up or the time
// budget is spent (RD 2026-07-03: "the sync job should sync every mail
// record") — the cursor lands after EVERY batch, so an interrupted run
// resumes exactly where it stopped. Budget stays under maxDuration=300.
const RUN_BUDGET_MS = 210_000;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
// parity with ingest/envelope.py ingest_key(): sha256(source + "\x00" + source_ref)
const ingestKey = (source: string, sourceRef: string) => sha256(`${source}\x00${sourceRef}`);

interface AccountRow {
  id: string;
  provider: "outlook" | "gmail";
  address: string;
  mailbox_id: string;
  cursor: string | null;
}

/** Land one pulled message: RAW → ingest_log → staged → canonical. Returns
 *  'skipped' when the identical payload is already landed (idempotent re-run). */
async function landMessage(m: PulledMessage, mailboxId: string): Promise<"landed" | "skipped"> {
  const ik = ingestKey(SOURCE, m.sourceRef);
  const payload = JSON.stringify(m);
  const chk = sha256(payload);

  // RAW: same key + checksum → skip; differing checksum → new version (never overwrite)
  const existing = await query<{ raw_id: string; checksum: string; version: number }>(
    `SELECT raw_id, checksum, version FROM pipeline.raw_objects
      WHERE ingest_key = $1 ORDER BY version DESC LIMIT 1`,
    [ik],
  );
  if (existing[0] && existing[0].checksum === chk) return "skipped";
  const version = existing[0] ? existing[0].version + 1 : 1;
  const raw = await query<{ raw_id: string }>(
    `INSERT INTO pipeline.raw_objects (tenant_id, ingest_key, source, source_ref, version, checksum, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING raw_id`,
    [TENANT, ik, SOURCE, m.sourceRef, version, chk, payload],
  );
  const rawId = raw[0].raw_id;
  await query(
    `INSERT INTO pipeline.ingest_log (ingest_key, tenant_id, source, source_ref, state, raw_ref)
     VALUES ($1, $2, $3, $4, 'landed', $5)
     ON CONFLICT (ingest_key) DO UPDATE SET raw_ref = EXCLUDED.raw_ref, state = 'landed', updated_at = NOW()`,
    [ik, TENANT, SOURCE, m.sourceRef, rawId],
  );

  // Minimal normalize: bodyText stands in for clean_text (the quote/sig
  // stripper is Python-only — clean_text.py); stage-5 parity replays from RAW.
  const cleanBody = (m.bodyText ?? "").trim();
  const provenance = JSON.stringify({
    _mailbox: mailboxId, // gov = public record, biz = walled (DEC-6)
    _provider: m.provider,
    _account: m.address,
    _has_attachments: m.hasAttachments,
    _connector: "ts-incremental",
  });
  await query(
    `INSERT INTO pipeline.staged_messages
       (ingest_key, tenant_id, source, source_ref, thread_ref, direction, sent_at,
        subject, from_name, from_email, to_email, cc, clean_body, provenance, raw_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (ingest_key) DO UPDATE SET
       thread_ref = EXCLUDED.thread_ref, direction = EXCLUDED.direction,
       sent_at = EXCLUDED.sent_at, subject = EXCLUDED.subject,
       from_name = EXCLUDED.from_name, from_email = EXCLUDED.from_email,
       to_email = EXCLUDED.to_email, cc = EXCLUDED.cc,
       clean_body = EXCLUDED.clean_body, provenance = EXCLUDED.provenance,
       raw_ref = EXCLUDED.raw_ref`,
    [ik, TENANT, SOURCE, m.sourceRef, m.threadRef, m.direction, m.sentAt,
     m.subject, m.fromName, m.fromEmail, m.toEmail, m.cc, cleanBody, provenance, rawId],
  );

  // Canonical: thread then message, both upserts (medallion.py shapes).
  // Identity resolution / topics / chunks are stage 5–7 — deliberately not here.
  const thread = await query<{ thread_id: string }>(
    `INSERT INTO canonical.threads (tenant_id, source, source_thread_ref, subject, first_seen, last_seen)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (tenant_id, source, source_thread_ref) DO UPDATE SET
       last_seen = GREATEST(canonical.threads.last_seen, EXCLUDED.last_seen),
       subject   = COALESCE(canonical.threads.subject, EXCLUDED.subject)
     RETURNING thread_id`,
    [TENANT, SOURCE, m.threadRef, m.subject, m.sentAt],
  );
  await query(
    `INSERT INTO canonical.messages
       (tenant_id, thread_id, source, source_ref, ingest_key, sent_at, direction,
        subject, from_name, from_email, to_email, cc, clean_body, raw_ref, is_synthetic, provenance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, $15)
     ON CONFLICT (source, source_ref) DO UPDATE SET
       thread_id = EXCLUDED.thread_id, ingest_key = EXCLUDED.ingest_key,
       sent_at = EXCLUDED.sent_at, direction = EXCLUDED.direction,
       subject = EXCLUDED.subject, from_name = EXCLUDED.from_name,
       from_email = EXCLUDED.from_email, to_email = EXCLUDED.to_email,
       cc = EXCLUDED.cc, clean_body = EXCLUDED.clean_body,
       raw_ref = EXCLUDED.raw_ref, is_synthetic = EXCLUDED.is_synthetic,
       provenance = EXCLUDED.provenance`,
    [TENANT, thread[0].thread_id, SOURCE, m.sourceRef, ik, m.sentAt, m.direction,
     m.subject, m.fromName, m.fromEmail, m.toEmail, m.cc, cleanBody, rawId, provenance],
  );
  await query(
    `UPDATE pipeline.ingest_log SET state = 'canonical', updated_at = NOW() WHERE ingest_key = $1`,
    [ik],
  );
  return "landed";
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (DEMO) {
      // fixtures serve the inbox in demo mode — there is nothing to pull
      return NextResponse.json({ ok: true, mode: "demo", note: "DEMO mode: fixture mail serves the app; live ingest requires DATABASE_URL + active connector_accounts rows." });
    }
    const accounts = await query<AccountRow>(
      `SELECT id, provider, address, mailbox_id, cursor
         FROM pipeline.connector_accounts WHERE status = 'active' ORDER BY created_at`,
    );
    const started = Date.now();
    const results: Record<string, unknown>[] = [];
    for (const a of accounts) {
      try {
        // token lives in Supabase Vault, resolved by ref (Gap 5.3) — never read inline
        const refreshToken = await getRefreshToken(a.id);
        if (!refreshToken) throw new Error("no refresh token on file — re-consent via sign-in");
        const connector = a.provider === "gmail" ? gmailConnector(a.address) : graphConnector(a.address);
        const { accessToken } = await connector.refreshAccessToken(refreshToken);
        let cursor = a.cursor;
        let pulled = 0;
        let landed = 0;
        let skipped = 0;
        // batch loop: cursor persists after every batch, so a timeout or crash
        // mid-account loses nothing — the next run resumes from the last batch
        do {
          const batch = await connector.pullSince(accessToken, cursor, CAP);
          for (const m of batch.messages) {
            if ((await landMessage(m, a.mailbox_id)) === "landed") landed++;
            else skipped++;
          }
          pulled += batch.messages.length;
          cursor = batch.nextCursor ?? cursor;
          await query(
            `UPDATE pipeline.connector_accounts
                SET cursor = $2, last_synced_at = NOW(), last_error = NULL WHERE id = $1`,
            [a.id, cursor],
          );
          if (batch.messages.length === 0) break; // caught up (or empty walk page)
        } while (cursor?.startsWith("bf:") && Date.now() - started < RUN_BUDGET_MS);
        results.push({ ok: true, provider: a.provider, account: a.address, pulled, landed, skipped, backfillRemaining: !!cursor?.startsWith("bf:") });
      } catch (err) {
        // flag the account, keep the fleet moving — never throw the whole route
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[/api/cron/ingest-email] ${a.provider}:${a.address}`, message);
        await query(
          `UPDATE pipeline.connector_accounts SET status = 'error', last_error = $2 WHERE id = $1`,
          [a.id, message.slice(0, 1000)],
        ).catch(() => {});
        results.push({ ok: false, provider: a.provider, account: a.address, error: message });
      }
    }
    // per-run counts live in the audit ledger; pipeline.ingest_log stays the
    // per-message state machine (its PK is ingest_key, not a run id)
    void logAudit({ actor: null, action: "ingest.run", meta: { accounts: accounts.length, results } });
    return NextResponse.json({ ok: results.every((r) => r.ok), accounts: accounts.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/cron/ingest-email]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
