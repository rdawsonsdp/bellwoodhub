"use client";
/*
 * NeedsYouScreen — step 2 of the daily ritual: "decide what needs me."
 *
 * Left: the ranked needs_reply list, each with its templated reason and the
 * three corrections. Right: the important-senders rail — the "people whose mail
 * matters" list the exec edits himself (no developer needed), which feeds the
 * ranking. Awaiting-others and FYI are collapsed below; the point is the short
 * needs_reply list.
 *
 * Reasons are rendered verbatim from the server (templated, never model prose).
 * Corrections apply on the server then we refetch — the read path overlays the
 * correction without re-running the classification pass.
 */
import { useCallback, useEffect, useState } from "react";
import { C, FONT } from "@/lib/cos-design";

interface Item {
  messageId: string; subject: string | null; fromName: string | null; fromEmail: string | null;
  sentAt: string; bucket: string; rank: number | null; score: number; reason: string; correction: string | null;
}
interface View { needsReply: Item[]; awaitingOthers: Item[]; fyi: Item[]; classifiedAt: string | null }
interface Sender { id: string; match: string; label: string; seeded: boolean }

const ago = (iso: string): string => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  return d === 1 ? "yesterday" : `${d} days ago`;
};

export default function NeedsYouScreen({ variant }: { variant: "desktop" | "mobile" }) {
  const mobile = variant === "mobile";
  const [view, setView] = useState<View | null>(null);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [openSection, setOpenSection] = useState<"awaiting" | "fyi" | null>(null);

  const load = useCallback(async () => {
    const [v, s] = await Promise.all([
      fetch("/api/triage").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/triage/senders").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (v) setView(v);
    if (s?.senders) setSenders(s.senders);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const correct = async (messageId: string, correction: string) => {
    await fetch("/api/triage/correct", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId, correction }),
    }).catch(() => {});
    // corrections apply at read time — a refetch reflects them without re-running the pass
    void load();
  };

  const list = view?.needsReply ?? [];

  return (
    <div className="fu" style={{ padding: mobile ? "22px 16px 40px" : "30px 36px 48px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontFamily: FONT.serif, fontSize: mobile ? 27 : 34, fontWeight: 500, color: C.text, letterSpacing: "-.015em", lineHeight: 1 }}>Needs you</div>
        {view && <span style={{ fontSize: 13, color: C.text3 }}>{list.length} waiting on your reply{view.classifiedAt ? ` · sorted ${ago(view.classifiedAt)}` : ""}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 18, lineHeight: 1.5 }}>
        Ranked by who&rsquo;s waiting, what has a deadline, who&rsquo;s followed up, and who they are.
      </div>

      <div style={{ display: "flex", gap: mobile ? 0 : 26, alignItems: "flex-start", flexDirection: mobile ? "column" : "row" }}>
        {/* ── main column: ranked needs_reply ── */}
        <div style={{ flex: 1.7, minWidth: 0, width: mobile ? "100%" : undefined }}>
          {!view && <div style={{ color: C.dim, fontSize: 14 }}>Loading…</div>}
          {view && list.length === 0 && (
            <div style={{ padding: "22px 18px", borderRadius: 14, border: `1px solid ${C.line}`, background: "rgba(52,201,139,.06)", color: C.text2, fontSize: 14, lineHeight: 1.5 }}>
              <b style={{ color: C.text }}>Nothing needs you right now.</b> No one is waiting on a reply.
            </div>
          )}
          <div style={{ display: "grid", gap: 9 }}>
            {list.map((it, i) => (
              <div key={it.messageId} style={{ border: `1px solid ${C.line}`, borderRadius: 13, padding: "13px 15px", background: "rgba(var(--ink),.02)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 12, color: it.correction === "bump_up" ? C.goldHi : C.dim, flexShrink: 0, fontWeight: 700 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{it.subject || "(no subject)"}</div>
                    <div style={{ fontSize: 12.5, color: C.text3, marginTop: 1 }}>{it.fromName || it.fromEmail || "—"}</div>
                    {/* the templated reason — the defensible "why" */}
                    <div style={{ fontSize: 13, color: C.text2, marginTop: 7, lineHeight: 1.5, display: "flex", gap: 7, alignItems: "flex-start" }}>
                      <span style={{ color: C.gold, flexShrink: 0 }}>&#9656;</span>
                      <span>{it.reason}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
                  {[["not_important", "Not important"], ["bump_up", "Bump up"], ["not_waiting_on_me", "Not waiting on me"]].map(([val, label]) => (
                    <button key={val} onClick={() => correct(it.messageId, val)}
                      style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: FONT.sans, padding: "5px 11px", borderRadius: 8, border: `1px solid ${C.line}`, background: it.correction === val ? "rgba(231,181,60,.14)" : "transparent", color: it.correction === val ? C.goldHi : C.text3 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* secondary buckets, collapsed */}
          {view && (
            <div style={{ marginTop: 16 }}>
              <SectionToggle label={`Awaiting others (${view.awaitingOthers.length})`} open={openSection === "awaiting"} onClick={() => setOpenSection(openSection === "awaiting" ? null : "awaiting")} />
              {openSection === "awaiting" && <SecondaryList items={view.awaitingOthers} empty="Nothing outstanding on your side." />}
              <SectionToggle label={`FYI (${view.fyi.length})`} open={openSection === "fyi"} onClick={() => setOpenSection(openSection === "fyi" ? null : "fyi")} />
              {openSection === "fyi" && <SecondaryList items={view.fyi.slice(0, 40)} empty="No informational mail." />}
            </div>
          )}
        </div>

        {/* ── right rail: important senders (exec-editable) ── */}
        <div style={{ flex: 1, minWidth: mobile ? "100%" : 250, width: mobile ? "100%" : undefined, marginTop: mobile ? 24 : 0, position: mobile ? "static" : "sticky", top: 0 }}>
          <SendersRail senders={senders} onChange={load} mobile={mobile} />
        </div>
      </div>
    </div>
  );
}

function SectionToggle({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ cursor: "pointer", background: "none", border: 0, padding: "10px 2px", width: "100%", textAlign: "left", color: C.text3, fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans, display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${C.line2}` }}>
      <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>&rsaquo;</span>
      {label}
    </button>
  );
}

function SecondaryList({ items, empty }: { items: Item[]; empty: string }) {
  if (!items.length) return <div style={{ fontSize: 12.5, color: C.dim, padding: "4px 2px 10px" }}>{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 4, paddingBottom: 8 }}>
      {items.map((it) => (
        <div key={it.messageId} style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: 12.5, color: C.text3, padding: "5px 2px" }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text2 }}>{it.subject || "(no subject)"}</span>
          <span style={{ flexShrink: 0 }}>{it.fromName || it.fromEmail || ""}</span>
        </div>
      ))}
    </div>
  );
}

function SendersRail({ senders, onChange, mobile }: { senders: Sender[]; onChange: () => void; mobile: boolean }) {
  const [label, setLabel] = useState("");
  const [match, setMatch] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!label.trim() || !match.trim()) return;
    setBusy(true);
    await fetch("/api/triage/senders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, match }) }).catch(() => {});
    setLabel(""); setMatch(""); setBusy(false); onChange();
  };
  const remove = async (id: string) => {
    await fetch(`/api/triage/senders?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    onChange();
  };

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 15, background: "rgba(var(--ink),.03)" }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 16, fontWeight: 700, color: C.text }}>People who matter</div>
      <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.5, margin: "3px 0 12px" }}>
        Mail from these people ranks higher. Add or remove anyone — it takes effect on the next sort.
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {senders.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, borderTop: `1px solid ${C.line2}`, paddingTop: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.match}</div>
            </div>
            <button onClick={() => remove(s.id)} aria-label={`Remove ${s.label}`} title="Remove" style={{ cursor: "pointer", flexShrink: 0, background: "none", border: 0, color: C.dim, fontSize: 15, lineHeight: 1, padding: 2 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (e.g. Councilman Welch)"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(var(--ink),.05)", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT.sans }} />
        <input value={match} onChange={(e) => setMatch(e.target.value)} placeholder="Email or @domain"
          onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(var(--ink),.05)", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: FONT.mono }} />
        <button onClick={add} disabled={busy || !label.trim() || !match.trim()}
          style={{ cursor: label.trim() && match.trim() ? "pointer" : "default", border: 0, borderRadius: 9, padding: "9px 12px", fontWeight: 800, fontSize: 12.5, fontFamily: FONT.sans, background: label.trim() && match.trim() ? "linear-gradient(135deg,#F4CB63,#D7991C)" : "rgba(var(--ink),.08)", color: label.trim() && match.trim() ? "#081627" : C.dim }}>
          {busy ? "Adding…" : "Add person"}
        </button>
      </div>
      {!mobile && (
        <div style={{ marginTop: 10, fontFamily: FONT.mono, fontSize: 9.5, color: C.dim, textAlign: "center" }}>
          you can edit this anytime · no developer needed
        </div>
      )}
    </div>
  );
}
