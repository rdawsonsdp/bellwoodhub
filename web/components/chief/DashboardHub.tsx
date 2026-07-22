"use client";
/*
 * DashboardHub — the desktop Hub as a high-density executive dashboard
 * (RD UX rebuild, 2026-07-22; Gemini reference). Replaces the editorial
 * newspaper layout on DESKTOP with actionable widget cards; mobile keeps the
 * swipe-first Brief (a grid is a desktop paradigm).
 *
 * Modular by construction — each widget is its own component
 * (<SecurityAlertsCard/>, <MetricCard/>, <EventsWidget/>, <SyncChartWidget/>,
 * <MatrixWidget/>, <ActiveAgentsCard/>) so the grid can be rearranged.
 *
 * HONESTY RULE (house non-negotiable): every number on this screen is real —
 * alerts are live red-urgency desk stories, counts come from the wall payload
 * and triage, the chart series is the actual ingest ledger. Empty states say
 * so; nothing is decorative fiction. Fixed executive-cream palette like the
 * letterhead (reads identically across the four themes).
 */
import { useEffect, useState } from "react";
import { FONT } from "@/lib/cos-design";
import { getCosPersona, type MorningSummary, type PressingItem } from "@/lib/morning";
import type { WallPayload } from "@/lib/wall";
import { AgentAvatar } from "./AgentBadge";

/* ── palette (spec) — THE app design system (RD 2026-07-22): every screen
      adopts these tokens + primitives, not just the dashboard ────────────── */
export const P = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  cardAlt: "#FFFFFF",
  border: "rgba(20,51,92,.20)", // Bellwood navy
  text: "#1E1E1E",
  text2: "#4A463E",
  text3: "#8A8578",
  rust: "#8B2500",
  red: "#B91C1C",
  amber: "#D97706",
  amberDeep: "#B45309",
  green: "#1E7B45",
  greenBg: "#DCEFE2",
};

export const SANS = "'Public Sans','Inter',system-ui,sans-serif";

/* ── shared card chrome ─────────────────────────────────────────────────── */
export function WCard({ children, span, alt }: { children: React.ReactNode; span?: number; alt?: boolean }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, background: alt ? P.cardAlt : P.card, border: `1px solid ${P.border}`, borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 3px rgba(30,30,30,.05)", display: "flex", flexDirection: "column", minWidth: 0 }}>
      {children}
    </div>
  );
}
export function WHead({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>{title}</span>
      {onMore && (
        <button onClick={onMore} aria-label={`Open ${title}`} style={{ cursor: "pointer", background: "none", border: 0, color: P.text3, fontSize: 15, fontWeight: 700, padding: 2 }}>›</button>
      )}
    </div>
  );
}
export const btnSolid: React.CSSProperties = { cursor: "pointer", border: 0, borderRadius: 9, padding: "9px 15px", fontFamily: SANS, fontWeight: 800, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", background: `linear-gradient(135deg, ${P.amber}, ${P.amberDeep})`, color: "#fff" };
export const btnOutline: React.CSSProperties = { cursor: "pointer", borderRadius: 9, padding: "8px 14px", fontFamily: SANS, fontWeight: 800, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", background: "#fff", border: `1.5px solid ${P.border}`, color: P.text2 };

/* ── the working theater: data collection + agents at work (RD 2026-07-22).
      Pipeline: the record → the desks → the brief; dots stream, working desks
      pulse. The caption and per-desk states are always REAL. ─────────────── */
export function WorkingTheater({ agentKeys, caption }: { agentKeys: string[]; caption: string }) {
  const dots = (delayBase: number) => (
    <span style={{ position: "relative", width: 64, height: 8, flexShrink: 0, display: "inline-block" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ position: "absolute", left: 0, top: 1, width: 6, height: 6, borderRadius: 99, background: P.amber, animation: `dashFlowDot 1.6s linear ${delayBase + i * 0.5}s infinite` }} />
      ))}
    </span>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", flexWrap: "wrap" }}>
      {/* the record */}
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={P.text2} strokeWidth={1.8} strokeLinecap="round"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
      {dots(0)}
      {/* the desks, pulsing */}
      <span style={{ display: "inline-flex" }}>
        {agentKeys.slice(0, 6).map((k, i) => (
          <span key={k} style={{ marginLeft: i ? -6 : 0, borderRadius: 99, animation: `dashPulseRing 1.4s ease-out ${i * 0.25}s infinite` }}>
            <AgentAvatar agentKey={k} size={26} />
          </span>
        ))}
      </span>
      {dots(0.8)}
      {/* the brief */}
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={P.text2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>
      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: P.text2, flexBasis: "100%" }}>{caption}</span>
    </div>
  );
}

