"use client";
/*
 * UsagePanel — the tiny operator-mode readout of the four adoption numbers
 * that run the weekly session with the Mayor (Phase 5 instrumentation):
 * time-to-first-tap, queue-clear duration, fix-it uses, digest opens per
 * agent. Reads the localStorage ring buffer (lib/usage.ts); live mode reads
 * an events table later.
 */
import { useEffect, useState } from "react";
import { C, FONT, card, eyebrow } from "@/lib/cos-design";
import { readUsage, usageSummary, clearUsage, type UsageSummary } from "@/lib/usage";
import { domainAgentByKey } from "@/lib/domain-agents";

const fmtMs = (ms: number | null) =>
  ms === null ? "—" : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60000).toFixed(1)} min`;

export default function UsagePanel() {
  const [sum, setSum] = useState<UsageSummary | null>(null);
  const refresh = () => setSum(usageSummary(readUsage()));
  useEffect(refresh, []);
  if (!sum) return null;

  const digest = Object.entries(sum.digestOpens).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ ...card, padding: "14px 16px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={eyebrow(C.dim)}>Adoption — this device</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{sum.opens} open{sum.opens === 1 ? "" : "s"}</span>
        <button onClick={() => { clearUsage(); refresh(); }} style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", color: C.blue, fontSize: 11, fontWeight: 700, fontFamily: FONT.sans }}>reset</button>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Stat n={fmtMs(sum.medianFirstTapMs)} label="open → first tap" target="< 5 s" />
        <Stat n={fmtMs(sum.medianQueueClearMs)} label="queue cleared in" target="< 5 min" />
        <Stat n={String(sum.fixitUses)} label="fix-it uses" />
      </div>
      {digest.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
          {digest.map(([k, n]) => (
            <span key={k} style={{ padding: "3px 9px", borderRadius: 99, fontFamily: FONT.mono, fontSize: 10.5, color: C.text2, background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}` }}>
              {(domainAgentByKey(k)?.name ?? k).replace(/ Agent$/, "")} · {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, target }: { n: string; label: string; target?: string }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: FONT.serif, fontSize: 20, color: C.text, lineHeight: 1.1 }}>{n}</span>
      <span style={{ fontSize: 10.5, color: C.muted }}>{label}{target ? <span style={{ color: C.dim }}> · target {target}</span> : null}</span>
    </span>
  );
}
