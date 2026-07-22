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
import { AgentAvatar } from "./AgentBadge";

interface Note { id: string; title: string; body: string; status: string; stale: boolean }

const TAG_C: Record<string, { fg: string; bg: string }> = {
  "draft ready": { fg: C.goldHi, bg: "rgba(231,181,60,.16)" },
  "needs reply": { fg: C.text2, bg: "rgba(var(--ink),.07)" },
  update: { fg: C.goldHi, bg: "rgba(231,181,60,.16)" },
  new: { fg: C.greenText, bg: "rgba(52,201,139,.13)" },
  sensitive: { fg: "#E06C5F", bg: "rgba(224,108,95,.14)" },
  "open issue": { fg: C.text2, bg: "rgba(var(--ink),.07)" },
};

export default function NeedsToKnowCard({ mobile, onOpenEmail, onGoNeedsYou, onGoApprovals }: {
  mobile: boolean;
  onOpenEmail?: (mid: string) => void;
  onGoNeedsYou?: () => void;
  onGoApprovals?: () => void;
}) {
  const [sum, setSum] = useState<MorningSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);

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

  const pressing = sum?.pressing ?? [];
  const events = sum?.calendar ?? [];

  return (
    <div style={{ marginTop: mobile ? 13 : 22 }}>
      {/* no section label — the nameplate below IS the section (RD 2026-07-21) */}
      <div style={{ borderRadius: 16, border: `1px solid ${C.line}`, overflow: "hidden", background: "rgba(var(--ink),.02)" }}>
        {/* the narrative — set like a front-page lede (same treatment as the
            stories below): dateline masthead, serif body, drop cap. */}
        <div style={{ padding: mobile ? "15px 15px 16px" : "18px 18px 19px", borderBottom: pressing.length || events.length ? `1px solid ${C.line2}` : undefined }}>
          {!sum && !failed && <div style={{ color: C.dim, fontSize: 13.5 }}>Reading the morning…</div>}
          {failed && <div style={{ color: C.dim, fontSize: 13.5 }}>Couldn&rsquo;t reach your Chief of Staff. Pull to refresh.</div>}
          {sum && (
            <>
              {/* the nameplate — blackletter, centered, Tribune-style; the
                  edition tracks the clock (Morning / Midday / Evening) */}
              <div style={{ textAlign: "center", borderBottom: `2.5px solid ${C.text}`, paddingBottom: 7, marginBottom: 5 }}>
                <div style={{ fontFamily: FONT.masthead, fontSize: mobile ? 30 : 38, fontWeight: 400, color: C.text, lineHeight: 1.05, letterSpacing: ".015em" }}>
                  {(() => { const h = new Date().getHours(); return h < 12 ? "The Morning Brief" : h < 17 ? "The Midday Brief" : "The Evening Brief"; })()}
                </div>
              </div>
              {/* dateline bar between rules, like a real front page */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderBottom: `1px solid ${C.line2}`, padding: "4px 0 5px", marginBottom: 13, fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: ".09em", textTransform: "uppercase", color: C.dim }}>
                <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                <span style={{ flex: 1 }} />
                <span>By your Chief of Staff{sum.live ? "" : " · draft"}</span>
              </div>
              <div className="nkLede" style={{ fontSize: mobile ? 15.5 : 17, color: C.text, lineHeight: 1.55, fontFamily: FONT.serif }}>{sum.narrative}</div>
            </>
          )}
        </div>

        {/* top email issues + actions required — set like a front page (RD
            2026-07-21, Tribune reference): a small kicker, then a heavy serif
            headline that WRAPS (never ellipsized to one line), then the reason
            as a quiet deck beneath. Each story opens the real email. */}
        {pressing.map((p, i) => {
          const tag = TAG_C[p.tag] ?? TAG_C["needs reply"];
          const clickable = !!(p.messageId && onOpenEmail);
          return (
            <button key={i} onClick={clickable ? () => onOpenEmail!(p.messageId!) : undefined} disabled={!clickable}
              style={{ display: "flex", gap: 12, width: "100%", textAlign: "left", background: "none", border: 0, padding: mobile ? "13px 15px 14px" : "15px 18px 16px", borderTop: `1px solid ${C.line2}`, cursor: clickable ? "pointer" : "default", fontFamily: FONT.sans, alignItems: "flex-start" }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.dim, fontWeight: 700, flexShrink: 0, marginTop: 3 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* kicker — the byline: WHICH desk filed this article, then the tag */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {p.agentKey && <AgentAvatar agentKey={p.agentKey} size={15} />}
                  {p.agentName && <span style={{ fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.text2 }}>{p.agentName}</span>}
                  <span style={{ fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: tag.fg }}>{p.agentName ? `· ${p.tag}` : p.tag}</span>
                </span>
                {/* headline — bold serif, wraps like newsprint */}
                <div style={{ fontFamily: FONT.serif, fontSize: mobile ? 17 : 19, fontWeight: 700, color: C.text, lineHeight: 1.22, letterSpacing: "-.01em", marginTop: 3, overflowWrap: "anywhere" }}>
                  {p.title}
                </div>
                {/* deck — the detail in subtext */}
                {p.why && <div style={{ fontSize: mobile ? 12.5 : 13, color: C.text3, marginTop: 5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{p.why}</div>}
              </div>
              {clickable && <span style={{ color: C.gold, fontSize: 14, fontWeight: 800, flexShrink: 0, alignSelf: "center" }}>→</span>}
            </button>
          );
        })}

        {/* the Mayor's own notes (walk-ins) — spoken via the Ask button, checked
            off here. The empty state teaches the gesture. */}
        {(notes.length > 0 || sum) && (
          <div style={{ borderTop: `1px solid ${C.line2}`, padding: mobile ? "10px 15px 12px" : "11px 18px 13px" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.dim, marginBottom: notes.length ? 8 : 5 }}>Your notes</div>
            {notes.length === 0 && (
              <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5 }}>
                Hold <b style={{ color: C.gold }}>Ask</b> and just tell me — <i>&ldquo;Remember to&hellip;&rdquo;</i>
              </div>
            )}
            {notes.map((n) => (
              <div key={n.id} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "5px 0" }}>
                <button onClick={() => doneNote(n.id)} aria-label="Mark done" title="Mark done"
                  style={{ width: 21, height: 21, borderRadius: 99, border: `1.6px solid ${C.gold}`, background: "transparent", cursor: "pointer", flexShrink: 0, marginTop: 1, color: "transparent", fontSize: 12, lineHeight: 1 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.gold; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "transparent"; }}>
                  ✓
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: mobile ? 13.5 : 14, fontWeight: 700, color: C.text }}>{n.title}</span>
                  {n.stale && <span style={{ marginLeft: 8, fontFamily: FONT.mono, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#E06C5F", background: "rgba(224,108,95,.12)", padding: "2px 6px", borderRadius: 5 }}>still open</span>}
                  {n.body && n.body !== n.title && <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.45, marginTop: 2, overflowWrap: "anywhere" }}>{n.body}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* upcoming events */}
        {events.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.line2}`, padding: mobile ? "10px 15px 12px" : "11px 18px 13px", background: "rgba(var(--ink),.015)" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.dim, marginBottom: 8 }}>Coming up</div>
            {events.slice(0, 4).map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0", fontSize: 13 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.gold, fontWeight: 700, flexShrink: 0, minWidth: mobile ? 96 : 118 }}>{e.when}</span>
                <span style={{ color: C.text2, overflowWrap: "anywhere" }}>{e.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* jump to the full detail screens */}
      {sum && (
        <div style={{ display: "flex", gap: 16, marginTop: 9 }}>
          {onGoNeedsYou && <button onClick={onGoNeedsYou} style={linkBtn}>All email issues →</button>}
          {onGoApprovals && <button onClick={onGoApprovals} style={linkBtn}>Approvals →</button>}
        </div>
      )}
    </div>
  );
}

const linkBtn = { cursor: "pointer", background: "none", border: 0, color: C.gold, fontSize: 13, fontWeight: 800, fontFamily: FONT.sans, padding: 0 } as const;
