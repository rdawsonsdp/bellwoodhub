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
import type { CSSProperties } from "react";
import { C, FONT, card, cite, eyebrow } from "@/lib/cos-design";
import type { WallRun, CabinetCard } from "@/lib/wall";

interface Props {
  run: WallRun;
  card: CabinetCard;
  variant: "mobile" | "desktop";
  onClose: () => void;
  onOpenMessage: (mid: string) => void;
  onGoApprovals: () => void;
}

const URGENCY_C: Record<string, string> = { red: C.red, yellow: C.orange, clear: C.green };

export default function AgentDigestSheet({ run, card: c, variant, onClose, onOpenMessage, onGoApprovals }: Props) {
  const mobile = variant === "mobile";
  const panel: CSSProperties = mobile
    ? { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "86dvh", borderRadius: "18px 18px 0 0", borderTop: `1px solid ${C.line}` }
    : { position: "absolute", top: 0, right: 0, bottom: 0, width: 480, maxWidth: "92vw", borderLeft: `1px solid ${C.line}` };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", backdropFilter: "blur(2px)" }}>
      <div className="scrl" onClick={(e) => e.stopPropagation()} style={{ ...panel, background: "var(--c-appbg)", overflowY: "auto", padding: "18px 18px 28px", color: C.text, fontFamily: FONT.sans }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: URGENCY_C[run.urgency], flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 800, flex: 1, minWidth: 0 }}>{c.name}</span>
          {c.walled && <span style={privatePill}>Private</span>}
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{c.lastRunLabel}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 99, width: 30, height: 30, color: C.text2, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ fontFamily: FONT.serif, fontSize: 19, fontWeight: 600, lineHeight: 1.25, margin: "14px 0 4px" }}>{run.headline}</div>

        {/* digest — every point cited */}
        <div style={{ display: "grid", gap: 13, marginTop: 12 }}>
          {run.digest.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ color: URGENCY_C[run.urgency], fontSize: 15, lineHeight: 1.4, flexShrink: 0 }}>•</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.55 }}>{d.point}</div>
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

const privatePill: CSSProperties = {
  padding: "2px 8px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em",
  fontFamily: FONT.mono, textTransform: "uppercase", color: C.purpleText,
  background: "rgba(157,139,255,.14)", border: "1px solid rgba(157,139,255,.3)", flexShrink: 0,
};
