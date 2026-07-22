/*
 * morning-live.ts — the LIVE "Needs to Know" briefing (the Chief of Staff agent).
 *
 * This is the real intelligence layer: it folds three live sources into one
 * ranked briefing, then voices a short narrative in the configured, prompt-
 * tunable CoS persona.
 *
 *   1. TOP EMAIL ISSUES   ← triage needs_reply, already ranked by named rules
 *   2. ACTIONS REQUIRED   ← pending drafts (a reply is written, needs approval)
 *   3. UPCOMING EVENTS    ← the app.calendar_events mirror
 *
 * A deterministic baseline always renders (keyless); the model rewrite of the
 * narrative is best-effort. Never invents items — every pressing row carries a
 * messageId that opens the real email. Server-only (uses lib/db).
 */
import { query } from "./db";
import { readTriage } from "./triage/read";
import { listNotes, type CosNote } from "./cos-notes";
import {
  fillGreeting, COS_TONE_PRESETS,
  type CosPersona, type CosTone, type MorningSummary, type PressingItem,
  type BriefCalendarItem, type AgentNote,
} from "./morning";

const HAS_OPENAI = !!process.env.OPENAI_API_KEY;
const TZ = "America/Chicago"; // the Mayor's clock, not the server's

const prettyKey = (k: string) =>
  k.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** the slice of a persisted agent run the Brief agent reads */
type RunOutput = {
  headline?: string;
  urgency?: string;
  digest?: { title?: string; kind?: string; point?: string; sourceMessageIds?: string[] }[];
};

const whenLabel = (d: Date, allDay: boolean): string => {
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const isToday = d.toLocaleDateString("en-CA", { timeZone: TZ }) === today;
  const prefix = isToday ? "Today" : day;
  if (allDay) return `${prefix} · all day`;
  return `${prefix} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}`;
};

/** The always-renders fallback narrative — plain, honest, no model needed. */
function baselineNarrative(top: PressingItem[], cal: BriefCalendarItem[], needYou: number): string {
  const bits: string[] = [];
  if (top.length) {
    bits.push(`${needYou || top.length} item${(needYou || top.length) === 1 ? "" : "s"} need your attention` + (top[0] ? `, starting with "${top[0].title}".` : "."));
  } else {
    bits.push("Nothing is waiting on you right now — you're clear.");
  }
  if (cal.length) {
    bits.push(`${cal.length} on your calendar; next up is ${cal[0].title}${cal[0].when ? ` (${cal[0].when})` : ""}.`);
  }
  return bits.join(" ");
}

