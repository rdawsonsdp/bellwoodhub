/*
 * planner.ts — the 3-pass + RRF retrieval planner over the canonical store.
 * This is graph-augmented RAG: the explicit model (issues/edges/commitments) is
 * the PRIMARY index; the vector store is the recall safety net.
 *
 *   Pass 1 STRUCTURED — topic/source/date/entity filters return the COMPLETE
 *                       candidate set (completeness = relational predicate, not
 *                       top-k). This makes "missing" a real signal for R4.
 *   Pass 2 GRAPH      — anchor entity/issue → about_property/discussed_in/
 *                       has_commitment → threads → messages + commitments.
 *   Pass 3 SEMANTIC   — kNN in-set ranking + an unrestricted straggler scan.
 *   FUSE              — Reciprocal Rank Fusion (k=60, weights 1/1/0.7).
 *   SYNTHESIS         — Claude Sonnet, a citation on every claim, gaps stated;
 *                       empty structured+semantic set short-circuits to "no
 *                       records" WITHOUT an LLM call (deterministic R4 guard).
 */
import { query, toVector } from "./db";
import { embedQuery } from "./agents/voyage";
import { complete } from "./agents/claude";
import { VOICE, HONESTY } from "./agents/voice";
import { snippetText } from "./clean-text";
import type { Source, StreamKey } from "./types";

const TENANT = "00000000-0000-0000-0000-000000000001";
const RRF_K = 60;
const W_STRUCTURED = 1.0;
const W_GRAPH = 1.0;
const W_SEMANTIC = 0.7;

export interface PlanFilters {
  topic?: string;
  source?: string; // canonical stream (resident|police|fire|business|interdept|civic)
  since?: string;
  until?: string;
  person?: string;
  address?: string;
  k?: number;
}

export interface Anchor {
  aliasId: string;
  entityId: string;
  aliasType: string;
  aliasValue: string;
}

