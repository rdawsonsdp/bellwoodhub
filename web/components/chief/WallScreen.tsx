"use client";
/*
 * WallScreen — the Mayor's default screen (LOOK). Answers ONE question:
 * "what needs me right now?" — in three bands:
 *
 *   NEEDS YOU NOW  ≤3 rows, red→yellow, one action verb each. Calm is a
 *                  feature: nothing urgent says so, full stop.
 *   THE CABINET    one card per domain agent (mobile: swipeable deck,
 *                  desktop: grid) → tap opens the AgentDigestSheet.
 *   FOOTER         "{handled} handled · {waiting} waiting · ≈{eta} min".
 *
 * Every visible count/date comes from ONE /api/wall call (invariant 9) —
 * this component computes nothing itself. Shared by MobileApp and ChiefApp
 * via the `variant` prop; replaces TodayScreen (weather / on-this-day /
 * inbox preview intentionally gone from the Mayor's default).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { C, FONT, card, eyebrow } from "@/lib/cos-design";
import { getCosPersona } from "@/lib/morning";
import type { WallPayload, WallItem, CabinetCard, WallSchedule } from "@/lib/wall";
import AgentDigestSheet from "./AgentDigestSheet";
import AddAgentSheet from "./AddAgentSheet";
import { AgentAvatar, AgentChip } from "./AgentBadge";
import { logUsage } from "@/lib/usage";

interface Props {
  variant: "mobile" | "desktop";
  onOpenEmail?: (mid: string) => void;
  /** Until the Phase 3 Queue lands, "Approve" deep-links to the existing
   *  approvals surface (mobile: Emails · Agent Answered, desktop: Approvals). */
  onGoApprovals: () => void;
}

const URGENCY_C: Record<string, string> = { red: C.red, yellow: C.orange, clear: C.green };

const shortName = (name: string) => name.replace(/ Agent$/, "");

