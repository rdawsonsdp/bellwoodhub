/*
 * demo/index.ts — the keyless demo backend. Serves real content derived from the
 * 30k seed corpus (see scripts/build-demo.mjs) so every Chief-of-Staff screen
 * works with NO database. Activated when DATABASE_URL is absent (or DEMO_MODE=1),
 * so adding a real DATABASE_URL later flips the app to the live canonical path
 * with zero code change. Ask still uses OpenAI for synthesis when a key is present.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AskResponse, Source, StreamKey, WhoRow,
} from "../types";
import type {
  EntityListItem, MemoryDetail, SourcesOverview, DraftRow,
} from "../screens";
import type { NeedsYouToday } from "../capabilities";

import brief from "./data/brief.json";
import entities from "./data/entities.json";
import entityDetails from "./data/entity-details.json";
import sources from "./data/sources.json";
import dashboard from "./data/dashboard.json";
import drafts from "./data/drafts.json";
import curated from "./data/ask-curated.json";
import events from "./data/events.json";
import businessInbox from "./data/business-inbox.json";
import corpusDocs from "./data/corpus-docs.json";
import gmailCalendar from "./data/gmail-calendar.json";

/** A business-mailbox email (the walled Gmail account). Richer than the index
 *  rows so it can drill to a full body without the 31MB search index. */
interface BizRow {
  messageId: string; fromName: string | null; fromEmail: string | null; toEmail: string | null;
  subject: string | null; snippet: string; body: string; date: string;
  topic: string | null; stream: StreamKey; direction: "inbound" | "outbound";
}
const BUSINESS: BizRow[] = businessInbox as unknown as BizRow[];

/** A non-email corpus document (fire/police/permit/inspection/minutes/FOIA).
 *  Ask searches these alongside email — the corpus is the whole record, not the
 *  inbox. Each carries a full body so cited results drill to the source. */
interface DocRow {
  messageId: string; docKind: string; subject: string; fromName: string; fromEmail: string;
  toEmail: string; date: string; topic: string | null; stream: StreamKey; snippet: string; body: string;
}
const DOCS: DocRow[] = corpusDocs as unknown as DocRow[];
const docText = (d: DocRow) => `${d.subject} ${d.body} ${d.fromName}`.toLowerCase();

/** A client-supplied uploaded document (from the Upload Source store), passed
 *  into Ask so it's searchable immediately after ingestion. */
export interface UploadDoc {
  id: string; title?: string; summary?: string; author?: string; date?: string;
  topic?: string | null; stream?: string; docKind?: string;
  fields?: Record<string, string>; entities?: { name: string }[];
}

export const DEMO = process.env.DEMO_MODE === "1" || !process.env.DATABASE_URL;
export const HAS_OPENAI = !!process.env.OPENAI_API_KEY;

// ── small fixtures: static import (tiny) ──
export const demoBrief = (): NeedsYouToday => brief as unknown as NeedsYouToday;
export const demoEntities = (): EntityListItem[] => entities as unknown as EntityListItem[];
export const demoSources = (): SourcesOverview => sources as unknown as SourcesOverview;
export const demoDashboard = () => dashboard;

export interface DemoEvent {
  id: string; title: string; who: string | null; role: string; dueLabel: string;
  status: "open" | "late" | "done"; stream: StreamKey; topic: string | null;
  messageId: string; date: string; why: string; source?: "gov" | "gmail";
}

/** Consolidated calendar = the mayor's Government (Outlook) day + his personal
 *  Business (Gmail) day. This is the Chief-of-Staff view: one place to see the
 *  whole day across both accounts. Gmail entries (charity, social, dispensary)
 *  carry source:"gmail" so the UI can color/badge and filter them. */
export const demoEvents = (): { events: DemoEvent[]; stats: { open: number; late: number; done: number } } => {
  const govData = events as unknown as { events: DemoEvent[]; stats: { open: number; late: number; done: number } };
  const gov = govData.events.map((e) => ({ ...e, source: "gov" as const }));
  const gmail = (gmailCalendar as unknown as DemoEvent[]).map((e) => ({ ...e, source: "gmail" as const }));
  const all = [...gov, ...gmail];
  const stats = { ...govData.stats };
  for (const e of gmail) stats[e.status] = (stats[e.status] ?? 0) + 1;
  return { events: all, stats };
};
// approve/discard in the demo can't persist to a DB — track decisions in memory
// so the card visibly clears (resets on server restart).
const decided = new Set<string>();
export const demoDrafts = (status = "pending"): DraftRow[] =>
  (drafts as unknown as DraftRow[]).filter((d) => d.status === status && !decided.has(d.draftId));