export interface PlanResult {
  sources: Source[];
  crossSource: boolean;
  commitments: { text: string; status: string; dueAt: string | null }[];
  anchors: Anchor[];
  structuredComplete: number; // size of the complete structured set (completeness signal)
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

function streamFromSource(source: string): StreamKey {
  switch (source) {
    case "police": return "Police";
    case "fire": return "Fire/EMS";
    case "business": return "Business";
    case "interdept": return "Interdepartmental";
    case "civic": return "Civic/FOIA";
    default: return "Resident";
  }
}

/** Literal email addresses in the question resolve directly against the
 *  message headers — sender questions work even before the identity ledger
 *  (stage 5) is populated on a fresh mailbox. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export function extractEmails(question: string): string[] {
  return [...new Set((question.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
}

async function emailPass(emails: string[]): Promise<string[]> {
  if (!emails.length) return [];
  const rows = await query<{ message_id: string }>(
    `SELECT m.message_id
       FROM canonical.messages m
      WHERE m.tenant_id = $1 AND (
        lower(m.from_email) = ANY($2::text[])
        OR EXISTS (
          SELECT 1 FROM unnest($2::text[]) a
           WHERE m.to_email ILIKE '%' || a || '%' OR m.cc ILIKE '%' || a || '%'
        )
      )
      ORDER BY m.sent_at DESC
      LIMIT 400`,
    [TENANT, emails],
  );
  return rows.map((r) => r.message_id);
}

/** Vendor/sender pass — the missing link for "break down my Google spend".
 *
 *  A question naming an organisation is a STRUCTURED query (sender = Google,
 *  date >= Jan 1), not a fuzzy one, but nothing was extracting that: the
 *  question supplied no topic/source/date filter and matched no alias, so Pass 1
 *  returned nothing and the whole plan fell through to semantic top-k. That
 *  ranked newsletters ABOUT Google's spending above the user's own
 *  payments-noreply@google.com receipts — 19 of which were indexed and
 *  searchable the whole time (RD 2026-07-30).
 *
 *  Tokens are matched against real sender identities in the corpus, so this is
 *  grounded in what actually exists rather than a guessed vendor list. */
const SENDER_STOPWORDS = new Set([
  "this","that","what","when","where","which","with","from","have","want","need","show","give","tell",
  "complete","breakdown","break","down","month","monthly","year","quarter","spend","spending","cost",
  "costs","total","table","every","each","list","much","many","about","into","over","under","please",
  "invoice","invoices","payment","payments","receipt","receipts","billing","charge","charges","summary",
  "account","accounts","email","emails","record","records","last","past","been","were","would","could",
]);

/** What KIND of mail the question is about, as subject patterns. A sender alone
 *  is far too broad: Google sent 1,012 messages this year but only ~19 are
 *  billing, so ordering the sender match by recency buried every invoice under
 *  security alerts and notifications (caught by eval/ask-retrieval.test.ts). */
function subjectPatterns(question: string): string[] {
  const q = question.toLowerCase();
  const pats: string[] = [];
  if (/\bspend|spent|cost|billing|invoice|charge|payment|receipt|paid|subscription|price|budget\b/.test(q)) {
    pats.push("%invoice%", "%payment%", "%receipt%", "%billing%", "%charge%", "%subscription%", "%order%", "%statement%");
  }
  if (/\bmeeting|calendar|schedul|invite\b/.test(q)) pats.push("%meeting%", "%invit%", "%calendar%");
  if (/\bsecurity|breach|password|sign-?in|login\b/.test(q)) pats.push("%security%", "%password%", "%sign-in%", "%alert%");
  return pats;
}

async function senderPass(question: string, since: string | null): Promise<string[]> {
  const tokens = Array.from(new Set(
    (question.toLowerCase().match(/[a-z][a-z0-9.&-]{2,}/g) ?? [])
      // strip trailing punctuation, else "year." and "table." slip past the stoplist
      .map((t) => t.replace(/[.&-]+$/, ""))
      .filter((t) => t.length >= 3 && !SENDER_STOPWORDS.has(t)),
  )).slice(0, 6);
  if (!tokens.length) return [];
  const pats = subjectPatterns(question);
  // TIERED: mail from that sender that also matches what the question is ABOUT
  // comes first and is never crowded out; the rest of the sender's mail follows
  // as context. Recency only breaks ties WITHIN a tier.
  const rows = await query<{ message_id: string }>(
    `SELECT m.message_id
       FROM canonical.messages m
      WHERE m.tenant_id = $1
        AND ($3::timestamptz IS NULL OR m.sent_at >= $3)
        AND EXISTS (
          SELECT 1 FROM unnest($2::text[]) t
           WHERE m.from_email ILIKE '%' || t || '%'
              OR m.from_name  ILIKE '%' || t || '%'
        )
      ORDER BY
        CASE WHEN cardinality($4::text[]) = 0 THEN 0
             WHEN m.subject ILIKE ANY($4::text[]) THEN 0 ELSE 1 END,
        m.sent_at DESC
      LIMIT 400`,
    [TENANT, tokens, since, pats],
  );
  return rows.map((r) => r.message_id);
}

/** "this year" / "in 2026" / "last year" → a since bound, so a completeness
 *  question is scoped to the period the user actually named. */
export function sinceFromQuestion(question: string, now = new Date()): string | null {
  return rangeFromQuestion(question, now)?.since ?? null;
}

/** The period the question names, as a RANGE. "last month" needs an upper bound
 *  too — with only a lower bound the answer silently included everything since,
 *  which is what made "what did we get from Google last month" return mail from
 *  any date (RD 2026-07-31). */
export function rangeFromQuestion(
  question: string, now = new Date(),
): { since: string; until?: string } | null {
  const q = question.toLowerCase();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (/\blast month\b/.test(q)) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { since: iso(start), until: iso(end) };
  }
  if (/\bthis month\b/.test(q)) {
    return { since: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) };
  }
  if (/\blast (\d+) months?\b/.test(q)) {
    const n = Number(RegExp.$1);
    const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - n);
    return { since: iso(d) };
  }
  const yr = q.match(/\b(20\d{2})\b/);
  if (yr) return { since: `${yr[1]}-01-01`, until: `${Number(yr[1]) + 1}-01-01` };
  if (/\bthis year\b|\byear to date\b|\bytd\b/.test(q)) return { since: `${now.getUTCFullYear()}-01-01` };
  if (/\blast year\b/.test(q)) {
    return { since: `${now.getUTCFullYear() - 1}-01-01`, until: `${now.getUTCFullYear()}-01-01` };
  }
  return null;
}

