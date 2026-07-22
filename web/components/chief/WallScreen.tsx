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
import NeedsToKnowCard from "./NeedsToKnowCard";
import DashboardHub from "./DashboardHub";
import SendLivePill from "./SendLivePill";
import ComingUp from "./ComingUp";
import { AgentAvatar, AgentChip } from "./AgentBadge";
import { logUsage } from "@/lib/usage";
import { loadSeen, markSeen, isUnseen, type SeenMap } from "@/lib/agent-seen";

interface Props {
  variant: "mobile" | "desktop";
  onOpenEmail?: (mid: string) => void;
  /** Until the Phase 3 Queue lands, "Approve" deep-links to the existing
   *  approvals surface (mobile: Emails · Agent Answered, desktop: Approvals). */
  onGoApprovals: () => void;
  /** The digest sheet's gear → this agent's detail on Staff Agents. */
  onOpenAgent?: (agentKey: string) => void;
  onGoNeedsYou?: () => void;
  /* dashboard navigation (desktop widget grid, RB-UX 2026-07-22) */
  onGoCalendar?: () => void;
  onGoSync?: () => void;
  onGoAgents?: () => void;
  onGoActivity?: () => void;
}

const URGENCY_C: Record<string, string> = { red: C.red, yellow: C.orange, clear: C.green };

const shortName = (name: string) => name.replace(/ Agent$/, "");

