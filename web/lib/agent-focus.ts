/*
 * agent-focus.ts — FOCUS: what an agent watches for, written in plain English.
 *
 * The runner's normal slice is a TIME WINDOW: new mail since the last run
 * (lib/agent-runner.ts fetchAgentSlice). That answers "what landed today" but
 * cannot answer "find every red-light citation" — a standing instruction whose
 * evidence is spread across the whole record, most of it older than the cursor.
 *
 * Focus is the second retrieval mode. The operator writes what to watch for;
 * we embed that text once (Voyage query vector) and pull the record's best
 * matches by cosine — no time cursor, no topic label. That matters here: the
 * live ingest path stops at step 2 of 5 (api/cron/ingest-email/route.ts), so
 * canonical.message_topics is never written on live mail and there is no
 * "ticket" label to filter on. Semantic match is what the record can actually
 * support, and it generalises: a new department needs a sentence, not a new
 * StreamKey + regex + deploy.
 *
 * SOURCE-AGNOSTIC BY CONSTRUCTION: focus text says WHAT to look for, never
 * WHERE. Today every row lives in canonical.messages because email is the only
 * connector; when an FTP/SFTP drop lands it writes the same canonical rows and
 * focus keeps working untouched.
 *
 * The mailbox wall (DEC-6) holds here exactly as it does in fetchRelatedContext:
 * a walled agent searches only its own mailbox, and a government agent never
 * sees private business mail — semantic similarity must not be the seam that
 * bridges what ingest deliberately separated.
 */
import { query } from "./db";
import { embedQuery } from "./agents/voyage";
import { plan } from "./planner";
import type { DomainAgent } from "./domain-agents";
import type { AgentSliceMessage } from "./agent-run";

// same tenant scoping as lib/agent-runner.ts, lib/capabilities.ts
const TENANT = "00000000-0000-0000-0000-000000000001";

/** Hard cap on focus hits joining a run — prompt budget, same spirit as the
 *  24-line cap on related background. */
export const FOCUS_LIMIT = 12;

/**
 * Similarity floors. Cosine top-N always returns SOMETHING — the nearest rows
 * exist whether or not they are relevant — so without a floor an instruction
 * that matches nothing still hands the agent twelve confident-looking rows to
 * summarize. Measured on the live corpus 2026-07-18:
 *
 *   "invoices and payment requests"   → 0.35–0.41  (all genuine receipts)
 *   "meeting invitations"             → 0.46–0.50  (all genuine invites)
 *   "anything urgent needing a reply" → 0.33–0.41  (marketing copy; nothing real)
 *
 * The bands overlap, so no single cutoff cleanly separates good from bad. Two
 * complementary rules instead:
 * MIN_SCORE is an absolute floor that drops obvious noise. It earns its place:
 * "red light camera citations" against a mailbox containing none returns
 * NOTHING with the floor, and six confident-looking unrelated emails without it.
 *
 * A "weak match" flag keyed on the top score was tried and REMOVED: invoices
 * (genuinely correct, top 0.41) and "anything urgent needing a reply"
 * (genuinely garbage, top 0.41) are indistinguishable by score. Any cutoff that
 * catches the second mislabels the first. Score is a poor proxy for whether an
 * instruction was well-posed — the preview showing real subjects and senders is
 * the honest signal, and the operator reads it in a second.
 */
export const MIN_SCORE = 0.30;

/** The mailbox a given agent is allowed to read. Mirrors the provenance
 *  convention stamped at ingest (`_mailbox`, default 'gov'). */
export const mailboxOf = (agent: Pick<DomainAgent, "walled">) => (agent.walled ? "biz" : "gov");

/** Read the operator's focus text out of an agent_configs.overrides blob.
 *  Absent/blank → null (the agent runs on its time window alone). */
export function focusOf(overrides: unknown): string | null {
  if (!overrides || typeof overrides !== "object") return null;
  const f = (overrides as { focus?: unknown }).focus;
  return typeof f === "string" && f.trim() ? f.trim() : null;
}

export interface FocusHit extends AgentSliceMessage {
  /** cosine similarity (1 = identical) — surfaced in the preview so the
   *  operator can see WHY something matched before trusting the digest. */
  score: number;
}

/**
 * Messages anywhere in the record that match this agent's focus text.
 *
 * Deliberately has NO time cursor: "every red-light citation" means every one,
 * not the ones that arrived since the last hourly run. Dedup is by message —
 * a long email chunks into many rows and we want the message once, at its best
 * chunk's score.
 */