/* ── 1. Critical Security Alerts (priority card, 2 columns) ─────────────── */
export function SecurityAlertsCard({ alerts, onOpenEmail, onOpenAgent, composing, theaterKeys = [] }: {
  alerts: PressingItem[];
  onOpenEmail?: (mid: string) => void;
  onOpenAgent?: (agentKey: string) => void;
  /** true while the briefing is still being composed (animation shows) */
  composing?: boolean;
  theaterKeys?: string[];
}) {
  // TOP ISSUES from ALL desks (RD 2026-07-22) — ranked by the Brief agent on
  // urgency · relevance · risk (rationale shown per item, decision tracked in
  // the audit ledger). Scrollable when the list runs long.
  const critical = alerts.filter((a) => a.tag === "update").length;
  const pill = (a: PressingItem) =>
    a.tag === "update" ? { t: "UNRESOLVED", bg: P.red }
    : a.tag === "new" ? { t: "NEW", bg: P.green }
    : a.tag === "draft ready" ? { t: "DRAFT READY", bg: P.amberDeep }
    : { t: "NEEDS REPLY", bg: P.amber };
  return (
    <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(30,30,30,.06)", minWidth: 0, display: "flex", flexDirection: "column" }}>
      {/* high-contrast banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: `linear-gradient(120deg, ${P.rust}, #A93F10)`, color: "#fff", flexWrap: "wrap" }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#F6C563" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
        </svg>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", opacity: 0.85, whiteSpace: "nowrap" }}>Top issues · all desks</div>
          <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 800, lineHeight: 1.25 }}>{composing ? "Composing the brief…" : alerts.length ? `${alerts.length} ranked by your Chief of Staff${critical ? ` · ${critical} critical` : ""}` : "All clear"}</div>
        </div>
        <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.75, textAlign: "right", flexShrink: 0 }}>urgency · relevance · risk<br />ranking tracked</span>
      </div>
      {composing ? (
        <WorkingTheater agentKeys={theaterKeys} caption="Collecting the record — your desks are filing and the Chief of Staff is ranking…" />
      ) : alerts.length === 0 ? (
        <div style={{ padding: "18px", fontFamily: SANS, fontSize: 13.5, color: P.text2 }}>Nothing ranked as a top issue right now.</div>
      ) : null}
      {/* THE INDEX (RD 2026-07-22): every identified issue in one glance —
          built for many; each row jumps to its item below. */}
      {alerts.length > 1 && (
        <div style={{ padding: "10px 18px 11px", borderTop: `1px solid ${P.border}`, background: "#FAFBFC" }}>
          <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: P.text3, marginBottom: 7 }}>Index · {alerts.length} issues</div>
          <div style={{ display: "grid", gap: 3 }}>
            {alerts.map((a, i) => {
              const pl = pill(a);
              return (
                <button key={i}
                  onClick={() => document.getElementById(`dash-issue-${i}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, padding: "2px 0", cursor: "pointer", textAlign: "left", minWidth: 0 }}>
                  <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, color: P.text3, width: 16, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: pl.bg, flexShrink: 0 }} />
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: P.text2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                  <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: P.text3, flexShrink: 0 }}>{a.agentName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* scrollable body */}
      <div className="scrl" style={{ overflowY: "auto", maxHeight: 560 }}>
      {alerts.map((a, i) => {
        const pl = pill(a);
        return (
        <div key={i} id={`dash-issue-${i}`} style={{ padding: "14px 18px", borderTop: `1px solid ${P.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ width: 21, height: 21, borderRadius: 7, background: i === 0 ? P.red : i < 3 ? P.amber : "#A8A29A", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 11.5, fontWeight: 800 }}>{i + 1}</span>
            {a.agentKey && <AgentAvatar agentKey={a.agentKey} size={17} />}
            <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>{a.agentName}</span>
            <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: ".08em", padding: "3px 10px", borderRadius: 99, background: pl.bg, color: "#fff" }}>{pl.t}</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 800, color: P.text, lineHeight: 1.25, marginTop: 6, overflowWrap: "anywhere" }}>{a.title}</div>
          {a.why && <div style={{ fontFamily: SANS, fontSize: 13, color: P.text2, lineHeight: 1.55, marginTop: 5, overflowWrap: "anywhere" }}>{a.why}</div>}
          {a.rankWhy && (
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: P.text3, marginTop: 5, fontStyle: "italic" }}>ranked here — {a.rankWhy}</div>
          )}
          <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap" }}>
            {a.messageId && onOpenEmail && (
              <button onClick={() => onOpenEmail(a.messageId!)} style={btnSolid}>Open email ↗</button>
            )}
            {a.agentKey && onOpenAgent && a.tag !== "needs reply" && (
              <button onClick={() => onOpenAgent(a.agentKey!)} style={btnOutline}>View agent</button>
            )}
          </div>
        </div>
      );})}
      </div>
    </div>
  );
}

