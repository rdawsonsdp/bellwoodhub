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
      <div className="scrl" onClick={(e) => e.stopPropagation()} style={{ ...panel, background: "var(--c-appbg)", overflowY: "auto", padding: "18px 18px 28px", color: C.text, fontFamily: FONT.sans }}>
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

        {/* digest — every point cited */}
        <div style={{ display: "grid", gap: 13, marginTop: 12 }}>
          {run.digest.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ color: URGENCY_C[run.urgency], fontSize: 15, lineHeight: 1.4, flexShrink: 0 }}>•</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, color: C.text2, lineHeight: 1.6 }}>{d.point}</div>
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