export async function fetchFocusSlice(
  agent: Pick<DomainAgent, "key" | "walled">,
  focus: string,
  limit = FOCUS_LIMIT,
  /** Connector accounts this desk reads (provenance._account). Empty/omitted =
   *  every source in its lane. NARROWS within the mailbox wall, never across
   *  it — the lane filter below runs regardless, and this is an extra AND. */
  sources: string[] = [],
): Promise<FocusHit[]> {
  const vec = await embedQuery(focus);
  type Row = {
    source_ref: string;
    thread_id: string | null;
    sent_at: Date;
    from_name: string | null;
    from_email: string | null;
    subject: string | null;
    topic: string | null;
    snippet: string | null;
    score: number;
  };
  const rows = await query<Row>(
    `SELECT m.source_ref, m.thread_id, m.sent_at, m.from_name, m.from_email, m.subject,
            (SELECT mt.topic FROM canonical.message_topics mt
              WHERE mt.message_id = m.message_id LIMIT 1) AS topic,
            LEFT(m.clean_body, 400) AS snippet,
            MAX(1 - (c.embedding <=> $1::vector)) AS score
       FROM canonical.chunks c
       JOIN canonical.messages m ON m.message_id = c.message_id
      WHERE m.tenant_id = $2
        AND c.embedding IS NOT NULL
        AND COALESCE(m.provenance->>'_mailbox', 'gov') = $3
        AND ($6::text[] IS NULL OR cardinality($6::text[]) = 0
             OR m.provenance->>'_account' = ANY($6::text[]))
      GROUP BY m.source_ref, m.thread_id, m.sent_at, m.from_name, m.from_email,
               m.subject, m.message_id, m.clean_body
     HAVING MAX(1 - (c.embedding <=> $1::vector)) >= $5
      ORDER BY score DESC
      LIMIT $4`,
    [JSON.stringify(vec), TENANT, mailboxOf(agent), limit, MIN_SCORE, sources],
  );
  return rows.map((r) => ({
    messageId: r.source_ref,
    threadId: r.thread_id,
    date: r.sent_at.toISOString(),
    fromName: r.from_name,
    fromEmail: r.from_email,
    subject: r.subject,
    topic: r.topic,
    snippet: r.snippet ?? "",
    score: Number(r.score),
  }));
}

/**
 * fetchFocusSlicePlanned — the SAME agent focus retrieval, but backed by the
 * 3-pass fused planner (lib/planner.ts) instead of semantic-only cosine.
 *
 * WHY. The Ask path uses plan() — structured filters + a graph walk over
 * resolved entities + semantic kNN, fused with RRF — and in live testing it
 * handled date reasoning and enumeration that semantic-only missed. Agents were
 * stuck on the weaker fetchFocusSlice. This routes them through the same
 * retrieval so a desk sees what Ask sees.
 *
 * TWO GUARDS THIS ADDS THAT plan() DOES NOT ENFORCE ITSELF:
 *   1. THE MAILBOX WALL. plan() filters only by tenant_id — it will happily
 *      return walled business mail. Routing a government agent through it
 *      unguarded would leak biz→gov (DEC-6 / FOIA). So every candidate is
 *      re-checked against the agent's lane here; a source that isn't in the
 *      agent's lane is dropped, full stop. This guard is the safety net
 *      regardless of what the planner returns.
 *   2. SOURCE (account) SCOPE. A created agent scoped to specific connector
 *      accounts (app.agents.sources) only sees those; plan() knows nothing of
 *      it, so it's applied here too.
 *
 * MIN_SCORE is kept: plan()'s Source.score is cosine (1 − distance), so the same
 * floor still protects the empty-match case (a query with no real hits returns
 * nothing rather than the planner's nearest-but-irrelevant rows).
 */
export async function fetchFocusSlicePlanned(
  agent: Pick<DomainAgent, "key" | "walled">,
  focus: string,
  limit = FOCUS_LIMIT,
  sources: string[] = [],
): Promise<FocusHit[]> {
  // Ask the fused planner for a generous candidate set — we'll trim after the
  // wall/account/score guard, so over-fetch to survive the filtering.
  const result = await plan(focus, { k: Math.max(limit * 2, 20) });
  const candidates = result.sources;
  if (!candidates.length) return [];

  // Guard: which candidate source_refs are actually in this agent's lane and
  // (if scoped) its accounts. THIS is the wall — plan() didn't apply it.
  const refs = candidates.map((s) => s.messageId);
  const allowed = await query<{ source_ref: string }>(
    `SELECT source_ref FROM canonical.messages
      WHERE tenant_id = $1
        AND source_ref = ANY($2::text[])
        AND COALESCE(provenance->>'_mailbox','gov') = $3
        AND ($4::text[] IS NULL OR cardinality($4::text[]) = 0
             OR provenance->>'_account' = ANY($4::text[]))`,
    [TENANT, refs, mailboxOf(agent), sources],
  ).catch(() => [] as { source_ref: string }[]);
  const ok = new Set(allowed.map((r) => r.source_ref));

  return candidates
    .filter((s) => ok.has(s.messageId) && s.score >= MIN_SCORE)
    .slice(0, limit)
    .map((s) => ({
      messageId: s.messageId,
      threadId: s.threadId,
      date: s.date,
      fromName: s.fromName,
      fromEmail: s.fromEmail,
      subject: s.subject,
      topic: s.topic,
      snippet: s.snippet,
      score: s.score,
    }));
}