export const demoDecideDraft = (draftId: string): DraftRow[] => {
  decided.add(draftId);
  return demoDrafts("pending");
};

export function demoMemoryDetail(value: string): MemoryDetail | null {
  const d = (entityDetails as Record<string, unknown>)[value.toLowerCase()];
  return (d as MemoryDetail) ?? null;
}

/** Full source email by message_id. Falls back to the seed snippet when the DB
 *  (full body) isn't reachable — so every reference can still drill to a document.
 *  Business-mailbox ids (biz-*) resolve from the walled Gmail fixture. */
export function demoEmail(mid: string) {
  if (mid.startsWith("biz-")) {
    const b = BUSINESS.find((r) => r.messageId === mid);
    if (!b) return null;
    return {
      subject: b.subject, fromName: b.fromName, fromEmail: b.fromEmail, toEmail: b.toEmail,
      cc: null, direction: b.direction, topic: b.topic, stream: b.stream, date: b.date,
      bodyClean: b.body, bodyRaw: b.body, mailbox: "biz",
    };
  }
  if (mid.startsWith("doc-")) {
    const d = DOCS.find((r) => r.messageId === mid);
    if (!d) return null;
    return {
      subject: d.subject, fromName: d.fromName, fromEmail: d.fromEmail, toEmail: d.toEmail,
      cc: null, direction: "inbound" as const, topic: d.topic, stream: d.stream, date: d.date,
      bodyClean: d.body, bodyRaw: d.body, docKind: d.docKind, mailbox: "gov",
    };
  }
  const row = searchIndex().find((r) => r.messageId === mid);
  if (!row) return null;
  return {
    subject: row.subject,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    toEmail: row.toEmail,
    cc: null,
    direction: row.direction,
    topic: row.topic,
    stream: row.stream,
    date: row.date,
    bodyClean: row.snippet,
    bodyRaw: row.snippet,
    mailbox: "gov",
  };
}

/** Entity drill-in (used by /api/entity, /email). Maps the Memory fixture → EntityResponse. */
export function demoEntity(type: "person" | "address", value: string) {
  const d = demoMemoryDetail(value);
  if (!d) {
    return { type, value, stats: { count: 0, firstDate: null, lastDate: null, streams: [] }, messages: [] };
  }
  return {
    type,
    value: d.value,
    stats: { count: d.stats.count, firstDate: d.stats.firstDate, lastDate: d.stats.lastDate, streams: d.stats.streams },
    messages: d.timeline,
  };
}

// ── search index: 31MB, lazy-loaded from disk + cached (Node runtime only) ──
interface IndexRow {
  messageId: string; threadId: string | null; direction: "inbound" | "outbound";
  date: string; fromName: string | null; fromEmail: string | null; toEmail: string | null;
  subject: string | null; topic: string | null; stream: StreamKey; snippet: string; t: string;
}
let _index: IndexRow[] | null = null;
function searchIndex(): IndexRow[] {
  if (_index) return _index;
  // Try a few roots so it resolves both in `next dev` and in the Vercel
  // serverless function (where the file is traced in via next.config).
  const candidates = [
    join(process.cwd(), "lib/demo/data/search-index.json"),
    join(process.cwd(), "web/lib/demo/data/search-index.json"),
    join(__dirname, "data/search-index.json"),
  ];
  for (const p of candidates) {
    try {
      _index = JSON.parse(readFileSync(p, "utf8")) as IndexRow[];
      return _index;
    } catch {
      /* try next */
    }
  }
  _index = [];
  return _index;
}

/** The agent's email category — how the Drafting/Triage agent sorts the inbox. */
export type EmailCat = "urgent" | "important" | "social" | "spam" | "general";
export function emailCategory(topic: string | null, stream: string, subject: string | null): EmailCat {
  const s = (subject || "").toLowerCase();
  if (/\b(webinar|free|newsletter|unsubscribe|%\s*off|discount|promotion|special offer|limited time|save big|act now|vendor demo|sponsorship|sale)\b/.test(s)) return "spam";
  if (stream === "Civic/FOIA" || topic === "foia" || topic === "public_safety" || /\b(urgent|emergency|asap|immediately|again|flooded|fire|gas leak|injury|down|threat)\b/.test(s)) return "urgent";
  if (topic === "thanks" || topic === "parks_events" || /\b(thank you|thanks|invitation|rsvp|congratulations|welcome|festival|taste of bellwood|ribbon)\b/.test(s)) return "social";
  if (["complaint", "drainage", "code_enforcement", "roads", "water_billing", "permits", "sanitation"].includes(topic || "")) return "important";
  return "general";
}

