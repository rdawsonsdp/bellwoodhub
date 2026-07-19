"use client";
/*
 * Searching — the waiting state for an Ask.
 *
 * A graph-augmented answer takes several seconds: three retrieval passes, a
 * fusion step, then synthesis. "Searching the archive…" for eight seconds reads
 * as a hang, and the user starts wondering whether it broke instead of what
 * they'll do with the answer.
 *
 * Two things fix that, and neither is a fake progress bar:
 *
 *   SCALE — "Looking through 3,399 emails" tells the user WHY it takes a
 *   moment, and quietly makes the point that this is not an inbox search. The
 *   count is real (the indexed corpus size), never invented.
 *
 *   TRUTHFUL STAGES — the labels below map to passes that actually run in
 *   lib/planner.ts: structured/graph/semantic → RRF fuse → Claude synthesis.
 *   They advance on a timer rather than server events, so they are honest about
 *   ORDER but approximate about timing — which is why the last stage stays put
 *   however long synthesis takes, instead of cycling and implying progress that
 *   isn't being measured.
 *
 * No percentage. We cannot measure completion, and a bar that fills on a timer
 * is a lie the user eventually catches.
 */
import { useEffect, useRef, useState } from "react";
import { C, FONT } from "@/lib/cos-design";

/** Maps to the real pipeline: 3 passes → fuse → synthesize. */
const STAGES: { at: number; label: (n: string | null) => string }[] = [
  { at: 0, label: (n) => (n ? `Looking through ${n} emails and documents` : "Looking through the record") },
  { at: 1400, label: () => "Finding the records that match" },
  { at: 3200, label: () => "Checking what connects to what" },
  { at: 5200, label: () => "Reading the ones that matter" },
  { at: 7400, label: () => "Writing your answer" },
];

export default function Searching({ size = 17 }: { size?: number }) {
  const [stage, setStage] = useState(0);
  const [count, setCount] = useState<string | null>(null);
  const started = useRef(Date.now());

  // Corpus size for the opening line. `totals=0` skips the live provider asks —
  // this is a loading state, it must never wait on Gmail.
  useEffect(() => {
    let alive = true;
    fetch("/api/sync/status?totals=0")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const n = j?.index?.indexed ?? j?.index?.messages;
        if (alive && typeof n === "number" && n > 0) setCount(n.toLocaleString());
      })
      .catch(() => {/* no count is fine — the generic line still reads well */});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      const ms = Date.now() - started.current;
      let i = 0;
      for (let s = 0; s < STAGES.length; s++) if (ms >= STAGES[s].at) i = s;
      setStage(i);
    }, 300);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div style={{ padding: "4px 0 8px" }} role="status" aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
        {/* the one moving part: a slow sweep, not a spinner racing the user */}
        <span
          aria-hidden
          style={{
            width: 15, height: 15, borderRadius: 99, flexShrink: 0,
            border: `2px solid ${C.gold}`, borderTopColor: "transparent",
            animation: "cosSpin 1s linear infinite",
          }}
        />
        <span style={{ fontFamily: FONT.serif, fontSize: size + 3, color: C.text2 }}>
          {STAGES[stage].label(count)}
          <span style={{ animation: "pulseDot 1.1s infinite" }}>…</span>
        </span>
      </div>

      {/* Indeterminate sweep. Deliberately NOT a percentage — nothing here is
          measured, and a timer-driven bar is a promise the answer may not keep. */}
      <div
        aria-hidden
        style={{
          marginTop: 13, height: 3, borderRadius: 99, maxWidth: 340,
          background: "rgba(var(--ink),.07)", overflow: "hidden", position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute", inset: 0, width: "38%", borderRadius: 99,
            background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`,
            animation: "askSweep 1.5s ease-in-out infinite",
          }}
        />
      </div>

      {count && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.text3, fontFamily: FONT.sans }}>
          Every answer is built from your own records and cites them.
        </div>
      )}
    </div>
  );
}
