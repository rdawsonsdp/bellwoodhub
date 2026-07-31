"use client";
/*
 * NeedsToKnowCard — the Hub's intelligence briefing (the Chief of Staff agent).
 *
 * One section that COMBINES what used to be "Needs you" (triage) and "Needs you
 * now" (drafts): a short CoS narrative, then the ranked pressing items (top
 * email issues + actions awaiting approval, each linking to the real email),
 * then upcoming events. Self-fetches /api/morning-summary in the configured
 * persona; renders a clean baseline even before the model voices it.
 */
import { useEffect, useState } from "react";
import { C, FONT } from "@/lib/cos-design";
import { getCosPersona, type MorningSummary } from "@/lib/morning";
import type { QueueItem } from "@/lib/queue";
import type { DemoEvent } from "@/lib/demo";
import { BriefPanel, UpcomingPanel, UrgentEmailPanel, WaitingOnYouPanel } from "./dashboard/panels";
import { AgentAvatar } from "./AgentBadge";

interface Note { id: string; title: string; body: string; status: string; stale: boolean }

/** the edition tracks the clock */
const editionTitle = () => { const h = new Date().getHours(); return h < 12 ? "The Morning Brief" : h < 17 ? "The Midday Brief" : "The Evening Brief"; };

/** live date + time for the dateline (RD 2026-07-21) — ticks every 30s */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  return now;
}
const dateLine = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeLine = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const TAG_C: Record<string, { fg: string; bg: string }> = {
  "draft ready": { fg: C.goldHi, bg: "rgba(231,181,60,.16)" },
  "needs reply": { fg: C.text2, bg: "rgba(var(--ink),.07)" },
  update: { fg: C.goldHi, bg: "rgba(231,181,60,.16)" },
  new: { fg: C.greenText, bg: "rgba(52,201,139,.13)" },
  sensitive: { fg: "#E06C5F", bg: "rgba(224,108,95,.14)" },
  "open issue": { fg: C.text2, bg: "rgba(var(--ink),.07)" },
};

export default function NeedsToKnowCard({ mobile, onOpenEmail, onGoNeedsYou, onGoApprovals, onOpenAgent }: {
  mobile: boolean;
  onOpenEmail?: (mid: string) => void;
  onGoNeedsYou?: () => void;
  onGoApprovals?: () => void;
  /** byline tap → the agent that filed the article (RD 2026-07-21) */
  onOpenAgent?: (agentKey: string) => void;
}) {
  const [sum, setSum] = useState<MorningSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<DemoEvent[] | null>(null);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  // story mode (RD 2026-07-21): on mobile the Brief reads like TikTok —
  // one full-screen card per article, vertical swipe with snap.
  const [story, setStory] = useState(false);

  useEffect(() => {
    let alive = true;
    const persona = getCosPersona();
    fetch("/api/morning-summary", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona, hour: new Date().getHours() }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: MorningSummary) => alive && setSum(d))
      .catch(() => alive && setFailed(true));
    fetch("/api/cos-notes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { notes?: Note[] }) => alive && setNotes(d.notes ?? []))
      .catch(() => { /* notes are optional garnish */ });
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { events?: DemoEvent[] }) => alive && setEvents(d.events ?? []))
      .catch(() => alive && setEvents([]));
    fetch("/api/queue")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { items?: QueueItem[] }) => alive && setQueue(d.items ?? []))
      .catch(() => alive && setQueue([]));
    return () => { alive = false; };
  }, []);

  // check off a note — optimistic: it leaves the list at once, PATCH follows
  const doneNote = (id: string) => {
    setNotes((n) => n.filter((x) => x.id !== id));
    void fetch("/api/cos-notes", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: "done" }),
    }).catch(() => {});
  };


  return (
    <div style={{ marginTop: mobile ? 13 : 22, display: "grid", gap: 12 }}>
      {/* Three panels, same order and same components as desktop (RD 2026-07-30).
          The Brief masthead, pressing list and notes block were removed with the
          desktop widget grid; StoryMode stays as an optional full-screen read. */}
      <BriefPanel sum={sum} loading={sum === null && !failed} onRefreshed={() => window.location.reload()} />
      <UpcomingPanel events={events ?? []} loading={events === null} />
      <UrgentEmailPanel items={sum?.pressing ?? []} loading={sum === null && !failed} onOpenEmail={onOpenEmail} />
      <WaitingOnYouPanel items={queue ?? []} loading={queue === null} onGoQueue={onGoApprovals} />

      {story && sum && (
        <StoryMode sum={sum} notes={notes} onClose={() => setStory(false)} onOpenEmail={onOpenEmail} onOpenAgent={onOpenAgent} />
      )}

      {sum && (
        <div style={{ display: "flex", gap: 16, marginTop: 2 }}>
          {onGoNeedsYou && <button onClick={onGoNeedsYou} style={linkBtn}>All email issues →</button>}
          <button onClick={() => setStory(true)} style={linkBtn}>Read as cards →</button>
        </div>
      )}
    </div>
  );
}