export default function WallScreen({ variant, onOpenEmail, onGoApprovals }: Props) {
  const [wall, setWall] = useState<WallPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const mobile = variant === "mobile";
  const openDigest = (agentKey: string) => {
    logUsage("digest_open", { agentKey }); // adoption metric #4
    setOpenAgent(agentKey);
  };

  useEffect(() => {
    let live = true;
    const persona = getCosPersona();
    fetch(`/api/wall?hour=${new Date().getHours()}&name=${encodeURIComponent(persona.mayorName)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((w) => live && setWall(w))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const act = (it: WallItem) => {
    if (it.target.kind === "queue") onGoApprovals();
    else openDigest(it.target.agentKey);
  };

  return (
    <div style={{ maxWidth: mobile ? 760 : 1080, margin: "0 auto", padding: mobile ? "0 16px 28px" : "26px 32px 40px" }}>
      {/* ── HERO: the morning letterhead — warm paper, navy serif greeting, and
          the Village bell as a watermark bleeding off the right edge (the full
          lockup is oversized + right-anchored so overflow:hidden clips the
          wordmark and only the bell emblem shows). Fixed palette, like real
          letterhead, so it reads in all four themes; dated by the SAME clock
          as the content below it (invariant 9). ── */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, marginTop: mobile ? 14 : 0, padding: mobile ? "24px 20px 22px" : "30px 28px 26px", background: "linear-gradient(120deg,#FDFAF1 0%,#FAF3E2 55%,#F3E7CB 100%)", border: "1px solid rgba(180,140,60,.28)", boxShadow: "0 14px 36px rgba(20,40,80,.16)" }}>
        {(() => {
          const h = mobile ? 205 : 285; // logo is 400×170; bell ≈ left 37.5%
          const w = h * (400 / 170);
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/bellwood.webp" alt="" aria-hidden style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: -(w * 0.605), height: h, opacity: 0.32, pointerEvents: "none", userSelect: "none" }} />
          );
        })()}
        <div style={{ position: "relative", maxWidth: mobile ? "78%" : "72%" }}>
          <div style={{ ...eyebrow("#8a6a1f"), fontWeight: 700 }}>Your Chief of Staff · {wall?.dateLabel ?? "—"}</div>
          <div style={{ fontFamily: FONT.serif, fontSize: "clamp(21px, 5vw, 30px)", fontWeight: 600, color: "#14335c", lineHeight: 1.12, marginTop: 9, letterSpacing: "-.01em" }}>
            {wall?.greeting ?? (failed ? "The Wall is unavailable." : "Reading the cabinet…")}
          </div>
        </div>
      </div>

      {/* ── NEEDS YOU NOW ── */}
      <div style={{ marginTop: 24 }}>
        <div style={sectionHead}>Needs you now</div>
        <div style={{ ...card, overflow: "hidden" }}>
          {!wall && !failed && <Empty text="…" />}
          {failed && <Empty text="Couldn't reach your agents. Pull to refresh." />}
          {wall && wall.needsYouNow.length === 0 && (
            <Empty text={wall.footer.waiting > 0 ? `Nothing urgent. ${wall.footer.waiting} draft${wall.footer.waiting === 1 ? "" : "s"} ready.` : "Nothing urgent. Queue is clear."} />
          )}
          {wall?.needsYouNow.map((it, i) => (
            <div key={it.id} role="button" tabIndex={0} onClick={() => act(it)} onKeyDown={(e) => e.key === "Enter" && act(it)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderTop: i ? `1px solid ${C.line2}` : undefined, cursor: "pointer" }}>
              <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: URGENCY_C[it.urgency], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: mobile ? 14.5 : 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.line}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                  {it.agentKeys.map((k) => {
                    const c = wall.cabinet.find((x) => x.agentKey === k);
                    return <AgentChip key={k} agentKey={k} label={c ? shortName(c.name) : k} />;
                  })}
                </div>
              </div>
              <span style={{ color: C.gold, fontSize: 13, fontWeight: 800, fontFamily: FONT.sans, whiteSpace: "nowrap", flexShrink: 0 }}>{it.action} →</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── THE CABINET ── */}
      <div style={{ marginTop: 26 }}>
        <div style={sectionHead}>The cabinet</div>
        <div
          className={mobile ? "scrl" : undefined}
          style={
            mobile
              ? { display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -16px", padding: "2px 16px 8px", WebkitOverflowScrolling: "touch" }
              : { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }
          }
        >
          {!wall && [0, 1, 2].map((i) => <div key={i} style={{ ...card, height: 118, minWidth: mobile ? "74%" : undefined, scrollSnapAlign: "start", animation: "bwPulse 1.3s ease-in-out infinite" }} />)}
          {wall?.cabinet.map((c) =>
            c.agentKey === "schedule" ? (
              <ScheduleCardView key={c.agentKey} c={c} schedule={wall.schedule} mobile={mobile} onOpen={() => openDigest(c.agentKey)} />
            ) : (
              <CabinetCardView key={c.agentKey} c={c} mobile={mobile} onOpen={() => openDigest(c.agentKey)} />
            ),
          )}
          {wall && <AddAgentCard mobile={mobile} onOpen={() => setAddOpen(true)} />}
        </div>
      </div>

      {/* ── FOOTER: the day in one line ── */}
      {wall && (
        <button onClick={onGoApprovals} style={{ display: "block", width: "100%", marginTop: 20, padding: "13px 10px", background: "none", border: 0, cursor: "pointer", textAlign: "center", fontFamily: FONT.mono, fontSize: 11.5, color: C.muted, letterSpacing: ".04em" }}>
          {wall.footer.handled} handled by your agents · <span style={{ color: C.goldHi }}>{wall.footer.waiting} waiting on you</span>{wall.footer.waiting > 0 && ` · ≈${wall.footer.etaMinutes} min`}
        </button>
      )}

      {addOpen && <AddAgentSheet variant={variant} onClose={() => setAddOpen(false)} />}

      {openAgent && wall && wall.runs[openAgent] && (
        <AgentDigestSheet
          run={wall.runs[openAgent]}
          card={wall.cabinet.find((c) => c.agentKey === openAgent)!}
          variant={variant}
          onClose={() => setOpenAgent(null)}
          onOpenMessage={(mid) => onOpenEmail?.(mid)}
          onGoApprovals={() => { setOpenAgent(null); onGoApprovals(); }}
        />
      )}
    </div>
  );
}

function CabinetCardView({ c, mobile, onOpen }: { c: CabinetCard; mobile: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{ ...card, textAlign: "left", cursor: "pointer", padding: "14px 15px", minWidth: mobile ? "74%" : undefined, scrollSnapAlign: mobile ? "start" : undefined, display: "flex", flexDirection: "column", gap: 8, color: C.text, fontFamily: FONT.sans }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <AgentAvatar agentKey={c.agentKey} size={26} />
        <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(c.name)}</span>
        {c.walled && <span style={privatePill}>Private</span>}
        <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[c.statusDot], flexShrink: 0, boxShadow: c.statusDot !== "clear" ? `0 0 0 3px ${URGENCY_C[c.statusDot]}22` : undefined }} />
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 14.5, color: C.text2, lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.headline}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: "auto" }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: c.counts.needsYou ? C.goldHi : C.muted }}>
          {c.counts.newItems} new{c.counts.needsYou > 0 && ` · ${c.counts.needsYou} need you`}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{c.lastRunLabel}</span>
      </div>
    </button>
  );
}

/** The Schedule seat wears a calendar face: the next three days at a glance
 *  (a visual cue, not a calendar replacement) + links OUT to the real
 *  calendars — calendar work never happens in the app. */
function ScheduleCardView({ c, schedule, mobile, onOpen }: { c: CabinetCard; schedule: WallSchedule; mobile: boolean; onOpen: () => void }) {
  const SRC: Record<string, string> = { gov: C.gold, gmail: C.purpleText }; // gold ticks (gov) / violet (personal gmail)
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} style={{ ...card, textAlign: "left", cursor: "pointer", padding: "14px 15px", minWidth: mobile ? "74%" : undefined, scrollSnapAlign: mobile ? "start" : undefined, display: "flex", flexDirection: "column", gap: 10, color: C.text, fontFamily: FONT.sans }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <AgentAvatar agentKey={c.agentKey} size={26} />
        <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0 }}>{shortName(c.name)}</span>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[c.statusDot], flexShrink: 0, boxShadow: c.statusDot !== "clear" ? `0 0 0 3px ${URGENCY_C[c.statusDot]}22` : undefined }} />
      </div>
      {/* the "Coming up" face: big serif numeral, month/weekday stacked, a dot
          marking today; gold/violet tick bars; empty-today stated, not hidden */}
      <div style={{ display: "grid", gap: 10 }}>
        {schedule.days.map((d) => (
          <div key={d.date} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ display: "flex", gap: 5, alignItems: "flex-start", width: 52, flexShrink: 0 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 23, fontWeight: 600, lineHeight: 1, color: C.text }}>{d.dayNum}</span>
              <span style={{ paddingTop: 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: C.muted, lineHeight: 1.2 }}>{d.month}</span>
                  {d.isToday && <span style={{ width: 4, height: 4, borderRadius: 99, background: C.red }} />}
                </span>
                <span style={{ display: "block", fontSize: 8.5, color: C.dim, lineHeight: 1.2 }}>{d.weekday}</span>
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6, paddingTop: 2 }}>
              {d.events.length === 0 && (
                <span style={{ fontSize: 12, color: C.dim, borderLeft: `2.5px solid ${C.line}`, paddingLeft: 8, lineHeight: 1.4 }}>No events today</span>
              )}
              {d.events.map((e, i) => (
                <span key={i} style={{ display: "block", borderLeft: `2.5px solid ${SRC[e.source]}`, paddingLeft: 8, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 650, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                  {e.time && <span style={{ display: "block", fontFamily: FONT.mono, fontSize: 9.5, color: C.muted, marginTop: 1 }}>{e.time}</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto", flexWrap: "wrap" }}>
        {schedule.links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 700, color: C.blue, textDecoration: "none" }}>
            {l.label} ↗
          </a>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{c.lastRunLabel}</span>
      </div>
    </div>
  );
}

/** The growth story, visible: a new cabinet seat is one interview away. */
function AddAgentCard({ mobile, onOpen }: { mobile: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{ minWidth: mobile ? "56%" : undefined, minHeight: 118, scrollSnapAlign: mobile ? "start" : undefined, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 15px", borderRadius: 16, border: "1.5px dashed rgba(var(--ink),.28)", background: "transparent", cursor: "pointer", color: C.muted, fontFamily: FONT.sans }}>
      <span style={{ width: 34, height: 34, borderRadius: 99, border: "1.5px dashed rgba(var(--ink),.32)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, lineHeight: 1, fontWeight: 600 }}>+</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: C.text2 }}>Add an agent</span>
      <span style={{ fontSize: 10.5, color: C.dim, textAlign: "center", lineHeight: 1.4 }}>Interview-onboarded · starts observe-only</span>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 22, textAlign: "center", color: C.dim, fontSize: 13.5 }}>{text}</div>;
}

/** Serif section heading — the "Coming up" idiom: quiet, readable, no caps. */
const sectionHead: CSSProperties = {
  fontFamily: FONT.serif, fontSize: 20, fontWeight: 600, color: C.text,
  letterSpacing: "-.01em", marginBottom: 11,
};

const privatePill: CSSProperties = {
  padding: "2px 8px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em",
  fontFamily: FONT.mono, textTransform: "uppercase", color: C.purpleText,
  background: "rgba(157,139,255,.14)", border: "1px solid rgba(157,139,255,.3)", flexShrink: 0,
};