export default function WallScreen({ variant, onOpenEmail, onGoApprovals, onOpenAgent, onGoNeedsYou, onGoCalendar, onGoSync, onGoAgents, onGoActivity }: Props) {
  const [wall, setWall] = useState<WallPayload | null>(null);
  const [failed, setFailed] = useState(false);
  // Agents fold away for a clean first screen (RD 2026-07-21): a peek row of
  // avatars until tapped open. The choice sticks per device.
  const [agentsOpen, setAgentsOpen] = useState(false);
  useEffect(() => { try { setAgentsOpen(localStorage.getItem("bw-agents-open") === "1"); } catch { /* default closed */ } }, []);
  const toggleAgents = () => setAgentsOpen((o) => { try { localStorage.setItem("bw-agents-open", o ? "0" : "1"); } catch { /* */ } return !o; });
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [seen, setSeen] = useState<SeenMap>({});
  const mobile = variant === "mobile";
  useEffect(() => { setSeen(loadSeen()); }, []);
  const openDigest = (agentKey: string) => {
    logUsage("digest_open", { agentKey }); // adoption metric #4
    // opening the box clears its notification — the anticipation loop resets
    const card = wall?.cabinet.find((c) => c.agentKey === agentKey);
    if (card) setSeen((s) => markSeen(s, agentKey, card.freshAt));
    setOpenAgent(agentKey);
  };

  const loadWall = async (): Promise<WallPayload> => {
    const persona = getCosPersona();
    const r = await fetch(`/api/wall?hour=${new Date().getHours()}&name=${encodeURIComponent(persona.mayorName)}`);
    if (!r.ok) throw new Error("wall unavailable");
    return (await r.json()) as WallPayload;
  };

  useEffect(() => {
    let live = true;
    loadWall()
      .then((w) => live && setWall(w))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ↻ on the digest sheet: email seats fire the same manual sync as the
  // Sources button first (one ingest code path), then the whole wall payload
  // reloads — the open sheet re-renders from it in place.
  const refreshAgent = async (agentKey: string) => {
    if (agentKey === "email-gmail" || agentKey === "email-outlook") {
      await fetch("/api/sync", { method: "POST" }).catch(() => {});
    }
    try {
      const w = await loadWall();
      setWall(w);
      setFailed(false);
    } catch { /* a failed refresh keeps the wall it already has */ }
  };

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
      {mobile && (
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, marginTop: mobile ? 8 : 0, padding: mobile ? "12px 15px 11px" : "30px 28px 26px", background: "#FFFFFF", border: "1.5px solid rgba(20,51,92,.30)", boxShadow: "0 14px 36px rgba(20,40,80,.16)" }}>
        {(() => {
          const h = mobile ? 130 : 285; // logo is 400×170; bell ≈ left 37.5%
          const w = h * (400 / 170);
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/bellwood.webp" alt="" aria-hidden style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: -(w * 0.605), height: h, opacity: 1, pointerEvents: "none", userSelect: "none" }} />
          );
        })()}
        <div style={{ position: "relative", maxWidth: mobile ? "78%" : "72%" }}>
          <div style={{ ...eyebrow("#8a6a1f"), fontWeight: 700 }}>{wall?.dateLabel ?? "—"}</div>
          <div style={{ fontFamily: FONT.serif, fontSize: mobile ? "clamp(16px, 4.4vw, 21px)" : "clamp(21px, 5vw, 30px)", fontWeight: 600, color: "#14335c", lineHeight: 1.12, marginTop: 9, letterSpacing: "-.01em" }}>
            {wall?.greeting ?? (failed ? "The Hub is unavailable." : "Reading your agents…")}
          </div>
          {wall?.sendLive && <div style={{ marginTop: 10 }}><SendLivePill /></div>}
        </div>
      </div>
      )}

      {/* ── MOBILE: the Brief (swipe-first). DESKTOP: the actionable widget
             dashboard (RB-UX 2026-07-22) — same data, executive-density. ── */}
      {mobile ? (
        <NeedsToKnowCard mobile={mobile} onOpenEmail={onOpenEmail} onGoNeedsYou={onGoNeedsYou} onGoApprovals={onGoApprovals}
          onOpenAgent={(k) => { if (wall?.runs[k]) openDigest(k); else onOpenAgent?.(k); }} />
      ) : (
        <DashboardHub wall={wall} onOpenEmail={onOpenEmail} onGoApprovals={onGoApprovals} onGoNeedsYou={onGoNeedsYou}
          onGoCalendar={onGoCalendar} onGoSync={onGoSync} onGoAgents={onGoAgents} onGoActivity={onGoActivity}
          onOpenAgent={(k) => { if (wall?.runs[k]) openDigest(k); else onOpenAgent?.(k); }} />
      )}

      {/* ── THE CABINET — folded to a peek for a clean first screen; tap to
             open the grid. The schedule strip and stale warning stay visible
             even folded (trust signals never hide). MOBILE ONLY — the desktop
             dashboard carries the Active Agents widget instead. ── */}
      {mobile && (
      <div style={{ marginTop: mobile ? 13 : 26 }}>
        <button onClick={toggleAgents} aria-expanded={agentsOpen}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, padding: "2px 0", cursor: "pointer", textAlign: "left", flexWrap: "wrap" }}>
          <span style={{ ...sectionHead, marginBottom: 0 }}>Agents</span>
          <span style={{ fontSize: 11, color: C.dim, transform: agentsOpen ? "rotate(90deg)" : undefined, display: "inline-block", transition: "transform .12s ease" }}>▶</span>
          {/* the peek: attention-ordered avatars with status dots + new count */}
          {wall && !agentsOpen && (
            <span style={{ display: "flex", alignItems: "center" }}>
              {attentionOrder(wall.cabinet).slice(0, 8).map((c, i) => (
                <span key={c.agentKey} style={{ position: "relative", marginLeft: i ? -7 : 0, display: "inline-flex", borderRadius: 99, border: "2px solid var(--c-appbg)" }}>
                  <AgentAvatar agentKey={c.agentKey} size={mobile ? 22 : 24} />
                  {(c.statusDot === "red" || isUnseen(seen, c.agentKey, c.freshAt)) && (
                    <span style={{ position: "absolute", top: -1, right: -1, width: 8, height: 8, borderRadius: 99, border: "1.5px solid var(--c-appbg)", background: c.statusDot === "red" ? C.red : C.gold }} />
                  )}
                </span>
              ))}
              {wall.cabinet.length > 8 && <span style={{ marginLeft: 5, fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>+{wall.cabinet.length - 8}</span>}
            </span>
          )}
          {wall && !agentsOpen && (() => {
            const fresh = wall.cabinet.filter((c) => isUnseen(seen, c.agentKey, c.freshAt)).length;
            return fresh > 0
              ? <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 800, color: C.goldHi, background: "rgba(231,181,60,.14)", border: "1px solid rgba(231,181,60,.35)", padding: "2px 8px", borderRadius: 99 }}>{fresh} new</span>
              : null;
          })()}
          {/* WHEN THEY RUN, always visible. Without it a quiet desk and a
              stopped scheduler look identical, and an operator who suspects the
              second goes back to reading their own inbox — correctly, because
              nothing here told them otherwise. */}
          {wall?.agentSchedule && <ScheduleStrip s={wall.agentSchedule} />}
        </button>
        {/* Mobile is a two-column GRID — the whole cabinet visible in one
            vertical scroll (horizontal decks fight the thumb; RD 2026-07-02).
            The Schedule card spans full width for its calendar face. */}
        {agentsOpen && (
        <div
          style={
            mobile
              ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start", marginTop: 10 }
              : { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12, alignItems: "start", marginTop: 12 }
          }
        >
          {!wall && [0, 1, 2, 3].map((i) => <div key={i} style={{ ...card, height: mobile ? 104 : 118, minWidth: 0, animation: "bwPulse 1.3s ease-in-out infinite" }} />)}
          {wall && attentionOrder(wall.cabinet).map((c) =>
            c.agentKey === "schedule" ? (
              <ScheduleCardView key={c.agentKey} c={c} schedule={wall.schedule} mobile={mobile} unseen={isUnseen(seen, c.agentKey, c.freshAt)} onOpen={() => openDigest(c.agentKey)} />
            ) : (
              <CabinetCardView key={c.agentKey} c={c} mobile={mobile} unseen={isUnseen(seen, c.agentKey, c.freshAt)} onOpen={() => openDigest(c.agentKey)} />
            ),
          )}
          {wall && <AddAgentCard mobile={mobile} onOpen={() => setAddOpen(true)} />}
        </div>
        )}
      </div>

      )}

      {/* ── FOOTER: the day in one line ── */}
      {wall && (
        <button onClick={onGoApprovals} style={{ display: "block", width: "100%", marginTop: 20, padding: "13px 10px", background: "none", border: 0, cursor: "pointer", textAlign: "center", fontFamily: FONT.mono, fontSize: 11.5, color: C.muted, letterSpacing: ".04em" }}>
          {wall.footer.handled} handled by your agents · <span style={{ color: C.goldHi }}>{wall.footer.waiting} waiting on you</span>{wall.footer.waiting > 0 && ` · ≈${wall.footer.etaMinutes} min`}
        </button>
      )}

      {addOpen && (
        <AddAgentSheet
          variant={variant}
          onClose={() => setAddOpen(false)}
          /* Creating an agent changes the Hub — refetch so the new desk appears
             immediately instead of on the next natural load. */
          onCreated={() => { setAddOpen(false); loadWall().then(setWall).catch(() => {}); }}
        />
      )}

      {openAgent && wall && wall.runs[openAgent] && (
        <AgentDigestSheet
          run={wall.runs[openAgent]}
          card={wall.cabinet.find((c) => c.agentKey === openAgent)!}
          schedule={openAgent === "schedule" ? wall.schedule : undefined}
          variant={variant}
          onClose={() => setOpenAgent(null)}
          onOpenMessage={(mid) => onOpenEmail?.(mid)}
          onGoApprovals={() => { setOpenAgent(null); onGoApprovals(); }}
          onRefresh={() => refreshAgent(openAgent)}
          onOpenAgentDetail={onOpenAgent ? () => { setOpenAgent(null); onOpenAgent(openAgent); } : undefined}
        />
      )}
    </div>
  );
}