const linkBtn = { cursor: "pointer", background: "none", border: 0, color: C.gold, fontSize: 13, fontWeight: 800, fontFamily: FONT.sans, padding: 0 } as const;

/*
 * StoryMode — the Brief as TikTok (RD 2026-07-21): full-screen cards, one story
 * per swipe, native CSS scroll-snap (no gesture library — iOS momentum + snap
 * does the work). ~90% of use is the phone; this is the phone-first read.
 * Card 0 = the lede; then one card per article; the last card = notes + events.
 */
function StoryMode({ sum, notes, onClose, onOpenEmail, onOpenAgent }: {
  sum: MorningSummary;
  notes: Note[];
  onClose: () => void;
  onOpenEmail?: (mid: string) => void;
  onOpenAgent?: (agentKey: string) => void;
}) {
  const total = sum.pressing.length + 2;
  // horizontal deck (RD): stories advance right-to-left like Instagram —
  // each card is one viewport wide; long cards scroll vertically inside.
  const cardBase = {
    width: "100vw", minWidth: "100vw", height: "100dvh", scrollSnapAlign: "start" as const,
    display: "flex", flexDirection: "column" as const, justifyContent: "center",
    padding: "calc(env(safe-area-inset-top) + 54px) 22px calc(env(safe-area-inset-bottom) + 46px)",
    position: "relative" as const, overflowY: "auto" as const,
  };
  const counter = (i: number) => (
    <span style={{ position: "absolute", bottom: "calc(env(safe-area-inset-bottom) + 16px)", left: 0, right: 0, textAlign: "center", fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".14em", color: C.dim }}>
      {i + 1} / {total} · swipe ←
    </span>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 95, background: "var(--c-appbg)", color: C.text }}>
      <button onClick={onClose} aria-label="Close"
        style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 12px)", right: 14, zIndex: 97, width: 36, height: 36, borderRadius: 99, border: `1px solid ${C.line}`, background: "rgba(var(--ink),.07)", color: C.text2, cursor: "pointer", fontSize: 15, backdropFilter: "blur(8px)" }}>✕</button>

      <div className="scrl" style={{ height: "100dvh", display: "flex", flexDirection: "row", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" as never }}>
        {/* card 0 — the lede */}
        <div style={cardBase}>
          <div style={{ textAlign: "center", borderBottom: `2.5px solid ${C.text}`, paddingBottom: 9, marginBottom: 7 }}>
            <div style={{ fontFamily: FONT.masthead, fontSize: 34, lineHeight: 1.05 }}>{editionTitle()}</div>
          </div>
          <div style={{ textAlign: "center", fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.dim, marginBottom: 22 }}>
            {dateLine(new Date())} · {timeLine(new Date())} · by your Chief of Staff
          </div>
          <div className="nkLede" style={{ fontFamily: FONT.serif, fontSize: 20, lineHeight: 1.6, color: C.text }}>{sum.narrative}</div>
          {counter(0)}
        </div>

        {/* one card per article */}
        {sum.pressing.map((p, i) => {
          const tag = TAG_C[p.tag] ?? TAG_C["needs reply"];
          return (
            <div key={i} style={cardBase}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                {p.agentKey && (
                  <span onClick={onOpenAgent ? () => { onClose(); onOpenAgent(p.agentKey!); } : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: onOpenAgent ? "pointer" : undefined }}>
                    <AgentAvatar agentKey={p.agentKey} size={22} />
                    {p.agentName && <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.text2 }}>{p.agentName}</span>}
                  </span>
                )}
                <span style={{ fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: tag.fg, background: tag.bg, padding: "3px 9px", borderRadius: 7 }}>{p.tag}</span>
              </span>
              <div onClick={(p.tag === "update" || p.tag === "new") && p.agentKey && onOpenAgent ? () => { onClose(); onOpenAgent(p.agentKey!); } : undefined}
                style={{ fontFamily: FONT.serif, fontSize: 27, fontWeight: 700, lineHeight: 1.18, letterSpacing: "-.012em", overflowWrap: "anywhere", cursor: (p.tag === "update" || p.tag === "new") && p.agentKey && onOpenAgent ? "pointer" : undefined }}>{p.title}</div>
              {p.why && <div style={{ fontSize: 16, color: C.text2, lineHeight: 1.62, marginTop: 14, overflowWrap: "anywhere" }}>{p.why}</div>}
              <div style={{ display: "flex", gap: 9, marginTop: 20, flexWrap: "wrap" }}>
                {(p.tag === "update" || p.tag === "new") && p.agentKey && onOpenAgent && (
                  <button onClick={() => { onClose(); onOpenAgent(p.agentKey!); }}
                    style={{ cursor: "pointer", border: 0, borderRadius: 12, padding: "13px 20px", fontWeight: 800, fontSize: 14.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}>
                    Open the report →
                  </button>
                )}
                {p.messageId && onOpenEmail && (
                  <button onClick={() => { onClose(); onOpenEmail(p.messageId!); }}
                    style={{ cursor: "pointer", borderRadius: 12, padding: "13px 18px", fontWeight: 700, fontSize: 13.5, fontFamily: FONT.sans, border: `1px solid ${C.line}`, background: (p.tag === "update" || p.tag === "new") ? "rgba(var(--ink),.05)" : "linear-gradient(135deg,#F4CB63,#D7991C)", color: (p.tag === "update" || p.tag === "new") ? C.text2 : "#0a1322" }}>
                    {(p.tag === "update" || p.tag === "new") ? "source email ↗" : "Open the email →"}
                  </button>
                )}
              </div>
              {counter(i + 1)}
            </div>
          );
        })}

        {/* last card — notes + coming up */}
        <div style={cardBase}>
          <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: C.dim, marginBottom: 12 }}>Your notes</div>
          {notes.length === 0 && <div style={{ fontSize: 14.5, color: C.text3, lineHeight: 1.5 }}>Nothing open — hold <b style={{ color: C.gold }}>Ask</b> and tell me, &ldquo;Remember to…&rdquo;</div>}
          {notes.map((n) => (
            <div key={n.id} style={{ padding: "7px 0", fontSize: 16, fontWeight: 700 }}>{n.title}{n.stale && <span style={{ marginLeft: 8, fontFamily: FONT.mono, fontSize: 9.5, color: "#E06C5F" }}>STILL OPEN</span>}</div>
          ))}
          {sum.calendar.length > 0 && (
            <>
              <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: C.dim, margin: "24px 0 12px" }}>Coming up</div>
              {sum.calendar.slice(0, 4).map((e) => (
                <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "5px 0", fontSize: 15 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.gold, fontWeight: 700, flexShrink: 0, minWidth: 104 }}>{e.when}</span>
                  <span style={{ color: C.text2 }}>{e.title}</span>
                </div>
              ))}
            </>
          )}
          <button onClick={onClose} style={{ alignSelf: "center", marginTop: 30, cursor: "pointer", border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 26px", fontWeight: 800, fontSize: 14.5, fontFamily: FONT.sans, background: "rgba(var(--ink),.05)", color: C.text }}>
            Done — back to the Dashboard
          </button>
          {counter(total - 1)}
        </div>
      </div>
    </div>
  );
}
