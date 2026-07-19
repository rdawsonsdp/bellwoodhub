"use client";
/*
 * AddAgentSheet — the "Add an agent" surface (the + card on the Wall).
 *
 * Design (RD ref 2026-07-02, integration-picker idiom): a serif-headed panel
 * with a GRID of type cards — icon tile, name, one-line description. Clicking
 * a type drills into what its onboarding interview asks and which connections
 * it will request. The Agent Builder that RUNS the interview arrives with the
 * Agent Factory (RB-6, docs/rebuild/AGENT_FACTORY.md) — stated honestly on the
 * detail view; never a dead button.
 */
import { useState, type CSSProperties } from "react";
import { C, FONT, card, eyebrow } from "@/lib/cos-design";
import { AGENT_TYPES, type AgentTypeSeed } from "@/lib/agent-types";

interface Props {
  variant: "mobile" | "desktop";
  onClose: () => void;
}

/** Type tiles: stroke icon on a solid hue (same identity language as agents). */
const TYPE_META: Record<string, { color: string; d: string[] }> = {
  "email-ingest": { color: "#5b8def", d: ["M3 7l9 6 9-6", "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"] },
  "domain-desk": { color: "#2fb7a8", d: ["M3 21h18", "M5 21V10M9 21V10M15 21V10M19 21V10", "M3 10l9-7 9 7"] },
  "entity-scope": { color: "#a983ea", d: ["M4 9h16v11H4z", "M3 9l2-5h14l2 5", "M9 20v-6h6v6"] },
  commitments: { color: "#f0be3c", d: ["M7 3v3M17 3v3M4 9h16", "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"] },
  "doc-connector": { color: "#93a4bd", d: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M9 13h6M9 17h6"] },
};

function TypeTile({ typeKey, size = 30 }: { typeKey: string; size?: number }) {
  const m = TYPE_META[typeKey] ?? { color: "#93a4bd", d: ["M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z"] };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: Math.round(size * 0.3), background: m.color, boxShadow: "inset 0 -2px 4px rgba(0,0,0,.14)", flexShrink: 0 }}>
      <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="none" stroke="#182126" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {m.d.map((p, i) => <path key={i} d={p} />)}
      </svg>
    </span>
  );
}

export default function AddAgentSheet({ variant, onClose }: Props) {
  const mobile = variant === "mobile";
  const [sel, setSel] = useState<AgentTypeSeed | null>(null);
  const panel: CSSProperties = mobile
    ? { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88dvh", borderRadius: "18px 18px 0 0", borderTop: `1px solid ${C.line}` }
    : { position: "absolute", top: 0, right: 0, bottom: 0, width: 520, maxWidth: "94vw", borderLeft: `1px solid ${C.line}` };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", backdropFilter: "blur(2px)" }}>
      <div className="scrl" onClick={(e) => e.stopPropagation()} style={{ ...panel, background: "var(--c-appbg)", overflowY: "auto", padding: "20px 20px 30px", color: C.text, fontFamily: FONT.sans }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sel && (
            <button onClick={() => setSel(null)} aria-label="Back" style={{ background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 99, width: 30, height: 30, color: C.text2, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>←</button>
          )}
          <span style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 600, flex: 1, letterSpacing: "-.01em" }}>{sel ? sel.name : "Add an agent"}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 99, width: 30, height: 30, color: C.text2, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>

        {!sel ? (
          <>
            <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.55, margin: "8px 0 18px" }}>
              Pick a type of agent to add. Onboarding is an interview — a few
              questions configure the seat; sign-ins are requested only if the agent needs them.
              Every new agent starts observe-only until it earns more.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr", gap: 11 }}>
              {AGENT_TYPES.map((t) => (
                <button key={t.key} onClick={() => setSel(t)} style={{ ...card, textAlign: "left", cursor: "pointer", padding: "14px 14px 13px", display: "flex", flexDirection: "column", gap: 9, color: C.text, fontFamily: FONT.sans, background: "var(--c-sidebar, rgba(var(--ink),.03))" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <TypeTile typeKey={t.key} />
                    <span style={{ fontSize: 14, fontWeight: 800, minWidth: 0 }}>{t.name}</span>
                  </span>
                  <span style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{t.blurb}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: "11px 14px", borderRadius: 12, fontSize: 12, lineHeight: 1.55, color: C.text3, background: "rgba(var(--ink),.045)", border: `1px solid ${C.line}` }}>
              Need something that fits none of these? The Builder can interview from scratch and
              define a new type — bound by the same rules: observe-first, always cites, never sends.
            </div>
          </>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <TypeTile typeKey={sel.key} size={38} />
              <span style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{sel.blurb}</span>
            </div>
            <div style={{ ...eyebrow(C.dim), margin: "16px 0 8px" }}>The interview starts with</div>
            <div style={{ ...card, padding: "4px 14px" }}>
              {sel.interview.map((q, i) => (
                <div key={q} style={{ display: "flex", gap: 10, fontSize: 13.5, color: C.text2, lineHeight: 1.5, padding: "11px 0", borderTop: i ? `1px solid ${C.line2}` : undefined }}>
                  <span style={{ color: C.gold, fontWeight: 700 }}>{i + 1}.</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
            {sel.connections.length > 0 && (
              <>
                <div style={{ ...eyebrow(C.dim), margin: "16px 0 8px" }}>It will ask to connect</div>
                {sel.connections.map((c) => (
                  <div key={c} style={{ display: "flex", gap: 9, fontSize: 13, color: C.text2, padding: "4px 2px" }}>
                    <span style={{ color: C.blue }}>⚿</span>
                    <span>{c} — stored in the secret vault, never in the agent&apos;s config.</span>
                  </div>
                ))}
              </>
            )}
            <button disabled title="The Agent Builder arrives with the Agent Factory (RB-6)" style={{ display: "block", width: "100%", marginTop: 18, padding: "13px 14px", borderRadius: 13, border: 0, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322", fontWeight: 800, fontSize: 14, fontFamily: FONT.sans, opacity: 0.45, cursor: "not-allowed" }}>
              Start the interview
            </button>
            <div style={{ marginTop: 8, textAlign: "center", fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>
              the Agent Builder arrives with the Agent Factory (RB-6)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
