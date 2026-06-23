import { embed, chat } from "./openai";
import { query, toVector } from "./db";
import { streamCase } from "./sql";
import { autoFilters, isKnownPerson } from "./entities";
import { normalizeAddress, normalizePerson } from "./normalize";
import { deriveStream } from "./topics";
import { snippet } from "./utils";
import type {
  AppliedFilters,
  AskResponse,
  Direction,
  DashboardResponse,
  EmailDetail,
  EntityResponse,
  OpenItem,
  Source,
  StreamKey,
  TimelineMessage,
  WhoRow,
} from "./types";

const OPEN_LEDE =
  "Recent inbound items that read as unresolved — no outbound reply on file or " +
  "an open commitment awaiting confirmation, ranked by how clearly they're still pending.";

// Aggregate-intent detection (ports query.py's _AGG_WHO / _AGG_OPEN).
const AGG_WHO = /who\b.*(email|wrote|contact|message).*(most|frequent)/i;
const AGG_OPEN =
  /(still\s+open|unresolved|outstanding|pending|haven'?t\s+\w+\s+resolv|not\s+resolved|still\s+need|open\s+right\s+now)/i;

interface ChunkRow {
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  to_email: string | null;
  direction: Direction;
  topic: string | null;
  date_sent: Date;
  message_id: string;
  thread_id: string | null;
  chunk_text: string;
  distance: string | number;
  stream: string;
}

export interface SearchOpts {
  k?: number;
  person?: string;
  address?: string;
  since?: string;
  until?: string;
  topic?: string;
  stream?: StreamKey; // constrain to a single derived source stream
  noAuto?: boolean; // skip the inferred person/address auto-filter
}

const SELECT_CHUNK = `
  e.subject, e.from_name, e.from_email, e.to_email, e.direction, e.topic,
  e.date_sent, e.message_id, e.thread_id, c.chunk_text,
  (c.embedding <=> (SELECT v FROM q)) AS distance,
  ${streamCase("e")} AS stream
`;

// ── retrieval ───────────────────────────────────────────────────────────────
async function searchRows(
  question: string,
  opts: SearchOpts,
  limit?: number,
): Promise<ChunkRow[]> {
  const qv = toVector(await embed(question));
  return searchCore(qv, opts, limit);
}

/** Build the WHERE clauses + params for the optional filters, indexed from startIdx. */
function buildFilters(
  opts: SearchOpts,
  startIdx: number,
): { clauses: string[]; params: unknown[]; nextIdx: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = startIdx;
  if (opts.person) {
    params.push(`%${normalizePerson(opts.person)}%`);
    clauses.push(
      `e.id IN (SELECT email_id FROM poc.email_entities WHERE entity_type='person' AND entity_norm ILIKE $${i++})`,
    );
  }
  if (opts.address) {
    params.push(`%${normalizeAddress(opts.address)}%`);
    clauses.push(
      `e.id IN (SELECT email_id FROM poc.email_entities WHERE entity_type='address' AND entity_norm ILIKE $${i++})`,
    );
  }
  if (opts.since) {
    params.push(opts.since);
    clauses.push(`e.date_sent >= $${i++}`);
  }
  if (opts.until) {
    params.push(opts.until);
    clauses.push(`e.date_sent <= $${i++}`);
  }
  if (opts.topic) {
    params.push(opts.topic);
    clauses.push(`e.topic = $${i++}`);
  }
  if (opts.stream) {
    params.push(opts.stream);
    clauses.push(`(${streamCase("e")}) = $${i++}`);
  }
  return { clauses, params, nextIdx: i };
}

/** kNN search given an already-embedded query vector literal (reused across calls). */
async function searchCore(
  qv: string,
  opts: SearchOpts,
  limit?: number,
): Promise<ChunkRow[]> {
  const { clauses, params, nextIdx } = buildFilters(opts, 2);
  const where = ["TRUE", ...clauses].join(" AND ");
  const sql = `
    WITH q AS (SELECT $1::extensions.vector AS v)
    SELECT ${SELECT_CHUNK}
    FROM poc.email_chunks c
    JOIN poc.emails e ON e.id = c.email_id
    WHERE ${where}
    ORDER BY c.embedding <=> (SELECT v FROM q)
    LIMIT $${nextIdx}
  `;
  return query<ChunkRow>(sql, [qv, ...params, limit ?? opts.k ?? 8]);
}

/**
 * Exact federated retrieval for cross-source questions: compute distance over
 * every (filtered) chunk and keep the top-N per source stream via a window
 * function. Unlike the HNSW path this is guaranteed to surface the closest match
 * within each stream even when one stream dominates the vector neighborhood.
 */
async function crossSourceRows(
  qv: string,
  opts: SearchOpts,
  perStream = 2,
): Promise<ChunkRow[]> {
  const { clauses, params, nextIdx } = buildFilters(opts, 2);
  const where = ["TRUE", ...clauses].join(" AND ");
  const sql = `
    WITH q AS (SELECT $1::extensions.vector AS v),
    base AS (
      SELECT e.subject, e.from_name, e.from_email, e.to_email, e.direction, e.topic,
             e.date_sent, e.message_id, e.thread_id, c.chunk_text,
             (c.embedding <=> (SELECT v FROM q)) AS distance,
             ${streamCase("e")} AS stream
      FROM poc.email_chunks c
      JOIN poc.emails e ON e.id = c.email_id
      WHERE ${where}
    ),
    ranked AS (
      SELECT *, row_number() OVER (PARTITION BY stream ORDER BY distance) AS rn FROM base
    )
    SELECT subject, from_name, from_email, to_email, direction, topic, date_sent,
           message_id, thread_id, chunk_text, distance, stream
    FROM ranked
    WHERE rn <= $${nextIdx}
    ORDER BY distance
  `;
  return query<ChunkRow>(sql, [qv, ...params, perStream]);
}

async function openItemsRows(k = 8): Promise<ChunkRow[]> {
  const qv = toVector(
    await embed(
      "issue still open, unresolved, pending, waiting on a response, not yet " +
        "fixed, needs follow up, awaiting resolution",
    ),
  );
  // DISTINCT ON (e.id) keeps the best-matching chunk per email so a few long
  // threads can't crowd out the list; then rank those distinct emails by score.
  const sql = `
    WITH q AS (SELECT $1::extensions.vector AS v),
    cand AS (
      SELECT DISTINCT ON (e.id)
             e.subject, e.from_name, e.from_email, e.to_email, e.direction, e.topic,
             e.date_sent, e.message_id, e.thread_id, c.chunk_text,
             (c.embedding <=> (SELECT v FROM q)) AS distance,
             ${streamCase("e")} AS stream
      FROM poc.email_chunks c
      JOIN poc.emails e ON e.id = c.email_id
      WHERE e.direction = 'inbound'
        AND e.date_sent >= ((SELECT max(date_sent) FROM poc.emails) - INTERVAL '120 days')
      ORDER BY e.id, c.embedding <=> (SELECT v FROM q)
    )
    SELECT * FROM cand ORDER BY distance LIMIT $2
  `;
  return query<ChunkRow>(sql, [qv, k]);
}

// ── shaping ───────────────────────────────────────────────────────────────
function sortNewestFirst(rows: ChunkRow[]): ChunkRow[] {
  return [...rows].sort((a, b) => b.date_sent.getTime() - a.date_sent.getTime());
}

/** Keep one row per email (the best-ranked chunk); input must be score-ordered. */
function dedupeByMessage(rows: ChunkRow[]): ChunkRow[] {
  const seen = new Set<string>();
  const out: ChunkRow[] = [];
  for (const r of rows) {
    if (seen.has(r.message_id)) continue;
    seen.add(r.message_id);
    out.push(r);
  }
  return out;
}

/**
 * Round-robin across source streams so a "give me the full picture" question
 * surfaces every stream that has a relevant match instead of collapsing onto the
 * single densest one. Input must be score-ordered (best first); rows are real
 * matches — this only changes which of them we keep, never invents any.
 */
function diversifyByStream(rows: ChunkRow[], k: number): ChunkRow[] {
  const queues = new Map<string, ChunkRow[]>();
  for (const r of rows) {
    const s = r.stream || "?";
    if (!queues.has(s)) queues.set(s, []);
    queues.get(s)!.push(r);
  }
  const lists = [...queues.values()];
  const picked: ChunkRow[] = [];
  let progress = true;
  while (picked.length < k && progress) {
    progress = false;
    for (const list of lists) {
      if (!list.length) continue;
      picked.push(list.shift()!);
      progress = true;
      if (picked.length >= k) break;
    }
  }
  return picked;
}

const CROSS_INTENT =
  /cross-?reference|every source|across (all|every|each)|all sources|each source|police and fire|fire and police|full picture/i;

/** Map already-newest-first rows to Sources; index aligns with answer citations. */
function toSources(ordered: ChunkRow[]): Source[] {
  return ordered.map((r, idx) => ({
    index: idx + 1,
    score: Math.max(0, 1 - Number(r.distance)),
    direction: r.direction,
    date: r.date_sent.toISOString(),
    fromName: r.from_name,
    fromEmail: r.from_email,
    toEmail: r.to_email,
    subject: r.subject,
    topic: r.topic,
    stream: (r.stream as StreamKey) ?? deriveStream(r.topic, r.from_email),
    snippet: snippet(r.chunk_text, 300),
    messageId: r.message_id,
    threadId: r.thread_id,
  }));
}

async function synthesize(question: string, ordered: ChunkRow[]): Promise<string> {
  if (!ordered.length) {
    return "I don't see any matching email context to answer that from.";
  }
  const ctx = ordered
    .map(
      (r, idx) =>
        `[${idx + 1}] ${r.date_sent.toISOString().slice(0, 10)} | from ${r.from_name} <${r.from_email}> | subject: ${r.subject}\n${snippet(r.chunk_text, 600)}`,
    )
    .join("\n\n");
  const system =
    "You are the Village of Bellwood's chief of staff. Answer the question " +
    "using ONLY the email excerpts provided. Cite sources inline like [1], [2]. " +
    "The excerpts are ordered NEWEST FIRST, so [1] is the most recent — when " +
    "asked about the 'latest' or most recent email, use [1].\n\n" +
    "Format: write 2-3 short paragraphs separated by a blank line. The FINAL " +
    "paragraph must be a concrete recommended next step (a specific action the " +
    "mayor's office should take), and must NOT begin with a citation marker. " +
    "Earlier paragraphs summarize the history and cite their sources. Be " +
    "specific and concise. If the excerpts don't contain the answer, say so plainly.";
  return chat(system, `Question: ${question}\n\nEmail excerpts:\n${ctx}`);
}

// ── aggregates ──────────────────────────────────────────────────────────────
/** Stream for an internal (@bellwood-demo.gov) sender, derived from its address. */
function internalStream(email: string | null, topics: string[]): StreamKey {
  const e = (email || "").toLowerCase();
  if (e.includes("watch") || e.includes("police") || e.includes("pd-")) return "Police";
  if (e.includes("shift") || e.includes("fire")) return "Fire/EMS";
  if (topics.includes("public_safety")) return "Police";
  if (topics.includes("fire_ems")) return "Fire/EMS";
  return "Interdepartmental";
}

function splitTopics(s: string | null): string[] {
  return s ? s.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

export async function whoEmailsMost(): Promise<{
  constituents: WhoRow[];
  internal: WhoRow[];
}> {
  const constituents = await query<{
    from_name: string | null;
    from_email: string | null;
    n: string;
    topics: string | null;
  }>(
    `SELECT from_name, from_email, count(*) AS n,
            string_agg(DISTINCT topic, ', ' ORDER BY topic) AS topics
     FROM poc.emails
     WHERE direction = 'inbound' AND from_email NOT LIKE $1
     GROUP BY from_name, from_email
     ORDER BY n DESC
     LIMIT $2`,
    ["%demo.gov", 6],
  );
  const internal = await query<{
    from_name: string | null;
    from_email: string | null;
    n: string;
    topics: string | null;
  }>(
    `SELECT from_name, from_email, count(*) AS n,
            string_agg(DISTINCT topic, ', ' ORDER BY topic) AS topics
     FROM poc.emails
     WHERE direction = 'inbound' AND from_email LIKE $1
     GROUP BY from_name, from_email
     ORDER BY n DESC
     LIMIT 5`,
    ["%@bellwood-demo.gov"],
  );
  return {
    constituents: constituents.map((r) => {
      const list = splitTopics(r.topics);
      return {
        name: r.from_name,
        email: r.from_email,
        count: Number(r.n),
        topics: r.topics,
        topicsList: list,
        stream: "Resident" as StreamKey,
      };
    }),
    internal: internal.map((r) => {
      const list = splitTopics(r.topics);
      return {
        name: r.from_name,
        email: r.from_email,
        count: Number(r.n),
        topics: r.topics,
        topicsList: list,
        stream: internalStream(r.from_email, list),
      };
    }),
  };
}

// ── public orchestration ────────────────────────────────────────────────────
export async function ask(
  question: string,
  filters: SearchOpts = {},
): Promise<AskResponse> {
  if (AGG_WHO.test(question)) {
    return { mode: "who_emails_most", question, who: await whoEmailsMost() };
  }
  if (AGG_OPEN.test(question)) {
    const rows = await openItemsRows(24);
    const seen = new Set<string>();
    const openItems: OpenItem[] = [];
    for (const r of rows) {
      // best-match-first already; dedupe to one row per message
      if (seen.has(r.message_id)) continue;
      seen.add(r.message_id);
      openItems.push({
        score: Math.max(0, 1 - Number(r.distance)),
        date: r.date_sent.toISOString(),
        fromName: r.from_name,
        subject: r.subject,
        topic: r.topic,
        stream: (r.stream as StreamKey) ?? deriveStream(r.topic, r.from_email),
        why: snippet(r.chunk_text, 96),
        entityPerson: isKnownPerson(r.from_name) ? r.from_name ?? undefined : undefined,
      });
      if (openItems.length >= 6) break;
    }
    return { mode: "open_items", question, answer: OPEN_LEDE, openItems };
  }

  const crossIntent = CROSS_INTENT.test(question);
  // A cross-reference question wants the whole picture — a narrow auto address/
  // person filter would starve the other streams, so we skip it and let the
  // broad search + stream diversification surface every source.
  const af =
    filters.noAuto || crossIntent
      ? { person: filters.person, address: filters.address, auto: {} as { person?: string; address?: string } }
      : autoFilters(question, filters.person, filters.address);
  const k = filters.k ?? 8;
  const searchOpts: SearchOpts = { ...filters, person: af.person, address: af.address };

  let rows: ChunkRow[];
  if (crossIntent) {
    // Exact federated retrieval (top-N per stream), then diversify across the
    // streams that matter so police/fire/resident/business/interdept all show.
    const qv = toVector(await embed(question));
    const TARGET = new Set<StreamKey>([
      "Resident",
      "Police",
      "Fire/EMS",
      "Business",
      "Interdepartmental",
    ]);
    const all = await crossSourceRows(qv, searchOpts, 2);
    const focused = dedupeByMessage(all.filter((r) => TARGET.has(r.stream as StreamKey)));
    rows = diversifyByStream(focused, Math.max(k, 10));
  } else {
    const pool = dedupeByMessage(
      await searchRows(question, searchOpts, Math.max(k * 2, 16)),
    );
    rows = pool.slice(0, k);
  }

  const ordered = sortNewestFirst(rows);
  const answer = await synthesize(question, ordered);
  const sources = toSources(ordered);
  const distinctStreams = new Set(sources.map((s) => s.stream));

  const applied: AppliedFilters = {};
  if (af.person) applied.person = af.person;
  if (af.address) applied.address = af.address;
  if (filters.since) applied.since = filters.since;
  if (filters.until) applied.until = filters.until;
  if (filters.topic) applied.topic = filters.topic;

  return {
    mode: "rag",
    question,
    sources,
    answer,
    crossSource: distinctStreams.size >= 3,
    auto: af.auto.person || af.auto.address ? af.auto : undefined,
    applied: Object.keys(applied).length ? applied : undefined,
  };
}

// ── retrieval only (for the MCP server: vector search, no LLM synthesis) ─────
export async function searchSources(
  question: string,
  filters: SearchOpts = {},
): Promise<{ sources: Source[]; crossSource: boolean; applied?: AppliedFilters }> {
  const crossIntent = CROSS_INTENT.test(question);
  const af =
    filters.noAuto || crossIntent
      ? { person: filters.person, address: filters.address, auto: {} }
      : autoFilters(question, filters.person, filters.address);
  const k = filters.k ?? 8;
  const searchOpts: SearchOpts = { ...filters, person: af.person, address: af.address };

  let rows: ChunkRow[];
  if (crossIntent) {
    const qv = toVector(await embed(question));
    const TARGET = new Set<StreamKey>([
      "Resident",
      "Police",
      "Fire/EMS",
      "Business",
      "Interdepartmental",
    ]);
    const all = await crossSourceRows(qv, searchOpts, 2);
    const focused = dedupeByMessage(all.filter((r) => TARGET.has(r.stream as StreamKey)));
    rows = diversifyByStream(focused, Math.max(k, 10));
  } else {
    const pool = dedupeByMessage(
      await searchRows(question, searchOpts, Math.max(k * 2, 16)),
    );
    rows = pool.slice(0, k);
  }

  const ordered = sortNewestFirst(rows);
  const sources = toSources(ordered);

  const applied: AppliedFilters = {};
  if (af.person) applied.person = af.person;
  if (af.address) applied.address = af.address;
  if (filters.since) applied.since = filters.since;
  if (filters.until) applied.until = filters.until;
  if (filters.topic) applied.topic = filters.topic;

  return {
    sources,
    crossSource: new Set(sources.map((s) => s.stream)).size >= 3,
    applied: Object.keys(applied).length ? applied : undefined,
  };
}

// ── entity timeline (single pane of glass) ──────────────────────────────────
export async function getEntity(
  type: "person" | "address",
  value: string,
): Promise<EntityResponse> {
  const norm = type === "address" ? normalizeAddress(value) : normalizePerson(value);
  const rows = await query<{
    id: string;
    date_sent: Date;
    direction: Direction;
    from_name: string | null;
    from_email: string | null;
    subject: string | null;
    topic: string | null;
    stream: string;
    body_clean: string | null;
    message_id: string;
    thread_id: string | null;
  }>(
    `SELECT e.id, e.date_sent, e.direction, e.from_name, e.from_email, e.subject,
            e.topic, ${streamCase("e")} AS stream, e.body_clean, e.message_id, e.thread_id
     FROM poc.emails e
     WHERE e.id IN (SELECT email_id FROM poc.email_entities
                    WHERE entity_type = $1 AND entity_norm ILIKE $2)
     ORDER BY e.date_sent DESC
     LIMIT 120`,
    [type, `%${norm}%`],
  );

  const messages: TimelineMessage[] = rows.map((r) => ({
    id: r.id,
    date: r.date_sent.toISOString(),
    direction: r.direction,
    fromName: r.from_name,
    fromEmail: r.from_email,
    subject: r.subject,
    topic: r.topic,
    stream: (r.stream as StreamKey) ?? deriveStream(r.topic, r.from_email),
    snippet: snippet(r.body_clean, 320),
    messageId: r.message_id,
    threadId: r.thread_id,
  }));

  const times = rows.map((r) => r.date_sent.getTime());
  const streams = Array.from(new Set(messages.map((m) => m.stream))) as StreamKey[];

  return {
    type,
    value,
    stats: {
      count: messages.length,
      firstDate: times.length ? new Date(Math.min(...times)).toISOString() : null,
      lastDate: times.length ? new Date(Math.max(...times)).toISOString() : null,
      streams,
    },
    messages,
  };
}

// ── filtered list (dashboard chart drill-in) ────────────────────────────────
export interface ListOpts {
  topic?: string;
  stream?: StreamKey;
  since?: string;
  until?: string;
  inboundOnly?: boolean; // match the inbound-only "by source stream" mix
  limit?: number;
}

/** Newest-first list of the actual emails behind a dashboard chart segment. */
export async function listEmails(
  opts: ListOpts,
): Promise<{ count: number; messages: TimelineMessage[] }> {
  const { clauses, params } = buildFilters(
    { topic: opts.topic, stream: opts.stream, since: opts.since, until: opts.until },
    1,
  );
  if (opts.inboundOnly) clauses.push(`e.direction = 'inbound'`);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const countRows = await query<{ n: string }>(
    `SELECT count(*) AS n FROM poc.emails e ${where}`,
    params,
  );
  const total = Number(countRows[0]?.n ?? 0);

  const limit = Math.min(200, Math.max(1, opts.limit ?? 60));
  const rows = await query<{
    id: string;
    date_sent: Date;
    direction: Direction;
    from_name: string | null;
    from_email: string | null;
    subject: string | null;
    topic: string | null;
    stream: string;
    body_clean: string | null;
    message_id: string;
    thread_id: string | null;
  }>(
    `SELECT e.id, e.date_sent, e.direction, e.from_name, e.from_email, e.subject,
            e.topic, ${streamCase("e")} AS stream, e.body_clean, e.message_id, e.thread_id
     FROM poc.emails e ${where}
     ORDER BY e.date_sent DESC
     LIMIT ${limit}`,
    params,
  );

  const messages: TimelineMessage[] = rows.map((r) => ({
    id: r.id,
    date: r.date_sent.toISOString(),
    direction: r.direction,
    fromName: r.from_name,
    fromEmail: r.from_email,
    subject: r.subject,
    topic: r.topic,
    stream: (r.stream as StreamKey) ?? deriveStream(r.topic, r.from_email),
    snippet: snippet(r.body_clean, 240),
    messageId: r.message_id,
    threadId: r.thread_id,
  }));

  return { count: total, messages };
}

// ── full email detail (source drill-in) ─────────────────────────────────────
export async function getEmailByMessageId(mid: string): Promise<EmailDetail | null> {
  const rows = await query<{
    subject: string | null;
    from_name: string | null;
    from_email: string | null;
    to_email: string | null;
    cc: string | null;
    direction: Direction;
    topic: string | null;
    stream: string;
    date_sent: Date;
    body_clean: string | null;
    body_raw: string | null;
  }>(
    `SELECT e.subject, e.from_name, e.from_email, e.to_email, e.cc, e.direction,
            e.topic, ${streamCase("e")} AS stream, e.date_sent, e.body_clean, e.body_raw
     FROM poc.emails e WHERE e.message_id = $1 LIMIT 1`,
    [mid],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    subject: r.subject,
    fromName: r.from_name,
    fromEmail: r.from_email,
    toEmail: r.to_email,
    cc: r.cc,
    direction: r.direction,
    topic: r.topic,
    stream: (r.stream as StreamKey) ?? deriveStream(r.topic, r.from_email),
    date: r.date_sent.toISOString(),
    bodyClean: r.body_clean ?? "",
    bodyRaw: r.body_raw ?? "",
  };
}

// ── dashboard ───────────────────────────────────────────────────────────────
export async function getDashboard(): Promise<DashboardResponse> {
  const who = await whoEmailsMost();
  const ordered = sortNewestFirst(await openItemsRows(8));
  const openItems = toSources(ordered);

  const volume = await query<{ month: string; n: string }>(
    `SELECT to_char(date_trunc('month', date_sent), 'YYYY-MM') AS month, count(*) AS n
     FROM poc.emails GROUP BY 1 ORDER BY 1`,
  );
  // Source-stream mix reflects what's reaching the village — inbound only.
  const byStream = await query<{ stream: string; n: string }>(
    `SELECT ${streamCase("e")} AS stream, count(*) AS n
     FROM poc.emails e WHERE e.direction = 'inbound' GROUP BY 1 ORDER BY n DESC`,
  );
  const byTopic = await query<{ topic: string; n: string }>(
    `SELECT topic, count(*) AS n FROM poc.emails GROUP BY 1 ORDER BY n DESC`,
  );
  const totals = await query<{ emails: string; chunks: string }>(
    `SELECT (SELECT count(*) FROM poc.emails) AS emails,
            (SELECT count(*) FROM poc.email_chunks) AS chunks`,
  );

  return {
    who,
    openItems,
    volumeByMonth: volume.map((r) => ({ month: r.month, count: Number(r.n) })),
    byStream: byStream.map((r) => ({ stream: r.stream, count: Number(r.n) })),
    byTopic: byTopic.map((r) => ({ topic: r.topic, count: Number(r.n) })),
    totals: {
      emails: Number(totals[0]?.emails ?? 0),
      chunks: Number(totals[0]?.chunks ?? 0),
    },
  };
}