/** Resolve question text to canonical identities via the alias ledger (replaces the POC's hard-coded lists). */
export async function resolveAnchors(question: string): Promise<Anchor[]> {
  const qn = norm(question);
  if (!qn) return [];
  const rows = await query<{ alias_id: string; entity_id: string; alias_type: string; alias_value: string }>(
    `SELECT alias_id, entity_id, alias_type, alias_value
       FROM canonical.entity_aliases
      WHERE tenant_id = $1 AND retracted_at IS NULL
        AND alias_type IN ('name_variant','address','business_name')
        AND length(alias_norm) >= 4
        AND position(alias_norm IN $2) > 0
      ORDER BY length(alias_norm) DESC
      LIMIT 12`,
    [TENANT, qn],
  );
  return rows.map((r) => ({ aliasId: r.alias_id, entityId: r.entity_id, aliasType: r.alias_type, aliasValue: r.alias_value }));
}

/** Every message inside a named period — the candidate pool for a date-scoped
 *  question. Bounded, and ordered newest-first so a huge window degrades to
 *  "the most recent N" rather than an arbitrary slice. */
async function messagesInRange(since: string | null, until: string | null): Promise<string[]> {
  const rows = await query<{ message_id: string }>(
    `SELECT message_id FROM canonical.messages
      WHERE tenant_id = $1
        AND ($2::timestamptz IS NULL OR sent_at >= $2)
        AND ($3::timestamptz IS NULL OR sent_at <  $3)
      ORDER BY sent_at DESC
      LIMIT 2000`,
    [TENANT, since, until],
  );
  return rows.map((r) => r.message_id);
}

/** Pass 1 — the complete candidate set for the present structuring predicate. */
async function structuredPass(f: PlanFilters, anchors: Anchor[]): Promise<string[]> {
  const hasMeta = !!(f.topic || f.source || f.since || f.until);
  if (!hasMeta && anchors.length === 0) return []; // nothing to structure on
  const aliasIds = anchors.map((a) => a.aliasId);
  const rows = await query<{ message_id: string }>(
    `WITH topic_msgs AS (
       SELECT m.message_id, m.sent_at
       FROM canonical.messages m
       WHERE m.tenant_id = $1
         AND ($2::boolean)                               -- include this CTE?
         AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM canonical.message_topics mt WHERE mt.message_id = m.message_id AND mt.topic = $3))
         AND ($4::text IS NULL OR m.source = $4)
         AND ($5::timestamptz IS NULL OR m.sent_at >= $5)
         AND ($6::timestamptz IS NULL OR m.sent_at <= $6)
     ),
     entity_msgs AS (
       SELECT DISTINCT e.evidence_message_id AS message_id, m.sent_at
       FROM canonical.edges e JOIN canonical.messages m ON m.message_id = e.evidence_message_id
       WHERE e.tenant_id = $1 AND e.evidence_message_id IS NOT NULL
         AND e.dst_id = ANY($7::uuid[])
     )
     SELECT message_id FROM (
       SELECT message_id, sent_at FROM topic_msgs
       UNION
       SELECT message_id, sent_at FROM entity_msgs
     ) u
     ORDER BY sent_at DESC
     LIMIT 400`,
    [TENANT, hasMeta, f.topic ?? null, f.source ?? null, f.since ?? null, f.until ?? null, aliasIds],
  );
  return rows.map((r) => r.message_id);
}

/** Pass 2 — graph walk: anchor → issues → threads → messages (+commitments). */
async function graphPass(anchors: Anchor[]): Promise<{ messageIds: string[]; commitments: PlanResult["commitments"] }> {
  const aliasIds = anchors.map((a) => a.aliasId);
  if (aliasIds.length === 0) return { messageIds: [], commitments: [] };
  const msgs = await query<{ message_id: string }>(
    `WITH anchor_issues AS (
       SELECT DISTINCT e.src_id AS issue_id
       FROM canonical.edges e
       WHERE e.tenant_id = $1 AND e.src_type = 'issue' AND e.dst_type = 'alias'
         AND e.dst_id = ANY($2::uuid[])
     ),
     issue_threads AS (
       SELECT t.thread_id FROM canonical.threads t JOIN anchor_issues a ON t.issue_id = a.issue_id
     )
     SELECT m.message_id
     FROM canonical.messages m JOIN issue_threads it ON m.thread_id = it.thread_id
     WHERE m.tenant_id = $1
     ORDER BY m.sent_at DESC
     LIMIT 200`,
    [TENANT, aliasIds],
  );
  const commits = await query<{ commitment_text: string; status: string; due_at: Date | null }>(
    `WITH anchor_issues AS (
       SELECT DISTINCT e.src_id AS issue_id
       FROM canonical.edges e
       WHERE e.tenant_id = $1 AND e.src_type = 'issue' AND e.dst_type = 'alias'
         AND e.dst_id = ANY($2::uuid[])
     )
     SELECT c.commitment_text, c.status, c.due_at
     FROM canonical.commitments c JOIN anchor_issues a ON c.issue_id = a.issue_id
     LIMIT 50`,
    [TENANT, aliasIds],
  );
  return {
    messageIds: msgs.map((m) => m.message_id),
    commitments: commits.map((c) => ({ text: c.commitment_text, status: c.status, dueAt: c.due_at ? c.due_at.toISOString() : null })),
  };
}

