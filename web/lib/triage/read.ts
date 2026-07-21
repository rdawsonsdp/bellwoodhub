/*
 * read.ts — the triage read path. Applies corrections as a READ-TIME override
 * on top of the pure computed triage, so the classification stays pure and every
 * correction is separately auditable and reversible (same shape as
 * app.agent_configs.overrides). Corrections take effect on re-render WITHOUT
 * re-running the pass.
 */
import { query } from "../db";
import { TENANT_ID } from "../tenant";

export interface TriageItem {
  /** canonical message_id — the internal key corrections are recorded against. */
  messageId: string;
  /** RFC source_ref — the id the email viewer (/api/email → getEmailByMessageId)
   *  resolves by. THIS is what "Open →" must pass; messageId won't resolve. */
  sourceRef: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  sentAt: string;
  bucket: "needs_reply" | "awaiting_others" | "fyi";
  rank: number | null;
  score: number;
  reason: string;
  /** the exec's latest correction on this item, if any */
  correction: string | null;
}

export interface TriageView {
  needsReply: TriageItem[];
  awaitingOthers: TriageItem[];
  fyi: TriageItem[];
  classifiedAt: string | null;
}

/**
 * Read triage for the active tenant with corrections applied:
 *   not_important    → drop from needs_reply (show under fyi)
 *   not_waiting_on_me→ move to awaiting_others
 *   bump_up          → force to top of needs_reply
 */
export async function readTriage(tenant = TENANT_ID): Promise<TriageView> {
  const rows = await query<{
    message_id: string; source_ref: string; bucket: TriageItem["bucket"]; rank: number | null;
    score: string; reason: string; classified_at: string;
    subject: string | null; from_name: string | null; from_email: string | null; sent_at: string;
    correction: string | null;
  }>(
    `SELECT t.message_id, m.source_ref, t.bucket, t.rank, t.score, t.reason, t.classified_at::text,
            m.subject, m.from_name, m.from_email, m.sent_at::text,
            (SELECT c.correction FROM app.triage_corrections c
              WHERE c.tenant = t.tenant AND c.message_id = t.message_id
              ORDER BY c.created_at DESC LIMIT 1) AS correction
       FROM app.message_triage t
       JOIN canonical.messages m ON m.message_id = t.message_id
      WHERE t.tenant = $1`,
    [tenant],
  ).catch(() => []);

  const items: TriageItem[] = rows.map((r) => ({
    messageId: r.message_id,
    sourceRef: r.source_ref,
    subject: r.subject, fromName: r.from_name, fromEmail: r.from_email, sentAt: r.sent_at,
    bucket: r.bucket, rank: r.rank, score: Number(r.score), reason: r.reason,
    correction: r.correction,
  }));

  const needsReply: TriageItem[] = [];
  const awaitingOthers: TriageItem[] = [];
  const fyi: TriageItem[] = [];
  const bumped: TriageItem[] = [];

  for (const it of items) {
    // corrections override the computed bucket at display time
    if (it.correction === "not_important") { fyi.push(it); continue; }
    if (it.correction === "not_waiting_on_me") { awaitingOthers.push(it); continue; }
    if (it.bucket === "needs_reply") {
      if (it.correction === "bump_up") bumped.push(it);
      else needsReply.push(it);
      continue;
    }
    if (it.bucket === "awaiting_others") awaitingOthers.push(it);
    else fyi.push(it);
  }

  // computed rank order within needs_reply; bumped items pinned to the top.
  needsReply.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const ordered = [...bumped.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)), ...needsReply];

  return {
    needsReply: ordered,
    awaitingOthers: awaitingOthers.sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    fyi: fyi.sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    classifiedAt: rows[0]?.classified_at ?? null,
  };
}
