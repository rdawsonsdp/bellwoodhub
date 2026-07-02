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
import type { WallPayload, WallItem, CabinetCard } from "@/lib/wall";
import AgentDigestSheet from "./AgentDigestSheet";

interface Props {
  variant: "mobile" | "desktop";
  onOpenEmail?: (mid: string) => void;
  /** Until the Phase 3 Queue lands, "Approve" deep-links to the existing
   *  approvals surface (mobile: Emails · Agent Answered, desktop: Approvals). */
  onGoApprovals: () => void;
}

const URGENCY_C: Record<string, string> = { red: C.red, yellow: C.orange, clear: C.green };

/** Stroke icons per cabinet seat (house SVG idiom — Material names in the
 *  registry stay the spec; these are their local renderings). */
const AGENT_ICON: Record<string, string[]> = {
  police: ["M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"],
  fire: ["M12 2c1 4-3 5.5-3 9.5a3 3 0 0 0 6 0c0-1.6-.8-2.8-.8-2.8s3.8 1.8 3.8 5.8a6 6 0 0 1-12 0c0-6 5-8 6-12.5z"],
  council: ["M3 21h18", "M5 21V10M9 21V10M15 21V10M19 21V10", "M3 10l9-7 9 7"],
  constituent: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  schedule: ["M7 3v3M17 3v3M4 9h16", "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"],
  hr: ["M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"],
  "harbor-wellness": ["M4 9h16v11H4z", "M3 9l2-5h14l2 5", "M9 20v-6h6v6"],
};
function AgentIco({ agentKey, w = 17, color }: { agentKey: string; w?: number; color?: string }) {
  const d = AGENT_ICON[agentKey] ?? ["M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z"];
  return (
    <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const shortName = (name: string) => name.replace(/ Agent$/, "");

export default function WallScreen({ variant, onOpenEmail, onGoApprovals }: Props) {
  const [wall, setWall] = useState<WallPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const mobile = variant === "mobile";

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
    else setOpenAgent(it.target.agentKey);
  };

  return (
    <div style={{ maxWidth: mobile ? 760 : 1080, margin: "0 auto", padding: mobile ? "0 16px 28px" : "26px 32px 40px" }}>
      {/* ── greeting: one sober line, dated by the SAME clock as the content ── */}
      <div style={{ marginTop: mobile ? 14 : 0 }}>
        <div style={eyebrow(C.dim)}>Your Chief of Staff · {wall?.dateLabel ?? "—"}</div>
        <div style={{ fontFamily: FONT.serif, fontSize: "clamp(21px, 5vw, 30px)", fontWeight: 600, color: C.text, lineHeight: 1.12, marginTop: 8, letterSpacing: "-.01em" }}>
          {wall?.greeting ?? (failed ? "The Wall is unavailable." : "Reading the cabinet…")}
        </div>
      </div>

      {/* ── NEEDS YOU NOW ── */}
      <div style={{ marginTop: 22 }}>
        <div style={{ ...eyebrow(C.dim), marginBottom: 10 }}>Needs you now</div>
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
                <div style={{ fontSize: mobile ? 13.5 : 14.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.line}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                  {it.agentKeys.map((k) => {
                    const c = wall.cabinet.find((x) => x.agentKey === k);
                    return <span key={k} style={agentChip}> <AgentIco agentKey={k} w={11} /> {c ? shortName(c.name) : k}</span>;
                  })}
                </div>
              </div>
              <span style={{ color: C.gold, fontSize: 13, fontWeight: 800, fontFamily: FONT.sans, whiteSpace: "nowrap", flexShrink: 0 }}>{it.action} →</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── THE CABINET ── */}
      <div style={{ marginTop: 24 }}>
        <div style={{ ...eyebrow(C.dim), marginBottom: 10 }}>The cabinet</div>
        <div
          className={mobile ? "scrl" : undefined}
          style={
            mobile
              ? { display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -16px", padding: "2px 16px 8px", WebkitOverflowScrolling: "touch" }
              : { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }
          }
        >
          {!wall && [0, 1, 2].map((i) => <div key={i} style={{ ...card, height: 118, minWidth: mobile ? "74%" : undefined, scrollSnapAlign: "start", animation: "bwPulse 1.3s ease-in-out infinite" }} />)}
          {wall?.cabinet.map((c) => (
            <CabinetCardView key={c.agentKey} c={c} mobile={mobile} onOpen={() => setOpenAgent(c.agentKey)} />
          ))}
        </div>
      </div>

      {/* ── FOOTER: the day in one line ── */}
      {wall && (
        <button onClick={onGoApprovals} style={{ display: "block", width: "100%", marginTop: 20, padding: "13px 10px", background: "none", border: 0, cursor: "pointer", textAlign: "center", fontFamily: FONT.mono, fontSize: 11.5, color: C.muted, letterSpacing: ".04em" }}>
          {wall.footer.handled} handled by your agents · <span style={{ color: C.goldHi }}>{wall.footer.waiting} waiting on you</span>{wall.footer.waiting > 0 && ` · ≈${wall.footer.etaMinutes} min`}
        </button>
      )}

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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: C.text2, display: "inline-flex" }}><AgentIco agentKey={c.agentKey} /></span>
        <span style={{ fontSize: 13.5, fontWeight: 800, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(c.name)}</span>
        {c.walled && <span style={privatePill}>Private</span>}
        <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[c.statusDot], flexShrink: 0, boxShadow: c.statusDot !== "clear" ? `0 0 0 3px ${URGENCY_C[c.statusDot]}22` : undefined }} />
      </div>
      <div style={{ fontFamily: FONT.serif, fontSize: 13.5, color: C.text2, lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.headline}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: "auto" }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 11, color: c.counts.needsYou ? C.goldHi : C.muted }}>
          {c.counts.newItems} new{c.counts.needsYou > 0 && ` · ${c.counts.needsYou} need you`}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{c.lastRunLabel}</span>
      </div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 22, textAlign: "center", color: C.dim, fontSize: 13.5 }}>{text}</div>;
}

const agentChip: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99,
  fontSize: 10.5, fontWeight: 700, fontFamily: FONT.mono, color: C.text3,
  background: "rgba(var(--ink),.07)", border: `1px solid ${C.line}`, whiteSpace: "nowrap",
};

const privatePill: CSSProperties = {
  padding: "2px 8px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em",
  fontFamily: FONT.mono, textTransform: "uppercase", color: C.purpleText,
  background: "rgba(157,139,255,.14)", border: "1px solid rgba(157,139,255,.3)", flexShrink: 0,
};