/* ── 2. Metric card (pending approvals etc.) ────────────────────────────── */
export function MetricCard({ title, n, sub, cta, onGo }: { title: string; n: string; sub: string; cta: string; onGo?: () => void }) {
  return (
    <WCard>
      <WHead title={title} onMore={onGo} />
      <div style={{ fontFamily: SANS, fontSize: 42, fontWeight: 800, color: P.text, lineHeight: 1 }}>{n}</div>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.text2, lineHeight: 1.5, marginTop: 8, flex: 1 }}>{sub}</div>
      {onGo && (
        <button onClick={onGo} style={{ ...btnOutline, alignSelf: "flex-start", marginTop: 12 }}>{cta} ›</button>
      )}
    </WCard>
  );
}

/* ── 3. Upcoming events (timeline) ──────────────────────────────────────── */
export function EventsWidget({ events, onGo }: { events: { id: string; title: string; when: string }[]; onGo?: () => void }) {
  return (
    <WCard>
      <WHead title="Upcoming events" onMore={onGo} />
      {events.length === 0 && (
        <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.text3, lineHeight: 1.55, flex: 1 }}>
          Nothing on the mirrored calendar. (Calendar connection pending — events appear here the moment it syncs.)
        </div>
      )}
      <div style={{ display: "grid", gap: 10, flex: 1 }}>
        {events.slice(0, 4).map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10 }}>
            <span style={{ width: 3, borderRadius: 3, background: P.amber, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 800, color: P.text }}>{e.when}</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.text2, overflowWrap: "anywhere" }}>{e.title}</div>
            </div>
          </div>
        ))}
      </div>
      {onGo && <button onClick={onGo} style={{ ...btnOutline, alignSelf: "flex-start", marginTop: 12 }}>See more events</button>}
    </WCard>
  );
}