/** Pass 3 — semantic kNN, optionally restricted to a candidate set. */
async function semanticPass(qvec: string, restrict: string[] | null, k: number): Promise<string[]> {
  const rows = await query<{ message_id: string }>(
    `SELECT c.message_id, MIN(c.embedding <=> $1::vector) AS distance
       FROM canonical.chunks c JOIN canonical.messages m ON m.message_id = c.message_id
      WHERE m.tenant_id = $2 AND c.embedding IS NOT NULL
        AND ($3::uuid[] IS NULL OR c.message_id = ANY($3::uuid[]))
      GROUP BY c.message_id
      ORDER BY distance ASC
      LIMIT $4`,
    [qvec, TENANT, restrict, k],
  );
  return rows.map((r) => r.message_id);
}

/** Reciprocal Rank Fusion across the passes. */
function rrf(lists: { ids: string[]; w: number }[]): string[] {
  const score = new Map<string, number>();
  for (const { ids, w } of lists) {
    ids.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + w / (RRF_K + rank + 1)));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

async function buildSources(messageIds: string[], qvec: string): Promise<Source[]> {
  if (messageIds.length === 0) return [];
  const rows = await query<{
    message_id: string; source_ref: string; thread_id: string | null; source: string;
    sent_at: Date; subject: string | null; from_name: string | null; from_email: string | null;
    to_email: string | null; direction: string; topic: string | null; snippet: string | null; distance: number | null;
  }>(
    `SELECT m.message_id, m.source_ref, m.thread_id::text, m.source, m.sent_at, m.subject,
            m.from_name, m.from_email, m.to_email, m.direction,
            (SELECT mt.topic FROM canonical.message_topics mt WHERE mt.message_id = m.message_id LIMIT 1) AS topic,
            (SELECT c.chunk_text FROM canonical.chunks c WHERE c.message_id = m.message_id
                ORDER BY (c.embedding <=> $2::vector) ASC NULLS LAST LIMIT 1) AS snippet,
            (SELECT MIN(c.embedding <=> $2::vector) FROM canonical.chunks c WHERE c.message_id = m.message_id) AS distance
       FROM canonical.messages m
      WHERE m.message_id = ANY($1::uuid[])`,
    [messageIds, qvec],
  );
  const byId = new Map(rows.map((r) => [r.message_id, r]));
  const ordered = messageIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  ordered.sort((a, b) => b.sent_at.getTime() - a.sent_at.getTime()); // newest-first → [1] is most recent
  return ordered.map((r, i) => ({
    index: i + 1,
    score: r.distance == null ? 0 : Math.max(0, 1 - Number(r.distance)),
    direction: r.direction === "outbound" ? "outbound" : "inbound",
    date: r.sent_at.toISOString(),
    fromName: r.from_name,
    fromEmail: r.from_email,
    toEmail: r.to_email,
    subject: r.subject,
    topic: r.topic,
    stream: streamFromSource(r.source),
    // snippetText drops the URL soup / tracking links a newsletter chunk
    // still carries — the excerpt reads like an email, not markup
    snippet: snippetText(r.snippet ?? "", 600),
    messageId: r.source_ref,
    threadId: r.thread_id,
  }));
}