interface InboxEmail {
  messageId: string; fromName: string | null; subject: string | null; snippet: string;
  date: string; stream: StreamKey; topic: string | null; cat: EmailCat; mailbox: string;
}

/** Recent inbox feed — newest inbound first, with the agent's category label.
 *  Scoped by mailbox (the "source system"): "gov" (Outlook seed, default) or
 *  "biz" (the walled Gmail fixture). Business is private — only returned when
 *  explicitly requested, never folded into the government inbox. */
export function demoInbox(limit = 120, mailbox = "gov") {
  let rows: InboxEmail[];
  let total: number;
  if (mailbox === "biz") {
    const biz = [...BUSINESS].filter((r) => r.direction === "inbound").sort((a, b) => b.date.localeCompare(a.date));
    total = biz.length;
    rows = biz.slice(0, limit).map((r) => ({
      messageId: r.messageId, fromName: r.fromName, subject: r.subject, snippet: r.snippet,
      date: r.date, stream: r.stream, topic: r.topic, cat: emailCategory(r.topic, r.stream, r.subject), mailbox: "biz",
    }));
  } else {
    const idx = searchIndex().filter((r) => r.direction === "inbound");
    idx.sort((a, b) => b.date.localeCompare(a.date));
    total = idx.length;
    rows = idx.slice(0, limit).map((r) => ({
      messageId: r.messageId, fromName: r.fromName, subject: r.subject, snippet: r.snippet,
      date: r.date, stream: r.stream, topic: r.topic, cat: emailCategory(r.topic, r.stream, r.subject), mailbox: "gov",
    }));
  }
  const counts: Record<string, number> = { urgent: 0, important: 0, social: 0, spam: 0 };
  for (const e of rows) if (e.cat in counts) counts[e.cat]++;
  return { count: total, emails: rows, counts, mailbox };
}

const STOP = new Set("the a an of to in on for and or is are was were be been do does did how what who whats whos with about my our your his her their this that these those i me we us you they them it its as at by from re fwd".split(" "));
const tokenize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** A scored, source-shaped retrieval candidate (email OR document OR upload). */
interface Cand { src: Source; t: string; }

/** Map an uploaded record (passed from the client store) into a searchable
 *  candidate so freshly-ingested docs are findable right after the progress bar. */
function uploadCands(uploads: UploadDoc[]): Cand[] {
  return uploads.map((u): Cand => ({
    t: `${u.title ?? ""} ${u.summary ?? ""} ${Object.values(u.fields ?? {}).join(" ")} ${(u.entities ?? []).map((e) => e.name).join(" ")}`.toLowerCase(),
    src: {
      index: 0, score: 0, direction: "inbound", date: u.date ?? new Date().toISOString(),
      fromName: u.author ?? null, fromEmail: null, toEmail: null, subject: u.title ?? null,
      topic: u.topic ?? null, stream: (u.stream as StreamKey) ?? "Interdepartmental",
      snippet: u.summary ?? "", messageId: u.id, threadId: null, docKind: u.docKind ?? "Uploaded document",
    },
  }));
}

/** Keyword retrieval over the WHOLE corpus → top-k Source[].
 *  Searches email (the 31MB index) + non-email documents (fire/police/permits/
 *  inspections/minutes/FOIA) + any client-supplied uploads. This is a broad
 *  search tool — the record, not just the inbox. Walled business mail is excluded. */
export function demoRetrieve(question: string, k = 8, uploads: UploadDoc[] = []): Source[] {
  const toks = tokenize(question);
  if (!toks.length) return [];

  const cands: Cand[] = [];
  // emails
  for (const r of searchIndex()) {
    cands.push({
      t: r.t,
      src: {
        index: 0, score: 0, direction: r.direction, date: r.date, fromName: r.fromName,
        fromEmail: r.fromEmail, toEmail: r.toEmail, subject: r.subject, topic: r.topic,
        stream: r.stream, snippet: r.snippet, messageId: r.messageId, threadId: r.threadId,
      },
    });
  }
  // non-email corpus documents
  for (const d of DOCS) {
    cands.push({
      t: docText(d),
      src: {
        index: 0, score: 0, direction: "inbound", date: d.date, fromName: d.fromName,
        fromEmail: d.fromEmail, toEmail: d.toEmail, subject: d.subject, topic: d.topic,
        stream: d.stream, snippet: d.snippet, messageId: d.messageId, threadId: null, docKind: d.docKind,
      },
    });
  }
  // client-supplied uploads (freshly ingested this session)
  cands.push(...uploadCands(uploads));

  const scored: { c: Cand; s: number }[] = [];
  for (const c of cands) {
    let s = 0;
    for (const tk of toks) {
      if (c.t.includes(tk)) s += 1;
      if (c.src.subject && c.src.subject.toLowerCase().includes(tk)) s += 1.5; // subject/title hits weigh more
      if (c.src.docKind) s += 0; // documents compete on equal footing with email
    }
    if (s > 0) scored.push({ c, s });
  }
  scored.sort((a, b) => (b.s - a.s) || b.c.src.date.localeCompare(a.c.src.date));
  return scored.slice(0, k).map((x, i): Source => ({
    ...x.c.src,
    index: i + 1,
    score: Math.min(0.99, 0.4 + x.s / (toks.length * 2.5)),
  }));
}