/* ── 4. Sync progress bar chart ─────────────────────────────────────────── */
export function SyncChartWidget({ onGo }: { onGo?: () => void }) {
  const [mode, setMode] = useState<"days" | "hours">("days");
  const [series, setSeries] = useState<{ label: string; n: number }[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/sync/series?mode=${mode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { series?: { label: string; n: number }[] }) => live && setSeries(d.series ?? []))
      .catch(() => live && setSeries([]));
    return () => { live = false; };
  }, [mode]);
  const max = Math.max(1, ...(series ?? []).map((s) => s.n));
  return (
    <WCard>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>Sync progress</span>
        {/* the toggle: 7 days ↔ 12 hours — both real ledger counts */}
        <button onClick={() => setMode((m) => (m === "days" ? "hours" : "days"))} aria-label="Toggle range"
          style={{ cursor: "pointer", border: 0, borderRadius: 99, width: 40, height: 21, padding: 2, background: mode === "days" ? P.green : P.amber, display: "inline-flex", alignItems: "center" }}>
          <span style={{ width: 17, height: 17, borderRadius: 99, background: "#fff", transform: mode === "days" ? "translateX(0)" : "translateX(19px)", transition: "transform .15s" }} />
        </button>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: P.text3, marginBottom: 8 }}>{mode === "days" ? "rows landed · last 7 days" : "rows landed · last 12 hours"}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 86, flex: 1 }}>
        {series === null && <span style={{ fontFamily: SANS, fontSize: 12, color: P.text3 }}>…</span>}
        {series !== null && series.length === 0 && <span style={{ fontFamily: SANS, fontSize: 12, color: P.text3 }}>No sync activity in this window.</span>}
        {(series ?? []).map((s, i) => (
          <button key={i} onClick={onGo} title={`${s.n.toLocaleString()} rows — open Sync`}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, minWidth: 0, background: "none", border: 0, padding: 0, cursor: onGo ? "pointer" : "default" }}>
            <div style={{ width: "100%", maxWidth: 26, height: Math.max(3, Math.round((s.n / max) * 70)), borderRadius: 5, background: `linear-gradient(180deg, ${P.amber}, ${P.amberDeep})` }} />
            <span style={{ fontFamily: SANS, fontSize: 9, color: P.text3, whiteSpace: "nowrap" }}>{s.label}</span>
          </button>
        ))}
      </div>
      {onGo && <button onClick={onGo} style={{ ...btnOutline, alignSelf: "flex-start", marginTop: 10 }}>Sync detail ›</button>}
    </WCard>
  );
}

/* ── 5. Priority matrix (urgency × importance, from live triage) ────────── */
export function MatrixWidget({ counts, onGo, onGoApprovals }: {
  counts: { needsReply: number; waiting: number; awaiting: number; fyi: number };
  onGo?: () => void;
  onGoApprovals?: () => void;
}) {
  const total = Math.max(1, counts.needsReply + counts.waiting + counts.awaiting + counts.fyi);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  // every quadrant drills to its list (RD 2026-07-22)
  const cell = (bg: string, label: string, n: number, go?: () => void): React.ReactNode => (
    <button onClick={go} disabled={!go} title={go ? `Open ${label}` : undefined}
      style={{ background: bg, border: 0, borderRadius: 10, padding: "10px 8px", textAlign: "center", cursor: go ? "pointer" : "default" }}>
      <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 800, color: "#fff" }}>{pct(n)}</div>
      <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.9)" }}>{label}</div>
    </button>
  );
  return (
    <WCard>
      <WHead title="Priority matrix" onMore={onGo} />
      <div style={{ display: "grid", gridTemplateColumns: "14px 1fr 1fr", gap: 6, alignItems: "stretch", flex: 1 }}>
        <div style={{ fontFamily: SANS, fontSize: 9.5, color: P.text3, writingMode: "vertical-rl", transform: "rotate(180deg)", textAlign: "center" }}>urgency →</div>
        {cell(P.red, "needs reply", counts.needsReply, onGo)}
        {cell(P.amber, "drafts waiting", counts.waiting, onGoApprovals)}
        <span />
        {cell("#5B8C5A", "awaiting others", counts.awaiting, onGo)}
        {cell("#A8A29A", "FYI", counts.fyi, onGo)}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: P.text3, textAlign: "center", marginTop: 5 }}>share of classified mail · live triage</div>
    </WCard>
  );
}

