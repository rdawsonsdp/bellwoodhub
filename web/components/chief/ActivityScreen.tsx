"use client";
/*
 * ActivityScreen — the operator's console over app.audit_log (RD 2026-07-05:
 * "I need a log file or console so I can see what's happening"). A read-only,
 * newest-first window onto the append-only ledger every action already writes
 * to: syncs, embed passes, agent runs, drafts, sends, asks, config flips.
 * Auto-refreshes every 30s (pausable). Live builds only — demo says so.
 */
import { useEffect, useState } from "react";
import { C, FONT, card, eyebrow, pill } from "@/lib/cos-design";

interface Row {
  at: string;
  actor: string | null;
  action: string;
  objectType: string | null;
  objectRef: string | null;
  meta: Record<string, string | number | boolean>;
}

const FILTERS: [string, string][] = [
  ["", "All"], ["ingest", "Mail"], ["embed", "Index"], ["sync", "Sync"],
  ["agent", "Agents"], ["draft", "Drafts"], ["ask", "Ask"],
];

const tone = (action: string) =>
  action.startsWith("draft.sent") ? C.green
  : action.startsWith("draft") ? C.purpleText
  : action.startsWith("agent") ? C.gold
  : action.startsWith("ingest") || action.startsWith("sync") || action.startsWith("embed") ? C.blue
  : C.muted;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

export default function ActivityScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [live, setLive] = useState(true);
  const [filter, setFilter] = useState("");
  const [paused, setPaused] = useState(false);

  const load = (f: string) =>
    fetch(`/api/activity?filter=${encodeURIComponent(f)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { live?: boolean; rows?: Row[] }) => { setRows(d.rows ?? []); setLive(d.live !== false); })
      .catch(() => setRows([]));

  useEffect(() => { setRows(null); void load(filter); }, [filter]);
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => void load(filter), 30_000);
    return () => window.clearInterval(t);
  }, [filter, paused]);

  return (
    <div className="fu" style={{ padding: "24px 20px 56px", maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 28, fontWeight: 500, color: C.text }}>Activity</div>
        <span style={{ fontSize: 12.5, color: C.text3 }}>The ledger, live — every action the system takes.</span>
        <button onClick={() => setPaused((p) => !p)} style={{ marginLeft: "auto", cursor: "pointer", background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 99, padding: "5px 13px", color: paused ? C.orangeText : C.text2, fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 700 }}>
          {paused ? "▶ resume" : "❚❚ auto-refresh 30s"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "14px 0" }}>
        {FILTERS.map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{ cursor: "pointer", border: `1px solid ${filter === f ? C.gold : C.line}`, background: filter === f ? "rgba(231,181,60,.14)" : "rgba(var(--ink),.04)", color: filter === f ? C.goldHi : C.text3, borderRadius: 99, padding: "6px 14px", fontFamily: FONT.mono, fontSize: 11, fontWeight: 700 }}>
            {label}
          </button>
        ))}
      </div>

      {!live && <div style={{ ...card, padding: 22, textAlign: "center", color: C.dim, fontSize: 13 }}>Demo mode — the audit ledger exists on live builds only.</div>}
      {live && rows === null && <div style={{ ...card, padding: 22, textAlign: "center", color: C.dim, fontSize: 13 }}>Reading the ledger…</div>}
      {live && rows !== null && rows.length === 0 && <div style={{ ...card, padding: 22, textAlign: "center", color: C.dim, fontSize: 13 }}>Nothing logged yet{filter ? " for this filter" : ""}.</div>}

      {live && rows !== null && rows.length > 0 && (
        <div style={{ ...card, overflow: "hidden" }}>
          {rows.map((r, i) => (
            // readability first (RD 2026-07-05: "we can't read this") —
            // bigger type, real contrast; mono stays only on the verb + time
            <div key={i} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: i < rows.length - 1 ? `1px solid ${C.line2}` : undefined, alignItems: "flex-start" }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: tone(r.action), flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: C.text, fontFamily: FONT.mono, letterSpacing: ".01em" }}>{r.action}</span>
                  {r.objectRef && <span style={{ fontSize: 12.5, color: C.text2, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260, whiteSpace: "nowrap" }}>{r.objectType ? `${r.objectType}: ` : ""}{r.objectRef}</span>}
                  {r.actor && <span style={{ ...pill(C.text2, "rgba(var(--ink),.08)"), fontSize: 11 }}>{r.actor}</span>}
                </div>
                {Object.keys(r.meta).length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12.5, color: C.text3, lineHeight: 1.55, overflowWrap: "anywhere" }}>
                    {Object.entries(r.meta).map(([k, v]) => (
                      <span key={k} style={{ marginRight: 12 }}>
                        <span style={{ color: C.muted }}>{k}</span> <b style={{ color: C.text2, fontWeight: 600 }}>{String(v)}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.muted, flexShrink: 0, marginTop: 3, whiteSpace: "nowrap" }}>{fmt(r.at)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...eyebrow(C.dim2), fontSize: 9, marginTop: 14, textAlign: "center" }}>append-only ledger · nothing here can be edited or deleted, including by operators</div>
    </div>
  );
}