/** One grid cell: minWidth 0 so content can never size the card (a long
 *  headline once blew a card open on a phone), natural height, and a clamped
 *  headline instead of a hard ellipsis. Mobile cells are half-width → tighter. */
const cardShell = (mobile: boolean): CSSProperties => ({
  ...card,
  textAlign: "left",
  cursor: "pointer",
  padding: mobile ? "9px 11px" : "14px 15px",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  color: C.text,
  fontFamily: FONT.sans,
});

const headlineClamp = (mobile: boolean): CSSProperties => ({
  fontFamily: FONT.serif,
  fontSize: mobile ? 12 : 14.5,
  color: C.text2,
  lineHeight: 1.35,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  overflowWrap: "anywhere",
});


/** The scheduler, in one line. Reads as a heartbeat when healthy and as a
 *  warning when it isn't — never as silence, which is the state that costs
 *  trust. */
function ScheduleStrip({ s }: { s: NonNullable<WallPayload["agentSchedule"]> }) {
  const next = new Date(s.nextRunAt);
  const mins = Math.max(0, Math.round((next.getTime() - Date.now()) / 60000));
  const untilText = mins <= 0 ? "any moment" : mins < 60 ? `in ${mins} min` : `in about ${Math.round(mins / 60)}h`;
  const at = next.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  if (s.stale) {
    return (
      <span
        title={s.staleReason ?? undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT.mono, fontSize: 10.5, color: C.orange, background: "rgba(240,163,60,.12)", border: "1px solid rgba(240,163,60,.3)", borderRadius: 99, padding: "3px 9px" }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: C.orange, flexShrink: 0 }} />
        agents may be stopped — {s.staleReason}
      </span>
    );
  }
  return (
    <span
      title={`${s.cadence}. Next run ${at}.`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT.mono, fontSize: 10.5, color: C.text3 }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: C.greenText, flexShrink: 0 }} />
      running hourly · next {untilText} ({at})
    </span>
  );
}

