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
  messageId: string; date: string; why: string;
}
export const demoEvents = (): { events: DemoEvent[]; stats: { open: number; late: number; done: number } } =>
  events as unknown as { events: DemoEvent[]; stats: { open: number; late: number; done: number } };
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
 *  (full body) isn't reachable — so every reference can still drill to a document. */
export function demoEmail(mid: string) {
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

/** Recent inbox feed — newest inbound first, with the agent's category label. */
export function demoInbox(limit = 120) {
  const idx = searchIndex().filter((r) => r.direction === "inbound");
  idx.sort((a, b) => b.date.localeCompare(a.date));
  const emails = idx.slice(0, limit).map((r) => ({
    messageId: r.messageId, fromName: r.fromName, subject: r.subject,
    snippet: r.snippet, date: r.date, stream: r.stream, topic: r.topic,
    cat: emailCategory(r.topic, r.stream, r.subject),
  }));
  const counts: Record<string, number> = { urgent: 0, important: 0, social: 0, spam: 0 };
  for (const e of emails) if (e.cat in counts) counts[e.cat]++;
  return { count: idx.length, emails, counts };
}

const STOP = new Set("the a an of to in on for and or is are was were be been do does did how what who whats whos with about my our your his her their this that these those i me we us you they them it its as at by from re fwd".split(" "));
const tokenize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Keyword retrieval over the seed index → top-k Source[]. */
export function demoRetrieve(question: string, k = 8): Source[] {
  const toks = tokenize(question);
  if (!toks.length) return [];
  const idx = searchIndex();
  const scored: { r: IndexRow; s: number }[] = [];
  for (const r of idx) {
    let s = 0;
    for (const tk of toks) {
      if (r.t.includes(tk)) s += 1;
      if (r.subject && r.subject.toLowerCase().includes(tk)) s += 1.5; // subject hits weigh more
    }
    if (s > 0) scored.push({ r, s });
  }
  // rank by score, then recency
  scored.sort((a, b) => (b.s - a.s) || b.r.date.localeCompare(a.r.date));
  return scored.slice(0, k).map((x, i): Source => ({
    index: i + 1,
    score: Math.min(0.99, 0.4 + x.s / (toks.length * 2.5)),
    direction: x.r.direction,
    date: x.r.date,
    fromName: x.r.fromName,
    fromEmail: x.r.fromEmail,
    toEmail: x.r.toEmail,
    subject: x.r.subject,
    topic: x.r.topic,
    stream: x.r.stream,
    snippet: x.r.snippet,
    messageId: x.r.messageId,
    threadId: x.r.threadId,
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

/** The demo Ask — aggregate modes + RAG (curated answer or OpenAI synthesis over keyword hits). */
export async function demoAsk(question: string, k = 8): Promise<AskResponse> {
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

  // RAG: keyword retrieval over the seed for real cited sources; the answer is a
  // curated narrative for known demo questions, else OpenAI synthesis over the hits.
  const sources = demoRetrieve(question, k);
  const cur = curatedAnswer(question);
  const answer = cur ?? (await synthesize(question, sources));
  const streams = new Set(sources.map((s) => s.stream));
  return { mode: "rag", question, answer, sources, crossSource: streams.size >= 3 };
}

/** Grounded synthesis via OpenAI when a key is present; deterministic fallback otherwise. */
async function synthesize(question: string, sources: Source[]): Promise<string> {
  if (!sources.length) {
    return "I couldn't find anything in the mayor's mailbox that matches that. Try a name, an address, or a topic like flooding, permits, or FOIA.";
  }
  if (HAS_OPENAI) {
    try {
      const { chat } = await import("../openai");
      const context = sources
        .map((s) => `[${s.index}] ${s.date.slice(0, 10)} · ${s.fromName ?? "?"} · ${s.subject ?? ""}\n${s.snippet}`)
        .join("\n\n");
      const sys =
        "You are the Mayor of Bellwood's chief of staff. Answer the question using ONLY the numbered email excerpts. " +
        "Cite sources inline as [n]. Be concise (2–4 sentences), name people/addresses/dates, and end by noting if anything looks unresolved. " +
        "If the excerpts don't answer it, say so plainly.";
      const out = await chat(sys, `Question: ${question}\n\nEmails:\n${context}`);
      if (out) return out;
    } catch {
      /* fall through to template */
    }
  }
  // deterministic, still-grounded fallback
  const top = sources[0];
  return `Across ${sources.length} messages in the mayor's mailbox, the most relevant is ${top.fromName ?? "a sender"} on ${top.date.slice(0, 10)} — "${top.subject ?? ""}" [1]. See the cited sources below for the full thread.`;
}