// ANSWER FIRST. The earlier version of this prompt said only "order events in
// time", so the model produced a chronological transcript of every excerpt and
// the reader had to assemble the answer themselves (RD 2026-07-18: "the output
// looks confusing… there should be a summary at the top"). A chief of staff
// leads with the point and keeps the detail underneath for whoever wants it.
const SYNTH_SYSTEM = `${VOICE}

${HONESTY}
Answer ONLY from the numbered excerpts provided.

ANSWER SHAPE — this is a SEARCH result, format it to be scanned, not read.
Lead with the answer to the question that was asked. Never open with a status
line like "Nothing here needs you" — that belongs on the daily brief, not here.

1. One short sentence up top: the direct answer. If there is nothing, say what
   you looked for and what you found instead — in one sentence, not a paragraph.
2. Then the substance, formatted for consumption:
   - a "|" TABLE when several items share the same fields (sender, date, amount,
     status). This is usually the right choice for "what did I get from X".
   - otherwise short bullets, one fact each, with the citation on the fact.
   - bold the thing that matters in each line.
   Do not write three dense paragraphs. If it can be a table or a list, it is.
3. Only if something genuinely needs action, add lines starting with "> " AFTER
   the answer — never before it, and never at all when nothing needs doing.

Rules:
- Put a [n] citation on every factual claim, matching the excerpt it came from.
- Say who promised what and whether it happened.
- Never render a chronological transcript of every excerpt UNLESS he explicitly
  asked for a breakdown, a total, a table, or "every"/"all" of something. A
  summary is the default because the raw list is the inbox he already has — but
  when the ask IS the enumeration ("break down my Google spend by month"), give
  the complete enumeration and do not compress it into a sentence. Cover every
  period in range: if a month has no record, show the row and mark it as no
  record rather than dropping it, so a gap is visible instead of silent.
- End with one short "Recommended next step:" line — and only when there is a real
  next step. Recommend only; never claim to have taken an action.`;

/** Synthesis with the deterministic empty-set short-circuit (R4). */
export async function synthesize(question: string, sources: Source[]): Promise<string> {
  if (sources.length === 0) {
    return "I have no records on that in the Village archive. Rather than guess, I'm flagging the gap — connect the relevant source or rephrase and I'll try again.";
  }
  const context = sources
    .map((s) => `[${s.index}] ${s.date.slice(0, 10)} · ${s.stream} · ${s.fromName ?? s.fromEmail ?? "unknown"} · "${s.subject ?? "(no subject)"}"\n${s.snippet}`)
    .join("\n\n");
  // 900 was sized for a 3-sentence answer. A monthly table with a row and a
  // citation per month does not fit in it — the answer simply stopped partway.
  const wide = COMPLETENESS_INTENT.test(question);
  return complete({
    task: "synthesize",
    system: SYNTH_SYSTEM,
    user: `Question: ${question}\n\nExcerpts:\n${context}`,
    maxTokens: wide ? 4000 : 900,
  });
}

const CROSS_INTENT = /cross[- ]?reference|every source|across (every|all)|police and fire|each source|all sources/i;

/** A question demanding COMPLETENESS rather than a summary — "break it down by
 *  month", "every invoice", "total spend", "list all". The default k=8 cannot
 *  answer these: a year of Google billing is 19 emails in this corpus, so a
 *  monthly table built from 8 excerpts is missing two-thirds of the year and no
 *  model can recover the rest (RD 2026-07-30 — the answer looked "incomplete",
 *  but the data was never handed to the model). Completeness is a RETRIEVAL
 *  property here, not a model capability. */
const COMPLETENESS_INTENT =
  /\b(break ?down|breakdown|itemi[sz]e|by month|per month|monthly|by quarter|each month|complete|comprehensive|full (list|breakdown|picture)|every (invoice|charge|payment|receipt|email)|all (invoices|charges|payments|receipts)|how much .* (total|altogether|in all)|total(l?ed)? (spend|cost|charges))\b/i;

/** Retrieval width for a completeness question. Enough to cover a year of
 *  monthly billing with headroom, still well inside the context window. */
const COMPLETENESS_K = 60;