const whoFromDashboard = (): { constituents: WhoRow[]; internal: WhoRow[] } =>
  (dashboard as { who: { constituents: WhoRow[]; internal: WhoRow[] } }).who;

function detectMode(q: string): "who" | "open" | "rag" {
  const s = q.toLowerCase();
  if (/(who).*(email|contact|reach|write).*(most|often)|most.*(email|contact)/.test(s)) return "who";
  if (/(still open|outstanding|unresolved|needs? (a )?(reply|response)|waiting on|what.?s open|open items|pending)/.test(s)) return "open";
  return "rag";
}

/** A curated answer for a known demo question (substring/keyword match), if any. */
function curatedAnswer(q: string): string | null {
  const s = q.toLowerCase();
  for (const c of curated as { match: string[]; answer: string }[]) {
    if (c.match.some((m) => s.includes(m))) return c.answer;
  }
  return null;
}

/** The demo Ask — aggregate modes + RAG (curated answer or OpenAI synthesis over keyword hits).
 *  `uploads` are client-supplied documents folded into the searchable corpus. */
export async function demoAsk(question: string, k = 8, uploads: UploadDoc[] = []): Promise<AskResponse> {
  const mode = detectMode(question);

  if (mode === "who") {
    return { mode: "who_emails_most", question, who: whoFromDashboard() };
  }
  if (mode === "open") {
    const items = demoBrief().awaitingReply.slice(0, 8).map((b) => ({
      score: 0.9, date: b.date, fromName: b.fromName, subject: b.subject,
      topic: null, stream: b.stream, why: b.why,
    }));
    return { mode: "open_items", question, answer: `${items.length} threads have the ball in your court.`, openItems: items };
  }

  // RAG: keyword retrieval across the WHOLE corpus (email + documents + uploads)
  // for real cited sources; the answer is a curated narrative for known demo
  // questions, else OpenAI synthesis over the hits.
  const sources = demoRetrieve(question, k, uploads);
  const cur = curatedAnswer(question);
  const answer = cur ?? (await synthesize(question, sources));
  const streams = new Set(sources.map((s) => s.stream));
  return { mode: "rag", question, answer, sources, crossSource: streams.size >= 3 };
}

/** Grounded synthesis via OpenAI when a key is present; deterministic fallback otherwise. */
async function synthesize(question: string, sources: Source[]): Promise<string> {
  if (!sources.length) {
    return "I couldn't find anything in the village record that matches that. Try a name, an address, or a topic like flooding, permits, fire reports, or FOIA.";
  }
  if (HAS_OPENAI) {
    try {
      const { chat } = await import("../openai");
      const context = sources
        .map((s) => `[${s.index}] ${s.date.slice(0, 10)} · ${s.docKind ?? "Email"} · ${s.fromName ?? "?"} · ${s.subject ?? ""}\n${s.snippet}`)
        .join("\n\n");
      const sys =
        "You are the Mayor of Bellwood's chief of staff. Answer the question using ONLY the numbered records below — these span emails AND official documents (fire/EMS reports, police reports, permits, inspections, board minutes, FOIA requests). " +
        "Cite sources inline as [n]. Be concise (2–4 sentences), name people/addresses/dates, draw across record types when relevant, and end by noting if anything looks unresolved. " +
        "If the records don't answer it, say so plainly.";
      const out = await chat(sys, `Question: ${question}\n\nRecords:\n${context}`);
      if (out) return out;
    } catch {
      /* fall through to template */
    }
  }
  // deterministic, still-grounded fallback
  const top = sources[0];
  return `Across ${sources.length} records in the village archive, the most relevant is a ${top.docKind ?? "message"} from ${top.fromName ?? "a sender"} on ${top.date.slice(0, 10)} — "${top.subject ?? ""}" [1]. See the cited sources below.`;
}