export async function liveMorningSummary(persona: CosPersona, hour?: number): Promise<MorningSummary> {
  const tone: CosTone = persona.tone === "formal" || persona.tone === "brisk" ? persona.tone : "warm";

  // ── 2. ACTIONS REQUIRED — pending drafts (a reply is written, awaiting sign-off)
  const drafts = await query<{ subject: string | null; to_message_id: string | null; agent: string }>(
    `SELECT subject, to_message_id, agent FROM app.drafts WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5`,
  ).catch(() => [] as { subject: string | null; to_message_id: string | null; agent: string }[]);
  const actionItems: PressingItem[] = drafts.map((d) => ({
    title: d.subject || "(draft reply)",
    why: "A reply is drafted — needs your approval.",
    tag: "draft ready",
    messageId: d.to_message_id ?? undefined,
    agentKey: d.agent, agentName: prettyKey(d.agent),
  }));

  // ── 1. TOP EMAIL ISSUES — triage needs_reply, already ranked
  const view = await readTriage().catch(() => null);
  const emailItems: PressingItem[] = (view?.needsReply ?? []).slice(0, 6).map((it) => ({
    title: it.subject || "(no subject)",
    why: it.reason || it.fromName || it.fromEmail || "",
    tag: "needs reply",
    messageId: it.sourceRef,
    // the triage pass reads the mailbox through the mail desk — that's the byline
    agentKey: "email-gmail", agentName: "Mail Triage",
  }));

  // ── every agent forwards its stories to the Brief agent (RD 2026-07-21).
  // The latest run per desk contributes its news-brief digest items; the desk's
  // urgency seeds a deterministic importance score (public-safety red beats a
  // routine follow-up), which orders the page even keyless. The model re-ranks
  // below when a key is present.
  type Candidate = PressingItem & { score: number };
  const runRows = await query<{ agent_key: string; output: RunOutput | null }>(
    `SELECT DISTINCT ON (agent_key) agent_key, output FROM canonical.agent_runs ORDER BY agent_key, ran_at DESC`,
  ).catch(() => [] as { agent_key: string; output: RunOutput | null }[]);
  const URG: Record<string, number> = { red: 100, yellow: 55, clear: 15 };
  const storyItems: Candidate[] = runRows.flatMap((r) => {
    const base = URG[r.output?.urgency ?? "clear"] ?? 15;
    return (r.output?.digest ?? [])
      .filter((d) => (d.title || d.point || "").trim())
      .slice(0, 3)
      .map((d, i) => ({
        title: d.title || (d.point ?? "").slice(0, 90),
        why: d.point ?? "",
        tag: d.kind === "update" ? "update" : "new",
        messageId: d.sourceMessageIds?.[0],
        agentKey: r.agent_key, agentName: prettyKey(r.agent_key),
        score: base - i * 5 + (d.kind === "update" ? 3 : 0),
      }));
  });

  // Merge the desks' stories with the mail signals; dedup; deterministic order
  // by importance; the front page runs at most 7 articles.
  const candidates: Candidate[] = [
    ...actionItems.map((a, i) => ({ ...a, score: 80 - i })),
    ...emailItems.map((e, i) => ({ ...e, score: 70 - i * 2 })),
    ...storyItems,
  ];
  const pressing: PressingItem[] = [];
  const seen = new Set<string>();
  for (const it of candidates.sort((a, b) => b.score - a.score)) {
    const key = it.messageId || it.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pressing.push({ title: it.title, why: it.why, tag: it.tag, messageId: it.messageId, agentKey: it.agentKey, agentName: it.agentName });
    if (pressing.length >= 7) break;
  }

  // ── 3. UPCOMING EVENTS — the calendar mirror
  const evRows = await query<{ title: string | null; starts_at: Date; all_day: boolean }>(
    `SELECT title, starts_at, all_day FROM app.calendar_events
      WHERE status <> 'cancelled' AND starts_at >= now() - interval '2 hours'
      ORDER BY starts_at LIMIT 6`,
  ).catch(() => [] as { title: string | null; starts_at: Date; all_day: boolean }[]);
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const calendar: BriefCalendarItem[] = evRows.map((r, i) => ({
    id: String(i),
    title: r.title ?? "(untitled)",
    when: whenLabel(new Date(r.starts_at), r.all_day),
    source: "gmail",
  }));
  const eventsToday = evRows.filter((r) => new Date(r.starts_at).toLocaleDateString("en-CA", { timeZone: TZ }) === todayISO).length;

  // ── agent activity — each desk's latest run headline (context for the voice)
  const agents: AgentNote[] = runRows
    .filter((r) => r.output?.headline && r.agent_key !== "chief")
    .slice(0, 5)
    .map((r) => ({ name: prettyKey(r.agent_key), note: r.output!.headline! }));

  // ── the Mayor's own notes (walk-ins, FEAT-36) — spoken follow-ups the
  // narrative weaves in; ones open past NUDGE_DAYS get called out as still open.
  const notes: CosNote[] = await listNotes("open", 8).catch(() => []);

  const needYou = actionItems.length + (view?.needsReply?.length ?? 0) + notes.length;
  const counts = { needYou, eventsToday };

  const part = hour == null ? "morning" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  let greeting = fillGreeting(persona, hour);
  let narrative = baselineNarrative(pressing, calendar, needYou);
  let live = false;

  if (HAS_OPENAI) {
    try {
      const { chat } = await import("./openai");
      const sys =
        `You are ${persona.mayorName}'s chief of staff, briefing the mayor as the ${part} begins. ` +
        `${COS_TONE_PRESETS[tone].prompt} ${persona.instructions || ""} ` +
        `Respond with a JSON object: {"greeting": string, "briefing": string, "order": number[]}. ` +
        `"greeting": a short, personal ONE-sentence greeting addressing him by name (${persona.mayorName}), fitting the ${part}, in your own voice — not a generic "Good ${part}, Mayor." ` +
        `"briefing": 2-3 short sentences: what most needs him, the single most important thing, and a nod to what's on his calendar. ` +
        `"order": the numbered articles below re-ranked by IMPORTANCE TO THE MAYOR, most important first. ` +
        `Weigh three named factors: URGENCY (time pressure, escalation), RELEVANCE (does this touch his duties, commitments, constituents), ` +
        `and RISK (safety, security, money, reputation). Each entry: {"n": number, "why": string} — "why" is ONE short clause ` +
        `naming the deciding factor(s), e.g. "risk: active account takeover" or "urgency: 3rd follow-up, 6 days". ` +
        `Use ONLY the facts below; never invent items or numbers. Plain text, no markdown.`;
      const ctx = [
        `The articles, numbered: ${pressing.map((p, i) => `${i + 1}. ${p.title} [${p.tag}] — ${p.why}`).join(" | ") || "none"}.`,
        `The mayor's own notes (${notes.length}): ${notes.map((n) => n.title + (n.stale ? " (still open for days)" : "")).join("; ") || "none"}. Mention his notes naturally — they're promises he made in person. Nudge ONLY the ones marked "still open for days"; never invent how long anything has been open.`,
        `Upcoming events (${calendar.length}): ${calendar.map((c) => c.title + (c.when ? ` (${c.when})` : "")).join("; ") || "nothing scheduled"}.`,
        `Agent activity: ${agents.map((a) => `${a.name} — ${a.note}`).join("; ") || "quiet"}.`,
        `${needYou} item(s) need your attention.`,
      ].join("\n");
      const out = await chat(sys, ctx, { temperature: 0.85, json: true });
      if (out) {
        const j = JSON.parse(out) as { greeting?: string; briefing?: string; order?: (number | { n?: number; why?: string })[] };
        if (j.greeting && j.briefing) { greeting = String(j.greeting).trim(); narrative = String(j.briefing).trim(); live = true; }
        // the CoS's own ranking — urgency/relevance/risk, applied only as a
        // valid permutation-subset; anything skipped keeps deterministic order.
        // THE DECISION IS TRACKED: rationale rides each item (rankWhy) and the
        // full ranking lands in the audit ledger (RD 2026-07-22).
        if (Array.isArray(j.order) && j.order.length) {
          const picked = j.order
            .map((e) => {
              const n = typeof e === "number" ? e : Number(e?.n);
              const item = pressing[n - 1];
              if (item && typeof e === "object" && e?.why) item.rankWhy = String(e.why).slice(0, 140);
              return item;
            })
            .filter((x): x is PressingItem => !!x);
          if (picked.length) {
            const rest = pressing.filter((p) => !picked.includes(p));
            pressing.splice(0, pressing.length, ...picked, ...rest);
            try {
              const { logAudit } = await import("./audit");
              void logAudit({ actor: null, action: "brief.rank", objectType: "briefing", meta: {
                factors: "urgency·relevance·risk",
                ranking: picked.map((p, i) => ({ pos: i + 1, title: p.title.slice(0, 90), by: p.agentName ?? null, why: p.rankWhy ?? null })),
              } });
            } catch { /* the ledger must never break the briefing */ }
          }
        }
      }
    } catch { /* keep the deterministic baseline */ }
  }

  return {
    greeting,
    narrative,
    pressing,
    calendar,
    agents,
    counts,
    weather: null,
    onThisDay: null,
    tone,
    live,
    generatedAt: new Date().toISOString(),
  };
}
