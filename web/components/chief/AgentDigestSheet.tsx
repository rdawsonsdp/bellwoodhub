"use client";
/*
 * AgentDigestSheet — one agent's full latest run: the digest bullets with
 * tappable citation chips (→ the source message), ending with its actItems
 * ("1 draft ready → Approve"). Bottom sheet on mobile, right panel on desktop.
 * Satisfies "give me an update from the police agent" in one tap from the Wall.
 *
 * Data arrives WITH the wall payload (same single call) — the sheet can never
 * disagree with the card that opened it. Citations link to the existing email
 * view until Phase 4 rebuilds the in-app thread view.
 */
import { useState, type CSSProperties } from "react";
import { C, FONT, card, cite, eyebrow } from "@/lib/cos-design";
import type { WallRun, CabinetCard, WallSchedule } from "@/lib/wall";
import { AgentAvatar } from "./AgentBadge";
import ComingUp from "./ComingUp";

interface Props {
  run: WallRun;
  card: CabinetCard;
  /** The Schedule agent's detail carries its calendar face too. */
  schedule?: WallSchedule;
  variant: "mobile" | "desktop";
  onClose: () => void;
  onOpenMessage: (mid: string) => void;
  onGoApprovals: () => void;
  /** Re-pull this agent's activity (email seats: manual sync first) — the
   *  sheet re-renders from the reloaded wall payload. */
  onRefresh?: () => Promise<void>;
  /** The gear (RD 2026-07-05): jump to this agent's detail view on Staff
   *  Agents — config, plain-English card, full activity. */
  onOpenAgentDetail?: () => void;
}

const URGENCY_C: Record<string, string> = { red: C.red, yellow: C.orange, clear: C.green };