/** Attention order. The goal is to look once and see what needs you (RD
 *  2026-07-18), and registry order can't do that — a red desk sits wherever the
 *  cabinet happens to list it, below three quiet ones.
 *
 *  Tiers, not a full sort: red → needs-you → new items → quiet. WITHIN a tier
 *  the original registry order is preserved, so cards keep stable relative
 *  positions and only move when their state actually changes. A card that
 *  jumped around on every render would cost more recognition than the ordering
 *  buys. */
function attentionOrder(cards: CabinetCard[]): CabinetCard[] {
  const tier = (c: CabinetCard): number => {
    if (c.statusDot === "red") return 0;
    if (c.counts.needsYou > 0) return 1;
    if (c.statusDot === "yellow") return 2;
    if (c.counts.newItems > 0) return 3;
    return 4;
  };
  return cards
    .map((c, i) => ({ c, i, t: tier(c) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.c);
}

function CabinetCardView({ c, mobile, unseen, onOpen }: { c: CabinetCard; mobile: boolean; unseen: boolean; onOpen: () => void }) {
  // A desk with nothing to report RECEDES rather than the busy ones lighting up.
  // Card colour is already the identity channel (deliberately kept away from the
  // urgency reds/ambers), so a highlight tint would collide with it. Dimming the
  // quiet desks makes the one that matters pop without inventing a new colour —
  // and "quiet" reads as quiet, not as a problem. Still fully legible and
  // clickable: this is de-emphasis, not disablement.
  const quiet = c.counts.newItems === 0 && c.counts.needsYou === 0 && c.statusDot === "clear";
  return (
    <button
      onClick={onOpen}
      style={{
        ...cardShell(mobile),
        ...(unseen ? unseenRing : {}),
        ...(quiet ? { opacity: 0.62, filter: "saturate(.55)" } : {}),
        transition: "opacity .25s ease, filter .25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: mobile ? 7 : 9, minWidth: 0 }}>
        <AgentAvatar agentKey={c.agentKey} size={mobile ? 22 : 26} />
        {/* Name over the source it manages. "Gmail Email Agent" alone doesn't say
            WHICH mailbox, and with a public-record lane and a walled private one
            that is the first thing you need to know. */}
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: mobile ? 13 : 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(c.name)}</span>
          {c.subtitle && (
            <span style={{ fontFamily: FONT.mono, fontSize: mobile ? 9.5 : 10.5, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.subtitle}</span>
          )}
        </span>
        {unseen && <span style={newPill}>new</span>}
        {c.origin === "custom" ? <span style={originPill}>Custom</span> : c.origin === "default" && !mobile ? <span style={originPill}>Default</span> : null}
        {c.walled && <span style={privatePill}>Private</span>}
        <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[c.statusDot], flexShrink: 0, boxShadow: c.statusDot !== "clear" ? `0 0 0 3px ${URGENCY_C[c.statusDot]}22` : undefined }} />
      </div>
      <div style={headlineClamp(mobile)}>{c.headline}</div>
      {/* Where this desk's information comes from. Obvious to us that every agent
          reads the connected mailbox; not obvious to a mayor looking at a card
          that says "Council & Records". */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 7, minWidth: 0 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: mobile ? 9 : 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: C.dim, flexShrink: 0 }}>Reads</span>
        <span style={{ fontFamily: FONT.mono, fontSize: mobile ? 9.5 : 10.5, color: C.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.sources && c.sources.length ? c.sources.join(" · ") : "no source connected yet"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT.mono, fontSize: mobile ? 10.5 : 11.5, color: c.counts.needsYou ? C.goldHi : C.muted }}>
          {c.counts.newItems} new{c.counts.needsYou > 0 && ` · ${c.counts.needsYou} need you`}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{c.lastRunLabel}</span>
      </div>
    </button>
  );
}

/** The Schedule seat wears a calendar face (the shared ComingUp component —
 *  a visual cue, not a calendar replacement; links go OUT to the real ones). */
function ScheduleCardView({ c, schedule, mobile, unseen, onOpen }: { c: CabinetCard; schedule: WallSchedule; mobile: boolean; unseen: boolean; onOpen: () => void }) {
  // Same rule as CabinetCardView — but a schedule card with upcoming events is
  // never "quiet", even with no digest points: the calendar IS its content.
  const quiet =
    c.counts.newItems === 0 && c.counts.needsYou === 0 && c.statusDot === "clear" &&
    schedule.days.every((d) => d.events.length === 0);
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} style={{ ...cardShell(mobile), gap: 10, gridColumn: mobile ? "1 / -1" : undefined, padding: "14px 15px", ...(unseen ? unseenRing : {}), ...(quiet ? { opacity: 0.62, filter: "saturate(.55)" } : {}), transition: "opacity .25s ease, filter .25s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <AgentAvatar agentKey={c.agentKey} size={26} />
        <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0 }}>{shortName(c.name)}</span>
        {unseen && <span style={newPill}>new</span>}
        <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[c.statusDot], flexShrink: 0, boxShadow: c.statusDot !== "clear" ? `0 0 0 3px ${URGENCY_C[c.statusDot]}22` : undefined }} />
      </div>
      <ComingUp schedule={mobile ? { ...schedule, days: schedule.days.slice(0, 2) } : schedule} />
      <div style={{ textAlign: "right", marginTop: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{c.lastRunLabel}</div>
    </div>
  );
}