/* ── 6a. List metrics ───────────────────────────────────────────────────── */
export function ListMetricsCard({ rows, title, onGo }: { title: string; rows: { label: string; n: number; onGo?: () => void; expand?: React.ReactNode }[]; onGo?: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <WCard>
      <WHead title={title} onMore={onGo} />
      <div style={{ display: "grid", gap: 9, flex: 1 }}>
        {rows.map((r) => (
          <div key={r.label}>
            <button
              onClick={r.expand ? () => setOpen((o) => (o === r.label ? null : r.label)) : r.onGo}
              disabled={!r.onGo && !r.expand}
              style={{ display: "flex", alignItems: "baseline", gap: 10, width: "100%", background: "none", border: 0, padding: 0, cursor: r.onGo || r.expand ? "pointer" : "default", textAlign: "left" }}>
              <span style={{ fontFamily: SANS, fontSize: 13, color: P.text2, flex: 1 }}>{r.label}</span>
              <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 800, color: P.text }}>{r.n.toLocaleString()}</span>
              {(r.onGo || r.expand) && <span style={{ fontFamily: SANS, fontSize: 12, color: P.text3, transform: r.expand && open === r.label ? "rotate(90deg)" : undefined, display: "inline-block" }}>›</span>}
            </button>
            {r.expand && open === r.label && <div style={{ marginTop: 7 }}>{r.expand}</div>}
          </div>
        ))}
      </div>
    </WCard>
  );
}

/* ── 6b. Active agents status ───────────────────────────────────────────── */
export function ActiveAgentsCard({ wall, onOpenAgent, onGo }: { wall: WallPayload | null; onOpenAgent?: (k: string) => void; onGo?: () => void }) {
  const cards = wall?.cabinet ?? [];
  const shown = cards.slice(0, 5);
  return (
    <WCard>
      <WHead title="Active agents" onMore={onGo} />
      <div style={{ display: "grid", gap: 8, flex: 1 }}>
        {shown.map((c) => (
          <button key={c.agentKey} onClick={onOpenAgent ? () => onOpenAgent(c.agentKey) : undefined}
            style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: 0, padding: 0, cursor: onOpenAgent ? "pointer" : "default", textAlign: "left" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: c.statusDot === "red" ? P.red : c.statusDot === "yellow" ? P.amber : "#2FA463", flexShrink: 0 }} />
            <AgentAvatar agentKey={c.agentKey} size={18} />
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: P.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name.replace(/ Agent$/, "")}</span>
          </button>
        ))}
        {cards.length > 5 && <span style={{ fontFamily: SANS, fontSize: 11.5, color: P.text3 }}>+{cards.length - 5} more</span>}
      </div>
    </WCard>
  );
}

