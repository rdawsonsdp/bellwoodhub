"use client";
/*
 * AskEvalPanel — the info button above an Ask result: how this answer was
 * actually produced (RD 2026-07-31, for testing).
 *
 * "The answer looks wrong" is only actionable if you can tell WHICH half was at
 * fault. So this shows the split rather than a single number: on the first
 * date-scoped query it read retrieval 4.1s / synthesis 9.8s, which immediately
 * said the remaining latency is the model, not the search — the opposite of the
 * day before, when retrieval was 37.8s of 42s.
 *
 * Everything here is measured and passed through from the server. Nothing is
 * estimated, and a field the server didn't send is omitted rather than guessed.
 */
import { useState } from "react";
import { C, FONT } from "@/lib/cos-design";
import type { AskEval } from "@/lib/types";

const ms = (n?: number) => (typeof n === "number" ? `${(n / 1000).toFixed(1)}s` : "—");

export default function AskEvalPanel({ data }: { data?: AskEval }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: C.dim, minWidth: 92, flexShrink: 0 }}>{k}</span>
      <span style={{ fontFamily: FONT.sans, fontSize: 12.5, color: C.text2, overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );

  const t = data.timings;
  // The split is the point — name the slower half outright so it needs no maths.
  const slower =
    typeof t.retrievalMs === "number" && typeof t.synthesisMs === "number"
      ? t.retrievalMs > t.synthesisMs ? "retrieval" : "synthesis"
      : null;

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="How this answer was produced"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          background: "none", border: `1px solid ${C.line}`, borderRadius: 999,
          padding: "4px 11px 4px 8px", color: C.dim,
          fontFamily: FONT.sans, fontSize: 11, fontWeight: 600,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.1" strokeLinecap="round" />
        </svg>
        How this was answered
        <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>· {ms(t.totalMs)}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px", background: "rgba(var(--ink),.03)" }}>
          {row("Path", data.path === "agent"
            ? "Agent — Claude chose its own searches"
            : "Pipeline — one retrieval pass, then synthesis")}
          {row("Model", <>{data.model}{data.effort ? ` · effort ${data.effort}` : ""}</>)}
          {data.range && row("Period", `${data.range.since ?? "—"} → ${data.range.until ?? "open"}`)}
          {row("Sources", String(data.sourcesReturned))}
          {typeof data.iterations === "number" && row("Iterations", String(data.iterations))}
          {row("Time", (
            <>
              {ms(t.totalMs)} total
              {typeof t.retrievalMs === "number" && <> · retrieval {ms(t.retrievalMs)}</>}
              {typeof t.synthesisMs === "number" && <> · synthesis {ms(t.synthesisMs)}</>}
              {slower && <span style={{ color: C.text3 }}> — {slower} dominates</span>}
            </>
          ))}
          {data.tokens && row("Tokens", `${data.tokens.input.toLocaleString()} in · ${data.tokens.output.toLocaleString()} out`)}

          {data.trace && data.trace.length > 0 && (
            <div style={{ marginTop: 9, borderTop: `1px solid ${C.line2}`, paddingTop: 8 }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: C.dim, marginBottom: 5 }}>
                Searches it chose
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                {data.trace.map((s, i) => (
                  <li key={i} style={{ fontFamily: FONT.sans, fontSize: 12, color: C.text2, overflowWrap: "anywhere" }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>{s.tool}</span>{" "}
                    {s.input}{" "}
                    <span style={{ color: C.text3 }}>→ {s.got}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