/** The growth story, visible: a new cabinet seat is one interview away. */
function AddAgentCard({ mobile, onOpen }: { mobile: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{ minWidth: 0, minHeight: mobile ? 80 : 118, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, padding: "16px 12px", borderRadius: 16, border: "1.5px dashed rgba(var(--ink),.28)", background: "transparent", cursor: "pointer", color: C.muted, fontFamily: FONT.sans }}>
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
  fontFamily: FONT.serif, fontSize: 17, fontWeight: 600, color: C.text,
  letterSpacing: "-.01em", marginBottom: 8,
};

/** The notification cue: a desk reported in since you last opened its box. */
const newPill: CSSProperties = {
  padding: "2px 9px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em",
  fontFamily: FONT.mono, textTransform: "uppercase", color: "#0a1322",
  background: "linear-gradient(135deg,#F4CB63,#D7991C)", flexShrink: 0,
  animation: "bwPulse 1.6s ease-in-out infinite",
};
const unseenRing: CSSProperties = {
  boxShadow: "0 0 0 2px rgba(231,181,60,.55), 0 6px 18px rgba(231,181,60,.18)",
};

/** Default = code-defined roster agent; Custom = created via the Agent
 *  Factory interview (RD's vocabulary, 2026-07-03). Muted — identity, not alarm. */
const originPill: CSSProperties = {
  padding: "2px 7px", borderRadius: 99, fontSize: 9, fontWeight: 700, letterSpacing: ".06em",
  fontFamily: FONT.mono, textTransform: "uppercase", color: "var(--c-dim)",
  background: "rgba(var(--ink),.06)", border: "1px solid rgba(var(--ink),.1)", flexShrink: 0,
};

const privatePill: CSSProperties = {
  padding: "2px 8px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em",
  fontFamily: FONT.mono, textTransform: "uppercase", color: C.purpleText,
  background: "rgba(157,139,255,.14)", border: "1px solid rgba(157,139,255,.3)", flexShrink: 0,
};
