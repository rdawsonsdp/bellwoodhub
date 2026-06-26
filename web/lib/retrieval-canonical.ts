/*
 * retrieval-canonical.ts — the canonical-backed implementation of the retrieval
 * API, drop-in compatible with lib/retrieval.ts (the poc backend). Selected at
 * runtime by RETRIEVAL_BACKEND=canonical (see lib/backend.ts). This is the
 * strangler-fig: the same signatures, a graph-augmented planner underneath.
 */
import { query } from "./db";
import { plan } from "./planner";
import { synthesize } from "./planner";
import type {
  AskResponse, AppliedFilters, Direction, EmailDetail, EntityResponse,
  OpenItem, Source, StreamKey, TimelineMessage, WhoRow,
} from "./types";

const TENANT = "00000000-0000-0000-0000-000000000001";
const STAFF_DOMAIN = process.env.STAFF_DOMAIN || "bellwood-demo.gov";

const AGG_WHO = /who (has )?email(ed|s)? (me|us) (the )?most|who (contacts|writes)/i;
const AGG_OPEN = /(what('s| is)|anything) .*(still )?(open|unresolved|outstanding|pending|need)/i;

export interface SearchOpts {
  k?: number;
  person?: string;
  address?: string;
  since?: string;
  until?: string;
  topic?: string;
  stream?: StreamKey;
  noAuto?: boolean;
}

function sourceFromStream(s?: StreamKey): string | undefined {
  switch (s) {
    case "Police": return "police";
    case "Fire/EMS": return "fire";
    case "Business": return "business";
    case "Interdepartmental": return "interdept";
    case "Civic/FOIA": case "Regional": return "civic";
    case "Resident": return "resident";
    default: return undefined;
  }
}
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

// ── search (retrieval only — MCP search_village_emails + the answer's sources) ──
export async function searchSources(
  question: string,
  filters: SearchOpts = {},
): Promise<{ sources: Source[]; crossSource: boolean; applied?: AppliedFilters }> {
  const r = await plan(question, {
    topic: filters.topic, source: sourceFromStream(filters.stream),
    since: filters.since, until: filters.until, k: filters.k ?? 8,
  });
  const applied: AppliedFilters = {};
  if (filters.topic) applied.topic = filters.topic;
  if (filters.since) applied.since = filters.since;
  if (filters.until) applied.until = filters.until;
  for (const a of r.anchors) {
    if (a.aliasType === "address") applied.address = a.aliasValue;
    else if (a.aliasType === "name_variant") applied.person = a.aliasValue;
  }
  return { sources: r.sources, crossSource: r.crossSource, applied: Object.keys(applied).length ? applied : undefined };
}

// ── ask (grounded answer; aggregates handled by structured truth) ──
export async function ask(question: string, filters: SearchOpts = {}): Promise<AskResponse> {
  if (AGG_WHO.test(question)) {
    return { mode: "who_emails_most", question, who: await whoEmailsMost() };
  }
  if (AGG_OPEN.test(question)) {
    return { mode: "open_items", question, answer: "Here's what's still open — folded from the event log.", openItems: await openItems() };
  }
  const r = await plan(question, {
    topic: filters.topic, source: sourceFromStream(filters.stream),
    since: filters.since, until: filters.until, k: filters.k ?? 8,
  });
  const answer = await synthesize(question, r.sources);
  const applied: AppliedFilters = {};
  const auto: { person?: string; address?: string } = {};
  for (const a of r.anchors) {
    if (a.aliasType === "address") { applied.address = a.aliasValue; auto.address = a.aliasValue; }
    else if (a.aliasType === "name_variant") { applied.person = a.aliasValue; auto.person = a.aliasValue; }
  }
  if (filters.topic) applied.topic = filters.topic;
  return {
    mode: "rag", question, answer, sources: r.sources, crossSource: r.crossSource,
    auto: Object.keys(auto).length ? auto : undefined,
    applied: Object.keys(applied).length ? applied : undefined,
  };
}

// ── "what's still open" — fold over events, never a stored status (R4/AD-5) ──
export async function openItems(limit = 24): Promise<OpenItem[]> {
  const rows = await query<{
    title: string; issue_type: string; last_activity_at: Date | null;
    from_name: string | null; source: string | null;
  }>(
    `SELECT s.title, s.issue_type, s.last_activity_at,
            (SELECT m.from_name FROM canonical.messages m JOIN canonical.threads t ON t.thread_id = m.thread_id
              WHERE t.issue_id = s.issue_id ORDER BY m.sent_at LIMIT 1) AS from_name,
            (SELECT m.source FROM canonical.messages m JOIN canonical.threads t ON t.thread_id = m.thread_id
              WHERE t.issue_id = s.issue_id ORDER BY m.sent_at DESC LIMIT 1) AS source
       FROM canonical.issue_state s
      WHERE s.tenant_id = $1 AND s.state = 'open'
      ORDER BY s.last_activity_at DESC NULLS LAST
      LIMIT $2`,
    [TENANT, limit],
  );
  return rows.map((r) => ({
    score: 1,
    date: (r.last_activity_at ?? new Date(0)).toISOString(),
    fromName: r.from_name,
    subject: r.title,
    topic: r.issue_type,
    stream: streamFromSource(r.source ?? "resident"),
    why: `open issue · last activity ${(r.last_activity_at ?? new Date(0)).toISOString().slice(0, 10)}`,
  }));
}

export async function whoEmailsMost(): Promise<{ constituents: WhoRow[]; internal: WhoRow[] }> {
  const rows = await query<{ from_name: string | null; from_email: string; n: number; source: string }>(
    `SELECT from_name, from_email, count(*)::int AS n, MIN(source) AS source
       FROM canonical.messages
      WHERE tenant_id = $1 AND direction = 'inbound' AND from_email IS NOT NULL
      GROUP BY from_name, from_email
      ORDER BY n DESC LIMIT 40`,
    [TENANT],
  );
  const constituents: WhoRow[] = [];
  const internal: WhoRow[] = [];
  for (const r of rows) {
    const row: WhoRow = { name: r.from_name, email: r.from_email, count: r.n, stream: streamFromSource(r.source) };
    (r.from_email.endsWith(STAFF_DOMAIN) ? internal : constituents).push(row);
  }
  return { constituents: constituents.slice(0, 8), internal: internal.slice(0, 8) };
}

// ── entity timeline (single pane of glass) ──
export async function getEntity(type: "person" | "address", value: string): Promise<EntityResponse> {
  const rows = await query<{
    message_id: string; source_ref: string; thread_id: string | null; sent_at: Date;
    direction: string; from_name: string | null; from_email: string | null; subject: string | null;
    source: string; topic: string | null; snippet: string | null;
  }>(
    `WITH ent AS (
       SELECT entity_id FROM canonical.entity_aliases
        WHERE tenant_id = $1 AND retracted_at IS NULL AND lower(alias_value) = lower($2) LIMIT 1
     ),
     al AS (SELECT alias_id FROM canonical.entity_aliases WHERE entity_id = (SELECT entity_id FROM ent) AND retracted_at IS NULL),
     msgs AS (
       SELECT m.message_id FROM canonical.messages m WHERE m.sender_alias_id IN (SELECT alias_id FROM al)
       UNION
       SELECT e.evidence_message_id FROM canonical.edges e
         WHERE e.dst_id IN (SELECT alias_id FROM al) AND e.evidence_message_id IS NOT NULL
     )
     SELECT m.message_id, m.source_ref, m.thread_id::text, m.sent_at, m.direction, m.from_name,
            m.from_email, m.subject, m.source,
            (SELECT topic FROM canonical.message_topics mt WHERE mt.message_id = m.message_id LIMIT 1) AS topic,
            (SELECT chunk_text FROM canonical.chunks c WHERE c.message_id = m.message_id ORDER BY chunk_index LIMIT 1) AS snippet
       FROM canonical.messages m JOIN msgs ON m.message_id = msgs.message_id
      ORDER BY m.sent_at DESC LIMIT 200`,
    [TENANT, value],
  );
  const messages: TimelineMessage[] = rows.map((r) => ({
    id: r.message_id, date: r.sent_at.toISOString(), direction: (r.direction === "outbound" ? "outbound" : "inbound") as Direction,
    fromName: r.from_name, fromEmail: r.from_email, subject: r.subject, topic: r.topic,
    stream: streamFromSource(r.source), snippet: (r.snippet ?? "").slice(0, 400),
    messageId: r.source_ref, threadId: r.thread_id,
  }));
  const dates = messages.map((m) => m.date).sort();
  const streams = Array.from(new Set(messages.map((m) => m.stream)));
  return {
    type, value,
    stats: { count: messages.length, firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null, streams },
    messages,
  };
}

export async function getEmailByMessageId(mid: string): Promise<EmailDetail | null> {
  const rows = await query<{
    subject: string | null; from_name: string | null; from_email: string | null; to_email: string | null;
    cc: string | null; direction: string; source: string; sent_at: Date; clean_body: string;
    topic: string | null; body_raw: string | null;
  }>(
    `SELECT m.subject, m.from_name, m.from_email, m.to_email, m.cc, m.direction, m.source, m.sent_at, m.clean_body,
            (SELECT topic FROM canonical.message_topics mt WHERE mt.message_id = m.message_id LIMIT 1) AS topic,
            (SELECT r.payload->>'body_raw' FROM pipeline.raw_objects r WHERE r.ingest_key = m.ingest_key ORDER BY version DESC LIMIT 1) AS body_raw
       FROM canonical.messages m WHERE m.source_ref = $1 LIMIT 1`,
    [mid],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    subject: r.subject, fromName: r.from_name, fromEmail: r.from_email, toEmail: r.to_email, cc: r.cc,
    direction: (r.direction === "outbound" ? "outbound" : "inbound") as Direction, topic: r.topic,
    stream: streamFromSource(r.source), date: r.sent_at.toISOString(),
    bodyClean: r.clean_body, bodyRaw: r.body_raw ?? r.clean_body,
  };
}
