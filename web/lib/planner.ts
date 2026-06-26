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
    snippet: (r.snippet ?? "").slice(0, 600),
    messageId: r.source_ref,
    threadId: r.thread_id,
  }));
}

const SYNTH_SYSTEM = `You are the Mayor of Bellwood's chief of staff. Answer ONLY from the numbered excerpts provided — never invent facts.
Rules:
- Put a [n] citation on every factual claim, matching the excerpt it came from.
- Order events in time; surface who promised what and whether it happened.
- If the excerpts do not cover part of the question, say so plainly ("I have no record of …"). Never guess.
- End with one short "Recommended next step:" line. Recommend only — never claim to have taken an action.
Keep it tight and scannable.`;

/** Synthesis with the deterministic empty-set short-circuit (R4). */
export async function synthesize(question: string, sources: Source[]): Promise<string> {
  if (sources.length === 0) {
    return "I have no records on that in the Village archive. Rather than guess, I'm flagging the gap — connect the relevant source or rephrase and I'll try again.";
  }
  const context = sources
    .map((s) => `[${s.index}] ${s.date.slice(0, 10)} · ${s.stream} · ${s.fromName ?? s.fromEmail ?? "unknown"} · "${s.subject ?? "(no subject)"}"\n${s.snippet}`)
    .join("\n\n");
  return complete({
    task: "synthesize",
    system: SYNTH_SYSTEM,
    user: `Question: ${question}\n\nExcerpts:\n${context}`,
    maxTokens: 900,
  });
}

const CROSS_INTENT = /cross[- ]?reference|every source|across (every|all)|police and fire|each source|all sources/i;

/** The planner entry point. */
export async function plan(question: string, f: PlanFilters = {}): Promise<PlanResult> {
  const k = f.k ?? 8;
  const [anchors, qvec] = await Promise.all([
    resolveAnchors(question),
    embedQuery(question).then(toVector),
  ]);

  const [structured, graph] = await Promise.all([
    structuredPass(f, anchors),
    graphPass(anchors),
  ]);

  const candidatePool = Array.from(new Set([...structured, ...graph.messageIds]));
  const [inSet, straggler] = await Promise.all([
    candidatePool.length ? semanticPass(qvec, candidatePool, Math.max(k * 2, 20)) : Promise.resolve<string[]>([]),
    semanticPass(qvec, null, Math.max(k * 2, 20)),
  ]);

  // RRF fuse: structured & graph (primary) + semantic in-set + straggler (safety net).
  const cross = CROSS_INTENT.test(question);
  let fused = rrf([
    { ids: structured, w: W_STRUCTURED },
    { ids: graph.messageIds, w: W_GRAPH },
    { ids: inSet, w: W_SEMANTIC },
    { ids: straggler, w: W_SEMANTIC * (cross ? 1.0 : 0.7) },
  ]);

  let sources = await buildSources(fused, qvec);
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
    structuredComplete: structured.length,
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
