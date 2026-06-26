/*
 * capabilities.ts — Phase-0 capability agents. Each reads ONLY canonical (R1).
 *
 *  needsYouToday() — the descoped "Needs You Today" precursor to the Morning
 *    Brief: newest inbound awaiting a reply, open issues (folded from events),
 *    and new high-sensitivity inbound. Read-only; every line cites a source;
 *    empty sections are stated, not omitted (R4 honest-gap on the digest path).
 *
 *  draftReply() — DRAFTS a reply and returns an approval envelope. It NEVER
 *    sends (R3): the envelope carries requiresHuman:true so the real approver
 *    is a one-function swap. Agents draft; the Mayor decides.
 */
import { query } from "./db";
import { complete } from "./agents/claude";
import { getEmailByMessageId, searchSources } from "./retrieval-canonical";
import type { StreamKey } from "./types";

const TENANT = "00000000-0000-0000-0000-000000000001";

function streamFromSource(source: string | null): StreamKey {
  switch (source) {
    case "police": return "Police";
    case "fire": return "Fire/EMS";
    case "business": return "Business";
    case "interdept": return "Interdepartmental";
    case "civic": return "Civic/FOIA";
    default: return "Resident";
  }
}

export interface BriefItem {
  messageId: string;
  subject: string | null;
  fromName: string | null;
  date: string;
  stream: StreamKey;
  why: string;
}
export interface NeedsYouToday {
  generatedAt: string;
  awaitingReply: BriefItem[];
  openIssues: BriefItem[];
  highSensitivity: BriefItem[];
}

export async function needsYouToday(): Promise<NeedsYouToday> {
  // newest inbound whose thread's latest message is still inbound (awaiting your reply)
  const awaiting = await query<{ source_ref: string; subject: string | null; from_name: string | null; sent_at: Date; source: string }>(
    `WITH latest AS (
       SELECT DISTINCT ON (m.thread_id) m.thread_id, m.source_ref, m.subject, m.from_name, m.sent_at, m.direction, m.source
       FROM canonical.messages m WHERE m.tenant_id = $1
       ORDER BY m.thread_id, m.sent_at DESC
     )
     SELECT source_ref, subject, from_name, sent_at, source FROM latest
      WHERE direction = 'inbound' ORDER BY sent_at DESC LIMIT 8`,
    [TENANT],
  );
  const openIssues = await query<{ source_ref: string | null; title: string; issue_type: string; last_activity_at: Date | null; source: string | null }>(
    `SELECT s.title, s.issue_type, s.last_activity_at,
            (SELECT m.source_ref FROM canonical.messages m JOIN canonical.threads t ON t.thread_id = m.thread_id
              WHERE t.issue_id = s.issue_id ORDER BY m.sent_at DESC LIMIT 1) AS source_ref,
            (SELECT m.source FROM canonical.messages m JOIN canonical.threads t ON t.thread_id = m.thread_id
              WHERE t.issue_id = s.issue_id ORDER BY m.sent_at DESC LIMIT 1) AS source
       FROM canonical.issue_state s
      WHERE s.tenant_id = $1 AND s.state = 'open'
      ORDER BY s.last_activity_at DESC NULLS LAST LIMIT 8`,
    [TENANT],
  );
  const sensitive = await query<{ source_ref: string; subject: string | null; from_name: string | null; sent_at: Date; source: string }>(
    `SELECT source_ref, subject, from_name, sent_at, source
       FROM canonical.messages
      WHERE tenant_id = $1 AND direction = 'inbound' AND sensitivity = 'restricted'
      ORDER BY sent_at DESC LIMIT 5`,
    [TENANT],
  );
  return {
    generatedAt: new Date().toISOString(),
    awaitingReply: awaiting.map((r) => ({
      messageId: r.source_ref, subject: r.subject, fromName: r.from_name,
      date: r.sent_at.toISOString(), stream: streamFromSource(r.source), why: "awaiting your reply",
    })),
    openIssues: openIssues.map((r) => ({
      messageId: r.source_ref ?? "", subject: r.title, fromName: null,
      date: (r.last_activity_at ?? new Date(0)).toISOString(), stream: streamFromSource(r.source),
      why: `open issue · ${r.issue_type}`,
    })),
    highSensitivity: sensitive.map((r) => ({
      messageId: r.source_ref, subject: r.subject, fromName: r.from_name,
      date: r.sent_at.toISOString(), stream: streamFromSource(r.source), why: "new high-sensitivity inbound",
    })),
  };
}

export interface DraftEnvelope {
  status: "pending_approval";
  requiresHuman: true;
  action: "send_email";
  toMessageId: string;
  recipients: string | null;
  subject: string;
  draft: string;
  rationale: string;
}

const DRAFT_SYSTEM = `You draft email replies in the Mayor of Bellwood's voice: warm but busy, sets expectations, routes to the right department, follows up personally on what matters. Use ONLY the provided context. If you lack a fact, say what you'd need rather than inventing it. Output only the reply body — no subject line, no salutation placeholders beyond a first name.`;

/** Draft a reply. NEVER sends — returns an approval-pending envelope (R3). */
export async function draftReply(messageId: string, intent?: string): Promise<DraftEnvelope> {
  const em = await getEmailByMessageId(messageId);
  if (!em) throw new Error(`No message with id ${messageId}`);
  const ctx = await searchSources(`${em.subject ?? ""} ${em.fromName ?? ""}`, { k: 4 });
  const context = ctx.sources.map((s) => `- ${s.date.slice(0, 10)}: ${s.snippet}`).join("\n");
  const draft = await complete({
    task: "draft",
    system: DRAFT_SYSTEM,
    user:
      `Incoming message from ${em.fromName ?? em.fromEmail}:\nSubject: ${em.subject ?? ""}\n\n${em.bodyClean}\n\n` +
      (intent ? `Desired intent of the reply: ${intent}\n\n` : "") +
      `Relevant prior context:\n${context || "(none on file)"}`,
    maxTokens: 500,
  });
  return {
    status: "pending_approval",
    requiresHuman: true,
    action: "send_email",
    toMessageId: messageId,
    recipients: em.fromEmail,
    subject: em.subject?.toLowerCase().startsWith("re:") ? em.subject : `Re: ${em.subject ?? ""}`,
    draft,
    rationale: "Drafted from the original message + linked records. Not sent — awaiting your approval.",
  };
}