/** The planner entry point. */
export async function plan(question: string, f: PlanFilters = {}): Promise<PlanResult> {
  // An explicit caller-supplied k always wins; otherwise a completeness
  // question gets the wide net and everything else keeps the fast default.
  const k = f.k ?? (COMPLETENESS_INTENT.test(question) ? COMPLETENESS_K : 8);
  const [anchors, qvec] = await Promise.all([
    resolveAnchors(question),
    embedQuery(question).then(toVector),
  ]);

  // Scope to the period the question names, on EVERY path. Previously the date
  // was only consulted for completeness questions, so "last month" was parsed
  // and then ignored — the answer covered the whole archive.
  const range = rangeFromQuestion(question);
  const since = f.since ?? range?.since ?? null;
  const until = f.until ?? range?.until ?? null;
  const wantsAll = COMPLETENESS_INTENT.test(question);
  const [structured, graph, byAddress, bySender, inRange] = await Promise.all([
    // NOT { ...f, since }: a date alone is not a structuring predicate. Passing
    // it made hasMeta true, so Pass 1 returned the 400 most recent messages of
    // ANY sender this year — LinkedIn, Wayfair, Facebook — at primary weight,
    // swamping the sender matches (RD 2026-07-30).
    structuredPass(f, anchors),
    graphPass(anchors),
    emailPass(extractEmails(question)),
    wantsAll ? senderPass(question, since) : Promise.resolve<string[]>([]),
    // A named period is a CANDIDATE POOL, not a ranked list. Semantic ranking
    // then happens INSIDE the period, so "what did we get from Google last
    // month" ranks June's Google mail instead of ranking the whole archive and
    // discarding everything out of range afterwards (RD 2026-07-31).
    since || until ? messagesInRange(since, until) : Promise.resolve<string[]>([]),
  ]);

  const candidatePool = Array.from(new Set([...structured, ...graph.messageIds, ...byAddress, ...bySender, ...inRange]));
  const [inSet, straggler] = await Promise.all([
    candidatePool.length ? semanticPass(qvec, candidatePool, Math.max(k * 2, 20)) : Promise.resolve<string[]>([]),
    // no unrestricted straggler when a period was named — it can only add
    // out-of-range noise that the gate below would discard anyway.
    (since || until) ? Promise.resolve<string[]>([]) : semanticPass(qvec, null, Math.max(k * 2, 20)),
  ]);

  // RRF fuse: structured & graph & literal-address (primary) + semantic in-set + straggler (safety net).
  const cross = CROSS_INTENT.test(question);
  let fused = rrf([
    { ids: structured, w: W_STRUCTURED },
    { ids: byAddress, w: W_STRUCTURED },
    // Sender+intent matches are a RELATIONAL answer ("mail from Google about
    // billing"), so they rank as primary evidence. Feeding them only into the
    // candidate pool was not enough: semantic similarity then buried an invoice
    // titled "We've received your payment for 6066-2765-7543" under prose that
    // merely discussed spending (eval/ask-retrieval.test.ts caught this).
    { ids: bySender, w: W_STRUCTURED },
    { ids: graph.messageIds, w: W_GRAPH },
    { ids: inSet, w: W_SEMANTIC },
    { ids: straggler, w: W_SEMANTIC * (cross ? 1.0 : 0.7) },
  ]);

  let sources = await buildSources(fused, qvec);
  // Hard date gate: the semantic passes rank by similarity and do not filter by
  // date, so an out-of-period message can still surface. If the user named a
  // period, honour it — a wrong-date answer is worse than a short one.
  if (since || until) {
    sources = sources.filter((s) =>
      (!since || s.date >= since) && (!until || s.date < until));
  }
  // Cross-source intent: diversify so no single stream dominates (≥1 per stream up to k).
  if (cross) sources = diversifyByStream(sources, Math.max(k, 10));
  else sources = sources.slice(0, k);
  // Re-index after slicing/diversifying so [n] stays contiguous newest-first.
  sources = sources
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((s, i) => ({ ...s, index: i + 1 }));

  return {
    sources,
    crossSource: new Set(sources.map((s) => s.stream)).size >= 3,
    commitments: graph.commitments,
    anchors,
    structuredComplete: new Set([...structured, ...byAddress]).size,
  };
}

/** Flat semantic-only baseline (no structured/graph/RRF) — the eval A/B control. */
export async function flatSearch(question: string, k = 8): Promise<Source[]> {
  const qvec = toVector(await embedQuery(question));
  const ids = await semanticPass(qvec, null, Math.max(k * 2, 20));
  const sources = await buildSources(ids, qvec);
  return sources
    .slice(0, k)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((s, i) => ({ ...s, index: i + 1 }));
}

function diversifyByStream(sources: Source[], limit: number): Source[] {
  const byStream = new Map<StreamKey, Source[]>();
  for (const s of sources) {
    const list = byStream.get(s.stream) ?? [];
    list.push(s);
    byStream.set(s.stream, list);
  }
  const out: Source[] = [];
  let added = true;
  while (out.length < limit && added) {
    added = false;
    for (const list of byStream.values()) {
      const next = list.shift();
      if (next) { out.push(next); added = true; if (out.length >= limit) break; }
    }
  }
  return out;
}
