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

const TAG_C: Record<string, { fg: string; bg: string }> = {
  "draft ready": { fg: C.goldHi, bg: "rgba(231,181,60,.16)" },
  "needs reply": { fg: C.text2, bg: "rgba(var(--ink),.07)" },
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
    return () => { alive = false; };
  }, []);

  const pressing = sum?.pressing ?? [];
  const events = sum?.calendar ?? [];

  return (
    <div style={{ marginTop: mobile ? 13 : 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
        <div style={{ fontFamily: FONT.serif, fontSize: mobile ? 18 : 19, fontWeight: 700, color: C.text }}>Needs to know</div>
        {sum && <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, letterSpacing: ".04em" }}>Chief of Staff{sum.live ? "" : " · draft"}</span>}
      </div>

      <div style={{ borderRadius: 16, border: `1px solid ${C.line}`, overflow: "hidden", background: "rgba(var(--ink),.02)" }}>
        {/* the narrative — the synthesized intelligence, in the CoS voice */}
        <div style={{ padding: mobile ? "14px 15px" : "16px 18px", borderBottom: pressing.length || events.length ? `1px solid ${C.line2}` : undefined }}>
          {!sum && !failed && <div style={{ color: C.dim, fontSize: 13.5 }}>Reading the morning…</div>}
          {failed && <div style={{ color: C.dim, fontSize: 13.5 }}>Couldn&rsquo;t reach your Chief of Staff. Pull to refresh.</div>}
          {sum && (
            <div style={{ fontSize: mobile ? 14.5 : 15.5, color: C.text, lineHeight: 1.6, fontFamily: FONT.sans }}>{sum.narrative}</div>
          )}
        </div>

        {/* top email issues + actions required — the ranked list, each opens the email */}
        {pressing.map((p, i) => {
          const tag = TAG_C[p.tag] ?? TAG_C["needs reply"];
          const clickable = !!(p.messageId && onOpenEmail);
          return (
            <button key={i} onClick={clickable ? () => onOpenEmail!(p.messageId!) : undefined} disabled={!clickable}
              style={{ display: "flex", gap: 11, width: "100%", textAlign: "left", background: "none", border: 0, padding: mobile ? "11px 15px" : "12px 18px", borderTop: `1px solid ${C.line2}`, cursor: clickable ? "pointer" : "default", fontFamily: FONT.sans, alignItems: "flex-start" }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.dim, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: mobile ? 14 : 14.5, fontWeight: 700, color: C.text, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>{p.title}</span>
                  <span style={{ flexShrink: 0, fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: tag.fg, background: tag.bg, padding: "2px 7px", borderRadius: 6 }}>{p.tag}</span>
                </div>
                {p.why && <div style={{ fontSize: 12.5, color: C.text3, marginTop: 3, lineHeight: 1.45, overflowWrap: "anywhere" }}>{p.why}</div>}
              </div>
              {clickable && <span style={{ color: C.gold, fontSize: 13, fontWeight: 800, flexShrink: 0, alignSelf: "center" }}>→</span>}
            </button>
          );
        })}

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