/* ── the grid ───────────────────────────────────────────────────────────── */
export default function DashboardHub({ wall, onOpenEmail, onOpenAgent, onGoApprovals, onGoNeedsYou, onGoCalendar, onGoSync, onGoAgents, onGoActivity }: {
  wall: WallPayload | null;
  onOpenEmail?: (mid: string) => void;
  onOpenAgent?: (agentKey: string) => void;
  onGoApprovals: () => void;
  onGoNeedsYou?: () => void;
  onGoCalendar?: () => void;
  onGoSync?: () => void;
  onGoAgents?: () => void;
  onGoActivity?: () => void;
}) {
  const [sum, setSum] = useState<MorningSummary | null>(null);
  const [triage, setTriage] = useState<{ needsReply: number; awaiting: number; fyi: number }>({ needsReply: 0, awaiting: 0, fyi: 0 });
  const [notes, setNotes] = useState<{ id: string; title: string; stale: boolean }[]>([]);

  useEffect(() => {
    let live = true;
    fetch("/api/morning-summary", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona: getCosPersona(), hour: new Date().getHours() }),
    }).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: MorningSummary) => live && setSum(d)).catch(() => {});
    fetch("/api/triage").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { needsReply?: unknown[]; awaitingOthers?: unknown[]; fyi?: unknown[] }) =>
        live && setTriage({ needsReply: d.needsReply?.length ?? 0, awaiting: d.awaitingOthers?.length ?? 0, fyi: d.fyi?.length ?? 0 }))
      .catch(() => {});
    fetch("/api/cos-notes").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { notes?: { id: string; title: string; stale: boolean }[] }) => live && setNotes(d.notes ?? [])).catch(() => {});
    return () => { live = false; };
  }, []);

  const pressing = sum?.pressing ?? [];
  // the Top Issues panel carries the WHOLE ranked page — every desk's stories
  // plus mail signals, in the Brief agent's tracked order (RD 2026-07-22)
  const alerts = pressing;
  const waiting = wall?.footer.waiting ?? 0;
  const handled = wall?.footer.handled ?? 0;

  return (
    <div style={{ background: P.bg, borderRadius: 20, padding: 16, marginTop: 18 }}>
      {/* the CoS briefing line — a bordered card at the top (RD 2026-07-22),
          same chrome as the widgets; full text, never clipped mid-sentence */}
      {sum?.narrative && (
        <div style={{ position: "sticky", top: 6, zIndex: 40, background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, boxShadow: "0 6px 18px rgba(30,30,30,.10)", padding: "13px 16px", marginBottom: 14, display: "flex", gap: 11, alignItems: "flex-start" }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={P.amber} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: P.text3, marginBottom: 3 }}>Chief of Staff</div>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: P.text2, lineHeight: 1.6, overflowWrap: "anywhere" }}>{sum.narrative}</div>
          </div>
        </div>
      )}
      {/* three columns (RD 2026-07-22): STATUS rail on the left (beside the
          menu), the ACTION center (alerts + approvals), the CALENDAR rail on
          the right — where the FEAT-37 calendar view grows when it connects. */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ width: 258, flexShrink: 0, display: "grid", gap: 14 }}>
          <SyncChartWidget onGo={onGoSync} />
          <MatrixWidget counts={{ needsReply: triage.needsReply, waiting, awaiting: triage.awaiting, fyi: triage.fyi }} onGo={onGoNeedsYou} onGoApprovals={onGoApprovals} />
          <ListMetricsCard title="Recent email actions" onGo={onGoNeedsYou}
            rows={[
              { label: "Need your reply", n: triage.needsReply, onGo: onGoNeedsYou },
              { label: "Handled by agents", n: handled, onGo: onGoActivity },
              { label: "Your open notes", n: notes.length, expand: (
                <div style={{ display: "grid", gap: 6, borderTop: `1px solid ${P.border}`, paddingTop: 8 }}>
                  {notes.length === 0 && <span style={{ fontFamily: SANS, fontSize: 12, color: P.text3 }}>No open notes — use the pencil (top bar) or hold Ask and say &ldquo;remember to…&rdquo;.</span>}
                  {notes.map((n) => (
                    <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button title="Mark done" onClick={() => { setNotes((xs) => xs.filter((x) => x.id !== n.id)); void fetch("/api/cos-notes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id, status: "done" }) }).catch(() => {}); }}
                        style={{ width: 17, height: 17, borderRadius: 99, border: `1.6px solid ${P.amber}`, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
                      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: P.text, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{n.title}</span>
                      {n.stale && <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 800, color: P.red }}>STILL OPEN</span>}
                    </div>
                  ))}
                </div>
              ) },
            ]} />
          <ActiveAgentsCard wall={wall} onOpenAgent={onOpenAgent} onGo={onGoAgents} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, alignItems: "start" }}>
          {/* top row under the summary: alerts lead, approvals + events stack right */}
          <SecurityAlertsCard alerts={alerts} onOpenEmail={onOpenEmail} onOpenAgent={onOpenAgent} composing={sum === null} theaterKeys={(wall?.cabinet ?? []).map((c) => c.agentKey)} />
          <div style={{ display: "grid", gap: 14 }}>
            <MetricCard title="Pending approvals" n={String(waiting)} sub={waiting > 0 ? `${waiting} drafted repl${waiting === 1 ? "y" : "ies"} waiting on your sign-off.` : "Queue is clear — nothing waiting on you."} cta="Approvals" onGo={onGoApprovals} />
            <EventsWidget events={sum?.calendar ?? []} onGo={onGoCalendar} />
          </div>
        </div>
      </div>
    </div>
  );
}