export default function AgentDigestSheet({ run, card: c, schedule, variant, onClose, onOpenMessage, onGoApprovals, onRefresh, onOpenAgentDetail }: Props) {
  const mobile = variant === "mobile";
  const [refreshing, setRefreshing] = useState(false);
  // SHOW THE WORK (RD 2026-07-21): the run's recorded execution — model,
  // timing, tokens, what it read, prompt, response, what validation dropped.
  // The eval/trace surface; fetched on first open.
  const [workOpen, setWorkOpen] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const toggleWork = () => {
    setWorkOpen((o) => !o);
    if (!diag) {
      fetch(`/api/agents/diagnostics?agent=${encodeURIComponent(c.agentKey)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: Diagnostics) => setDiag(d))
        .catch(() => setDiag({ error: true } as Diagnostics));
    }
  };
  // Sent groups collapse by date (RD 2026-07-05): only Today starts open —
  // older days are a header + count until tapped.
  const [openDays, setOpenDays] = useState<Set<string>>(
    () => new Set((run.sent ?? []).filter((d) => d.label === "Today").map((d) => d.date)),
  );
  const toggleDay = (date: string) =>
    setOpenDays((s) => {
      const next = new Set(s);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  const refresh = async () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };
  const panel: CSSProperties = mobile
    ? { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "86dvh", borderRadius: "18px 18px 0 0", borderTop: `1px solid ${C.line}` }
    : { position: "absolute", top: 0, right: 0, bottom: 0, width: 480, maxWidth: "92vw", borderLeft: `1px solid ${C.line}` };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", backdropFilter: "blur(2px)" }}>
      <div className="scrl" onClick={(e) => e.stopPropagation()} style={{ ...panel, background: "var(--c-appbg)", overflowY: "auto", padding: mobile ? "18px 18px calc(env(safe-area-inset-bottom) + 28px)" : "18px 18px 28px", color: C.text, fontFamily: FONT.sans }}>
        {/* header: the agent's mark + name; urgency stays on the status dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AgentAvatar agentKey={c.agentKey} size={32} />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 15.5, fontWeight: 800 }}>{c.name}</span>
            {c.subtitle && (
              <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.subtitle}</span>
            )}
          </span>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[run.urgency], flexShrink: 0 }} />
          {c.walled && <span style={privatePill}>Private</span>}
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{c.lastRunLabel}</span>
          {onOpenAgentDetail && (
            <button onClick={onOpenAgentDetail} aria-label="Agent settings & details" title="Agent settings & details" style={roundBtn}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01A1.7 1.7 0 0 0 20.91 11H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
              </svg>
            </button>
          )}
          {onRefresh && (
            <button onClick={refresh} aria-label="Refresh this agent's activity" title="Refresh activity" style={{ ...roundBtn, opacity: refreshing ? 0.6 : 1 }}>
              <span style={{ display: "inline-block", animation: refreshing ? "cosSpin 1s linear infinite" : undefined }}>↻</span>
            </button>
          )}
          <button onClick={onClose} aria-label="Close" style={roundBtn}>✕</button>
        </div>

        <div style={{ fontFamily: FONT.serif, fontSize: 19, fontWeight: 600, lineHeight: 1.25, margin: "14px 0 4px" }}>{run.headline}</div>

        {/* the trace button — transparency beats trust-me. A real, pushable
            control (RD 2026-07-21): informational grey, brain to the left. */}
        <button onClick={toggleWork} style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 7, cursor: "pointer", borderRadius: 11, padding: "9px 15px", border: `1px solid ${workOpen ? "rgba(231,181,60,.55)" : C.line}`, background: workOpen ? "rgba(231,181,60,.1)" : "rgba(var(--ink),.07)", color: workOpen ? C.goldHi : C.text2, fontFamily: FONT.sans, fontWeight: 800, fontSize: 12.5, boxShadow: workOpen ? "none" : "0 2px 5px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.07)", transition: "background .12s, box-shadow .12s" }}>
          {/* the brain — the agent's thinking */}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
            <path d="M12 5v13" />
          </svg>
          Show the work
          <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: ".06em", color: workOpen ? C.gold : C.dim, fontWeight: 500 }}>model · prompt · timing</span>
          <span style={{ fontSize: 10, transform: workOpen ? "rotate(90deg)" : undefined, display: "inline-block", transition: "transform .12s" }}>▶</span>
        </button>
        {workOpen && <WorkPanel diag={diag} />}

        {/* waiting on you FIRST (RD: dashboard) — the number lives here, the
            deciding lives in the Queue */}
        {run.waitingApproval != null && (
          <div style={{ ...card, marginTop: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, ...(run.waitingApproval > 0 ? { border: "1px solid rgba(231,181,60,.45)" } : {}) }}>
            <span style={{ fontFamily: FONT.serif, fontSize: 30, fontWeight: 600, lineHeight: 1, color: run.waitingApproval > 0 ? C.goldHi : C.dim }}>{run.waitingApproval}</span>
            <span style={{ flex: 1, fontSize: 13, color: C.text2, lineHeight: 1.4 }}>
              {run.waitingApproval === 1 ? "reply waiting your approval" : "replies waiting your approval"}
              {run.waitingApproval === 0 && " — queue is clear"}
            </span>
            {run.waitingApproval > 0 && (
              <button onClick={onGoApprovals} style={{ cursor: "pointer", border: 0, borderRadius: 10, padding: "9px 14px", fontWeight: 800, fontSize: 12.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322", flexShrink: 0 }}>
                Review →
              </button>
            )}
          </div>
        )}

        {/* the Schedule agent's calendar face — same ComingUp as its card */}
        {schedule && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...eyebrow(C.dim), marginBottom: 9 }}>Coming up</div>
            <div style={{ ...card, padding: "14px 15px" }}>
              <ComingUp schedule={schedule} />
            </div>
          </div>
        )}

        {/* digest — a news brief: each story is a mini-headline + key facts,
            tagged NEW or UPDATE (an update advances a story the agent's memory
            already tracks). Runs from before the news format have no title and
            fall back to the plain bulleted point. Every story cited. */}
        <div style={{ display: "grid", gap: 15, marginTop: 12 }}>
          {run.digest.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: d.kind === "update" ? C.goldHi : URGENCY_C[run.urgency], flexShrink: 0, opacity: 0.8 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {d.title ? (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: FONT.serif, fontSize: 15.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{d.title}</span>
                      {d.kind && (
                        <span style={{ fontFamily: FONT.mono, fontSize: 9, fontWeight: 800, letterSpacing: ".08em", padding: "2px 7px", borderRadius: 6, textTransform: "uppercase", color: d.kind === "update" ? C.goldHi : C.greenText, background: d.kind === "update" ? "rgba(231,181,60,.15)" : "rgba(52,201,139,.13)" }}>
                          {d.kind === "update" ? "Update" : "New"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginTop: 4 }}>{d.point}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 14.5, color: C.text2, lineHeight: 1.6 }}>{d.point}</div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {d.sources.map((s) => (
                    <button key={s.messageId} onClick={() => onOpenMessage(s.messageId)} style={{ ...cite, border: 0, cursor: "pointer" }}>
                      {s.label} ↗
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* sent — what actually went out, grouped by day (the one-stop
            activity record for seats that can transmit) */}
        {run.sent && (
          <div style={{ marginTop: 20 }}>
            {/* the business-value number (RD): emails actually answered */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 10 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 17, fontWeight: 700, color: C.text }}>Agent responded</span>
              <span style={{ ...eyebrow(C.dim), fontSize: 9.5 }}>past 3 days</span>
            </div>
            {run.sent.length === 0 ? (
              <div style={{ ...card, padding: 14, textAlign: "center", color: C.dim, fontSize: 12.5 }}>No responses sent in the past 3 days.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {run.sent.map((day) => {
                  const open = openDays.has(day.date);
                  return (
                    <div key={day.date} style={{ minWidth: 0 }}>
                      {/* collapsed by date (RD): the header is the toggle,
                          the day's answered-count is the dashboard number */}
                      <button onClick={() => toggleDay(day.date)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, padding: "4px 0", cursor: "pointer", textAlign: "left", marginBottom: open ? 6 : 0 }}>
                        <span style={{ fontFamily: FONT.serif, fontSize: 26, fontWeight: 600, lineHeight: 1, color: C.goldHi, minWidth: 30, textAlign: "center" }}>{day.items.length}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 700, color: C.text }}>{day.label}</span>
                          <span style={{ display: "block", fontFamily: FONT.mono, fontSize: 9.5, color: C.dim, marginTop: 1 }}>emails answered</span>
                        </span>
                        <span style={{ fontSize: 10, color: C.dim, transform: open ? "rotate(90deg)" : undefined, display: "inline-block", transition: "transform .12s ease", flexShrink: 0 }}>▶</span>
                      </button>
                      {/* wrap-then-clamp (never nowrap): unbroken strings like
                          long addresses must not widen the sheet on a phone */}
                      {open && (
                        <div style={{ ...card, overflow: "hidden", maxWidth: "100%" }}>
                          {day.items.map((s, i) => {
                            // Every sent email links to the message it answered
                            // (app.drafts.to_message_id → source_ref). No source →
                            // plain row, never a dead link.
                            const linked = !!s.sourceMessageId;
                            return (
                              <button
                                key={i}
                                onClick={linked ? () => onOpenMessage(s.sourceMessageId!) : undefined}
                                disabled={!linked}
                                style={{ display: "flex", width: "100%", textAlign: "left", background: "none", border: 0, padding: "10px 13px", borderTop: i ? `1px solid ${C.line2}` : undefined, gap: 10, alignItems: "baseline", minWidth: 0, cursor: linked ? "pointer" : "default", fontFamily: FONT.sans }}
                              >
                                <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, width: 50, flexShrink: 0 }}>{s.timeLabel}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, ...clampLines(1) }}>{s.to}</div>
                                  <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2, lineHeight: 1.45, ...clampLines(2) }}>{s.subject}</div>
                                </div>
                                {linked && <span style={{ color: C.gold, fontSize: 12, flexShrink: 0, alignSelf: "center" }}>↗</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 8, textAlign: "center", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>
              every send human-approved · full record in the audit ledger
            </div>
          </div>
        )}

        {/* actItems — the human gate */}
        {run.actItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ ...eyebrow(C.dim), marginBottom: 10 }}>
              {run.actItems.length} draft{run.actItems.length === 1 ? "" : "s"} ready for your approval
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {run.actItems.map((a) => (
                <div key={a.threadId} style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{a.subject}</div>
                  <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5, fontFamily: FONT.serif, fontStyle: "italic", borderLeft: "2px solid rgba(157,139,255,.4)", paddingLeft: 11, whiteSpace: "pre-wrap" }}>
                    {a.body.length > 220 ? `${a.body.slice(0, 220)}…` : a.body}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {a.citations.map((s) => (
                      <button key={s.messageId} onClick={() => onOpenMessage(s.messageId)} style={{ ...cite, border: 0, cursor: "pointer" }}>{s.label} ↗</button>
                    ))}
                  </div>
                  <button onClick={onGoApprovals} style={{ cursor: "pointer", border: 0, borderRadius: 10, padding: "10px 14px", fontWeight: 800, fontSize: 13.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}>
                    Approve →
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, textAlign: "center", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>
              drafted by {c.name} · never auto-sent
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Wrap up to n lines, then ellipsize — and break even unbroken strings
 *  (emails, URLs) so they can never widen the sheet past the viewport. */
const clampLines = (n: number): CSSProperties => ({
  display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical",
  overflow: "hidden", overflowWrap: "anywhere",
});

const roundBtn: CSSProperties = {
  background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 99,
  width: 30, height: 30, color: C.text2, cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0,
};

const privatePill: CSSProperties = {
  padding: "2px 8px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em",
  fontFamily: FONT.mono, textTransform: "uppercase", color: C.purpleText,
  background: "rgba(157,139,255,.14)", border: "1px solid rgba(157,139,255,.3)", flexShrink: 0,
};


/* ── SHOW THE WORK — the run's recorded execution (migration 019) ─────────── */
interface Diagnostics {
  error?: boolean;
  kind?: string; lane?: string; sources?: string[];
  instruction?: string; focusQuery?: string | null; autonomy?: string;
  lastRun?: {
    ranAt: string;
    work: null | {
      model?: string; task?: string; startedAt?: string; ms?: number;
      tokens?: { input?: number; output?: number };
      read?: { slice?: number; focusQuery?: string | null; focusHits?: number; related?: number; memory?: number; skills?: number };
      validation?: { digestKept?: number; citationsDropped?: number; droppedIds?: string[] };
      prompt?: { system?: string; user?: string };
      response?: string;
    };
  } | null;
}

function WorkPanel({ diag }: { diag: Diagnostics | null }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  if (!diag) return <div style={{ margin: "8px 0 0", fontSize: 12, color: C.dim }}>Reading the run record…</div>;
  if (diag.error) return <div style={{ margin: "8px 0 0", fontSize: 12, color: C.redText }}>Couldn&rsquo;t read the run record.</div>;
  const w = diag.lastRun?.work ?? null;
  const row = (k: string, v: string) => (
    <div style={{ display: "flex", gap: 10, padding: "2.5px 0" }}>
      <span style={{ flex: "0 0 92px", fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: C.dim, paddingTop: 2 }}>{k}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: C.text2, lineHeight: 1.5, overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );
  const mono: CSSProperties = { margin: "6px 0 0", padding: "10px 12px", borderRadius: 10, background: "rgba(var(--ink),.05)", border: `1px solid ${C.line2}`, fontFamily: FONT.mono, fontSize: 10.5, lineHeight: 1.55, color: C.text2, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 260, overflowY: "auto" };
  return (
    <div style={{ margin: "9px 0 4px", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.line}`, background: "rgba(var(--ink),.025)" }}>
      {/* execution */}
      {w ? (
        <>
          {row("Model", `${w.model ?? "—"}${w.task ? ` · task ${w.task}` : ""}`)}
          {row("Executed", `${w.startedAt ? new Date(w.startedAt).toLocaleString() : "—"} · ${w.ms != null ? `${(w.ms / 1000).toFixed(1)}s` : "—"}${w.tokens ? ` · ${w.tokens.input ?? 0} in / ${w.tokens.output ?? 0} out tokens` : ""}`)}
          {w.read && row("It read", `${w.read.slice ?? 0} new messages · ${w.read.focusHits ?? 0} focus matches${w.read.focusQuery ? ` for “${w.read.focusQuery}”` : ""} · ${w.read.related ?? 0} related · ${w.read.memory ?? 0} memory items`)}
          {w.validation && row("Validation", `${w.validation.digestKept ?? 0} stories kept · ${w.validation.citationsDropped ?? 0} citation(s) dropped${w.validation.droppedIds?.length ? ` (${w.validation.droppedIds.slice(0, 3).join(", ")}${w.validation.droppedIds.length > 3 ? "…" : ""})` : ""}`)}
        </>
      ) : (
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>This run predates work-recording — the next run will carry its full trace.</div>
      )}
      {/* identity — how it retrieves */}
      {diag.instruction && row("Instruction", diag.instruction.length > 240 ? `${diag.instruction.slice(0, 240)}…` : diag.instruction)}
      {diag.focusQuery && row("Derived query", `“${diag.focusQuery}”`)}
      {row("Reads", `${diag.lane === "biz" ? "Private walled lane" : "Government lane"}${diag.sources?.length ? ` · ${diag.sources.join(", ")}` : " · every source in its lane"} · autonomy ${diag.autonomy ?? "observe"}`)}
      {/* the raw artifacts */}
      {w?.prompt && (
        <>
          <button onClick={() => setShowPrompt((o) => !o)} style={{ marginTop: 8, background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: FONT.mono, fontSize: 10, letterSpacing: ".06em", color: showPrompt ? C.gold : C.dim }}>
            {showPrompt ? "▾" : "▸"} FULL PROMPT ({((w.prompt.system?.length ?? 0) + (w.prompt.user?.length ?? 0)).toLocaleString()} chars)
          </button>
          {showPrompt && <pre style={mono}>{`— SYSTEM —
${w.prompt.system ?? ""}

— USER —
${w.prompt.user ?? ""}`}</pre>}
        </>
      )}
      {w?.response && (
        <>
          <div>
            <button onClick={() => setShowResponse((o) => !o)} style={{ marginTop: 6, background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: FONT.mono, fontSize: 10, letterSpacing: ".06em", color: showResponse ? C.gold : C.dim }}>
              {showResponse ? "▾" : "▸"} RAW RESPONSE ({w.response.length.toLocaleString()} chars)
            </button>
          </div>
          {showResponse && <pre style={mono}>{w.response}</pre>}
        </>
      )}
    </div>
  );
}
