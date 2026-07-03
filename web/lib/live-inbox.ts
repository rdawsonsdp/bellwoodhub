/*
 * live-inbox.ts — the LIVE (DATABASE_URL) providers behind /api/inbox and the
 * Wall/Queue assemblers. Reads canonical.* only, returns the exact shapes the
 * demo provider serves so the UI cannot tell the branches apart. Honest-empty
 * rule (Go-Live week 1): no rows → zeros/empty arrays, never fixtures.
 *
 * Server-only: imports lib/db. The providers (wall.ts, queue.ts, /api/inbox)
 * reach this module via dynamic import on the live branch, so the demo module
 * graph — and the keyless deployed demo — is untouched.
 */
import { query } from "./db";
import { snippetText } from "./clean-text";
import { deriveStream } from "./topics";
import { emailCategory, type EmailCat, type MessageMeta } from "./demo";
import { AgentRunOutputZ, type AgentRun } from "./agent-run";
import type { StreamKey } from "./types";

const TENANT = "00000000-0000-0000-0000-000000000001";

// ── /api/inbox live branch ───────────────────────────────────────────────────

export interface LiveInboxEmail {
  messageId: string; fromName: string | null; subject: string | null; snippet: string;
  date: string; stream: StreamKey; topic: string | null; cat: EmailCat; mailbox: string;
}

/** Recent inbox feed over canonical.messages — same shape as demoInbox().
 *  canonical.messages has no mailbox column yet (the wall is stamped at ingest
 *  when the Gmail connector lands, docs/EMAIL_INGESTION.md §5) — every live row
 *  today is the gov Outlook mailbox. A "biz" request returns honestly empty
 *  rather than leaking gov rows across the wall. */
export async function liveInbox(limit = 80, mailbox = "gov"): Promise<{
  count: number; emails: LiveInboxEmail[]; counts: Record<string, number>; mailbox: string;
}> {
  const counts: Record<string, number> = { urgent: 0, important: 0, social: 0, spam: 0 };
  if (mailbox !== "gov") return { count: 0, emails: [], counts, mailbox };

  const rows = await query<{
    source_ref: string; from_name: string | null; from_email: string | null;
    subject: string | null; snippet: string; sent_at: Date; topic: string | null;
  }>(
    `SELECT m.source_ref, m.from_name, m.from_email, m.subject,
            LEFT(m.clean_body, 600) AS snippet, m.sent_at,
            (SELECT t.topic FROM canonical.message_topics t
              WHERE t.message_id = m.message_id ORDER BY t.confidence DESC LIMIT 1) AS topic
       FROM canonical.messages m
      WHERE m.tenant_id = $1 AND m.direction = 'inbound'
      ORDER BY m.sent_at DESC LIMIT $2`,
    [TENANT, limit],
  ); // 600 chars in: newsletters open with link blocks — snippetText needs headroom to find prose
  const [{ n: total }] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM canonical.messages
      WHERE tenant_id = $1 AND direction = 'inbound'`,
    [TENANT],
  );
  const emails: LiveInboxEmail[] = rows.map((r) => {
    const stream = deriveStream(r.topic, r.from_email);
    return {
      messageId: r.source_ref, fromName: r.from_name, subject: r.subject,
      snippet: snippetText(r.snippet), // de-noise: invisible chars, URL soup, link-only lines
      date: r.sent_at.toISOString(), stream, topic: r.topic,
      cat: emailCategory(r.topic, stream, r.subject), mailbox: "gov",
    };
  });
  for (const e of emails) if (e.cat in counts) counts[e.cat]++;
  return { count: total, emails, counts, mailbox };
}

// ── Wall/Queue live inputs ───────────────────────────────────────────────────

/** Each agent's latest run from canonical.agent_runs (migrations/002). A row
 *  whose output no longer parses is skipped loudly — a malformed run must never
 *  render, and one bad row must never blank the Wall. */
export async function liveLatestRuns(): Promise<AgentRun[]> {
  const rows = await query<{ agent_key: string; ran_at: Date; output: unknown }>(
    `SELECT DISTINCT ON (agent_key) agent_key, ran_at, output
       FROM canonical.agent_runs
      ORDER BY agent_key, ran_at DESC`,
  );
  const runs: AgentRun[] = [];
  for (const r of rows) {
    const parsed = AgentRunOutputZ.safeParse(r.output);
    if (!parsed.success) {
      console.error(`[live-inbox] agent_runs.${r.agent_key}: output failed validation — skipped`);
      continue;
    }
    runs.push({ agentKey: r.agent_key, ranAt: r.ran_at.toISOString(), output: parsed.data });
  }
  return runs;
}

/** Per-message metadata for cited source_refs — the live counterpart of
 *  demoMessageMeta(). Ids with no canonical row stay absent from the map; the
 *  assemblers already fall back to id-as-label and id-as-thread. */
export async function liveMessageMeta(ids: string[]): Promise<Map<string, MessageMeta>> {
  const map = new Map<string, MessageMeta>();
  if (!ids.length) return map;
  const rows = await query<{
    source_ref: string; thread_id: string; subject: string | null;
    from_name: string | null; sent_at: Date; direction: string;
  }>(
    `SELECT source_ref, thread_id, subject, from_name, sent_at, direction
       FROM canonical.messages
      WHERE tenant_id = $1 AND source_ref = ANY($2)`,
    [TENANT, ids],
  );
  for (const r of rows) {
    if (map.has(r.source_ref)) continue;
    map.set(r.source_ref, {
      messageId: r.source_ref,
      threadId: r.thread_id || r.source_ref,
      subject: r.subject,
      fromName: r.from_name,
      date: r.sent_at.toISOString(),
      // MessageMeta is binary; 'internal' ranks with outbound (not the story lead)
      direction: r.direction === "inbound" ? "inbound" : "outbound",
    });
  }
  return map;
}
