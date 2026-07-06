"use client";
/*
 * SyncButton — the manual "pull my mail + calendar now" control (RD
 * 2026-07-03). On the pilot this IS the scheduler (Vercel fires crons only
 * on production deployments); everywhere else it's the Mayor's refresh.
 * Spins while the pull runs, then reloads the view so every surface picks
 * up the new rows. Below the button: the live mirrored-mail counter
 * (RD 2026-07-03) — hidden in demo builds where there is nothing to count.
 */
import { useEffect, useState } from "react";
import { C, FONT } from "@/lib/cos-design";
import { IS_LIVE_BUILD } from "@/lib/live";

/** 18197 → "18.2k" — the compact topbar caption must stay narrower than the button. */
const abbr = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n));

export default function SyncButton({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "err">("idle");
  const [count, setCount] = useState<number | null>(null);
  const [indexed, setIndexed] = useState<number | null>(null);

  useEffect(() => {
    if (!IS_LIVE_BUILD) return;
    let live = true;
    fetch("/api/sync")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { messages: number | null; indexed?: number | null }) => {
        if (!live) return;
        if (typeof d.messages === "number") setCount(d.messages);
        if (typeof d.indexed === "number") setIndexed(d.indexed);
      })
      .catch(() => { /* counter is best-effort */ });
    return () => { live = false; };
  }, []);

  async function refreshCount(): Promise<void> {
    try {
      const r = await fetch("/api/sync");
      const d = await r.json();
      if (typeof d.messages === "number") setCount(d.messages);
      if (typeof d.indexed === "number") setIndexed(d.indexed);
    } catch { /* best-effort */ }
  }

  async function run() {
    if (state === "busy") return;
    setState("busy");
    try {
      // auto-continue: each pass walks up to the server's time budget; keep
      // going while the account is mid-backfill OR the search index (ING-4
      // embeddings) still trails the mirror, so ONE press finishes both,
      // the counters climbing between passes (RD 2026-07-03)
      for (let pass = 0; pass < 120; pass++) {
        const r = await fetch("/api/sync", { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "sync failed");
        await refreshCount();
        if (!d.backfillRemaining && !d.embedRemaining) break;
      }
      window.location.reload();
    } catch (err) {
      console.error("[sync]", err instanceof Error ? err.message : err);
      setState("err");
      window.setTimeout(() => setState("idle"), 2500);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <button
        onClick={run}
        aria-label="Sync mail and calendar now"
        title={state === "err" ? "Sync failed — see console" : "Pull mail + calendar now"}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
          height: compact ? 32 : 36, width: compact ? 36 : undefined, padding: compact ? 0 : "0 14px",
          borderRadius: 99, border: `1px solid ${state === "err" ? C.red : C.line}`,
          background: "rgba(var(--ink),.05)", color: state === "err" ? C.redText : C.text2,
          cursor: "pointer", fontFamily: FONT.sans, fontWeight: 700, fontSize: 12.5,
        }}
      >
        <span style={{ display: "inline-flex", animation: state === "busy" ? "cosSpin .8s linear infinite" : undefined }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.3" />
            <path d="M21 3v6h-6" />
          </svg>
        </span>
        {!compact && (state === "busy" ? "Syncing…" : "Sync")}
      </button>
      {count !== null && (
        // compact (mobile topbar): abbreviated so the caption can never widen
        // the button column and squeeze the title (RD screenshot 2026-07-05)
        <span style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim, lineHeight: 1, whiteSpace: "nowrap", maxWidth: compact ? 64 : undefined, overflow: "hidden", textOverflow: "ellipsis" }}>
          {compact
            ? `${abbr(count)}${indexed !== null ? ` · ${abbr(indexed)}` : ""}`
            : `${count.toLocaleString()} synced${indexed !== null ? ` · ${indexed.toLocaleString()} searchable` : ""}`}
        </span>
      )}
    </span>
  );
}
