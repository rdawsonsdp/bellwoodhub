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

/* ── palette (spec) ─────────────────────────────────────────────────────── */
const P = {
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

const SANS = "'Public Sans','Inter',system-ui,sans-serif";

/* ── shared card chrome ─────────────────────────────────────────────────── */
function WCard({ children, span, alt }: { children: React.ReactNode; span?: number; alt?: boolean }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, background: alt ? P.cardAlt : P.card, border: `1px solid ${P.border}`, borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 3px rgba(30,30,30,.05)", display: "flex", flexDirection: "column", minWidth: 0 }}>
      {children}
    </div>
  );
}
function WHead({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>{title}</span>
      {onMore && (
        <button onClick={onMore} aria-label={`Open ${title}`} style={{ cursor: "pointer", background: "none", border: 0, color: P.text3, fontSize: 15, fontWeight: 700, padding: 2 }}>›</button>
      )}
    </div>
  );
}
const btnSolid: React.CSSProperties = { cursor: "pointer", border: 0, borderRadius: 9, padding: "9px 15px", fontFamily: SANS, fontWeight: 800, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", background: `linear-gradient(135deg, ${P.amber}, ${P.amberDeep})`, color: "#fff" };
const btnOutline: React.CSSProperties = { cursor: "pointer", borderRadius: 9, padding: "8px 14px", fontFamily: SANS, fontWeight: 800, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", background: "#fff", border: `1.5px solid ${P.border}`, color: P.text2 };

/* ── 1. Critical Security Alerts (priority card, 2 columns) ─────────────── */
export function SecurityAlertsCard({ alerts, onOpenEmail, onOpenAgent }: {
  alerts: PressingItem[];
  onOpenEmail?: (mid: string) => void;
  onOpenAgent?: (agentKey: string) => void;
}) {
  return (
    <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(30,30,30,.06)", minWidth: 0 }}>
      {/* high-contrast banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: `linear-gradient(120deg, ${P.rust}, #A93F10)`, color: "#fff" }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#F6C563" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
        </svg>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", opacity: 0.85 }}>Critical security alerts</div>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 800 }}>{alerts.length ? `${alerts.length} unresolved — action required` : "All clear"}</div>
        </div>
      </div>
      {alerts.length === 0 && (
        <div style={{ padding: "18px", fontFamily: SANS, fontSize: 13.5, color: P.text2 }}>No critical alerts from any desk right now.</div>
      )}
      {alerts.map((a, i) => (
        <div key={i} style={{ padding: "14px 18px", borderTop: i ? `1px solid ${P.border}` : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: 12, color: P.text3, fontWeight: 700 }}>{i + 1}</span>
            {a.agentKey && <AgentAvatar agentKey={a.agentKey} size={17} />}
            <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>{a.agentName}</span>
            <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: ".08em", padding: "3px 10px", borderRadius: 99, background: a.tag === "update" ? P.red : P.green, color: "#fff" }}>
              {a.tag === "update" ? "UNRESOLVED" : "NEW"}
            </span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 800, color: P.text, lineHeight: 1.25, marginTop: 6, overflowWrap: "anywhere" }}>{a.title}</div>
          {a.why && <div style={{ fontFamily: SANS, fontSize: 13, color: P.text2, lineHeight: 1.55, marginTop: 5, overflowWrap: "anywhere" }}>{a.why}</div>}
          <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap" }}>
            {a.messageId && onOpenEmail && (
              <button onClick={() => onOpenEmail(a.messageId!)} style={btnSolid}>Open email ↗</button>
            )}
            {a.agentKey && onOpenAgent && (
              <button onClick={() => onOpenAgent(a.agentKey!)} style={btnOutline}>View report</button>
            )}
          </div>
        </div>
      ))}
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
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }} title={`${s.n.toLocaleString()} rows`}>
            <div style={{ width: "100%", maxWidth: 26, height: Math.max(3, Math.round((s.n / max) * 70)), borderRadius: 5, background: `linear-gradient(180deg, ${P.amber}, ${P.amberDeep})` }} />
            <span style={{ fontFamily: SANS, fontSize: 9, color: P.text3, whiteSpace: "nowrap" }}>{s.label}</span>
          </div>
        ))}
      </div>
      {onGo && <button onClick={onGo} style={{ ...btnOutline, alignSelf: "flex-start", marginTop: 10 }}>Sync detail ›</button>}
    </WCard>
  );
}

/* ── 5. Priority matrix (urgency × importance, from live triage) ────────── */
export function MatrixWidget({ counts, onGo }: {
  counts: { needsReply: number; waiting: number; awaiting: number; fyi: number };
  onGo?: () => void;
}) {
  const total = Math.max(1, counts.needsReply + counts.waiting + counts.awaiting + counts.fyi);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const cell = (bg: string, label: string, n: number): React.ReactNode => (
    <div style={{ background: bg, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 800, color: "#fff" }}>{pct(n)}</div>
      <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.9)" }}>{label}</div>
    </div>
  );
  return (
    <WCard>
      <WHead title="Priority matrix" onMore={onGo} />
      <div style={{ display: "grid", gridTemplateColumns: "14px 1fr 1fr", gap: 6, alignItems: "stretch", flex: 1 }}>
        <div style={{ fontFamily: SANS, fontSize: 9.5, color: P.text3, writingMode: "vertical-rl", transform: "rotate(180deg)", textAlign: "center" }}>urgency →</div>
        {cell(P.red, "needs reply", counts.needsReply)}
        {cell(P.amber, "drafts waiting", counts.waiting)}
        <span />
        {cell("#5B8C5A", "awaiting others", counts.awaiting)}
        {cell("#A8A29A", "FYI", counts.fyi)}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: P.text3, textAlign: "center", marginTop: 5 }}>share of classified mail · live triage</div>
    </WCard>
  );
}

/* ── 6a. List metrics ───────────────────────────────────────────────────── */
export function ListMetricsCard({ rows, title, onGo }: { title: string; rows: { label: string; n: number }[]; onGo?: () => void }) {
  return (
    <WCard>
      <WHead title={title} onMore={onGo} />
      <div style={{ display: "grid", gap: 9, flex: 1 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: SANS, fontSize: 13, color: P.text2, flex: 1 }}>{r.label}</span>
            <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 800, color: P.text }}>{r.n.toLocaleString()}</span>
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
export default function DashboardHub({ wall, onOpenEmail, onOpenAgent, onGoApprovals, onGoNeedsYou, onGoCalendar, onGoSync, onGoAgents }: {
  wall: WallPayload | null;
  onOpenEmail?: (mid: string) => void;
  onOpenAgent?: (agentKey: string) => void;
  onGoApprovals: () => void;
  onGoNeedsYou?: () => void;
  onGoCalendar?: () => void;
  onGoSync?: () => void;
  onGoAgents?: () => void;
}) {
  const [sum, setSum] = useState<MorningSummary | null>(null);
  const [triage, setTriage] = useState<{ needsReply: number; awaiting: number; fyi: number }>({ needsReply: 0, awaiting: 0, fyi: 0 });
  const [notes, setNotes] = useState(0);

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
      .then((d: { notes?: unknown[] }) => live && setNotes(d.notes?.length ?? 0)).catch(() => {});
    return () => { live = false; };
  }, []);

  const pressing = sum?.pressing ?? [];
  // critical = stories filed by a desk whose LATEST RUN is red urgency (the
  // run's own judgment — not the card dot, which can reflect account status)
  const redDesks = new Set(
    Object.values(wall?.runs ?? {}).filter((r) => r.urgency === "red").map((r) => r.agentKey),
  );
  const isStory = (p: PressingItem) => p.tag === "update" || p.tag === "new";
  const alerts = pressing.filter((p) => isStory(p) && p.agentKey && redDesks.has(p.agentKey)).slice(0, 3);
  const waiting = wall?.footer.waiting ?? 0;
  const handled = wall?.footer.handled ?? 0;

  return (
    <div style={{ background: P.bg, borderRadius: 20, padding: 16, marginTop: 18 }}>
      {/* the CoS briefing line — a bordered card at the top (RD 2026-07-22),
          same chrome as the widgets; full text, never clipped mid-sentence */}
      {sum?.narrative && (
        <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, boxShadow: "0 1px 3px rgba(30,30,30,.05)", padding: "13px 16px", marginBottom: 14, display: "flex", gap: 11, alignItems: "flex-start" }}>
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
          <MatrixWidget counts={{ needsReply: triage.needsReply, waiting, awaiting: triage.awaiting, fyi: triage.fyi }} onGo={onGoNeedsYou} />
          <ListMetricsCard title="Recent email actions" onGo={onGoNeedsYou}
            rows={[
              { label: "Need your reply", n: triage.needsReply },
              { label: "Handled by agents", n: handled },
              { label: "Your open notes", n: notes },
            ]} />
          <ActiveAgentsCard wall={wall} onOpenAgent={onOpenAgent} onGo={onGoAgents} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, alignItems: "start" }}>
          {/* top row under the summary: alerts lead, approvals + events stack right */}
          <SecurityAlertsCard alerts={alerts} onOpenEmail={onOpenEmail} onOpenAgent={onOpenAgent} />
          <div style={{ display: "grid", gap: 14 }}>
            <MetricCard title="Pending approvals" n={String(waiting)} sub={waiting > 0 ? `${waiting} drafted repl${waiting === 1 ? "y" : "ies"} waiting on your sign-off.` : "Queue is clear — nothing waiting on you."} cta="Approvals" onGo={onGoApprovals} />
            <EventsWidget events={sum?.calendar ?? []} onGo={onGoCalendar} />
          </div>
        </div>
      </div>
    </div>
  );
}
