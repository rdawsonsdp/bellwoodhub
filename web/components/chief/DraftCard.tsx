"use client";
/*
 * DraftCard — an agent-drafted reply the Mayor can EDIT, save, then approve.
 * R3 posture: nothing sends on its own; the Mayor edits → saves → approves.
 * Shared by the Today "To sign" section, the mobile Emails "Agent Answered"
 * tab, and the desktop Approvals screen so the behaviour is identical.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { C, FONT } from "@/lib/cos-design";
import type { DraftRow } from "@/lib/screens";

async function post(url: string, body: unknown) {
  try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.ok ? await r.json() : null; } catch { return null; }
}

export default function DraftCard({ draft, onReload }: { draft: DraftRow; onReload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");
  const [busy, setBusy] = useState(false);
  // re-sync from the server copy when not actively editing
  useEffect(() => { if (!editing) { setSubject(draft.subject ?? ""); setBody(draft.body ?? ""); } }, [draft.draftId, draft.subject, draft.body, editing]);

  const dirty = subject !== (draft.subject ?? "") || body !== (draft.body ?? "");

  async function decide(action: "approve" | "discard") {
    setBusy(true);
    await post("/api/approvals", { action, draftId: draft.draftId });
    onReload();
  }
  async function save() {
    setBusy(true);
    await post("/api/approvals", { action: "save", draftId: draft.draftId, subject, body });
    setBusy(false); setEditing(false); onReload();
  }
  function cancel() { setSubject(draft.subject ?? ""); setBody(draft.body ?? ""); setEditing(false); }

  const inputStyle: CSSProperties = { width: "100%", borderRadius: 9, border: `1px solid ${C.cardBd}`, background: "rgba(var(--ink),.06)", color: C.text, fontFamily: FONT.sans, padding: "9px 11px", fontSize: 13.5, outline: "none", boxSizing: "border-box" };
  const solid = (bg: string, color: string): CSSProperties => ({ flex: 1, cursor: "pointer", padding: 9, borderRadius: 9, border: 0, background: bg, color, fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans, opacity: busy ? 0.6 : 1 });
  const ghost: CSSProperties = { flex: 1, cursor: "pointer", padding: 9, borderRadius: 9, border: `1px solid ${C.cardBd}`, background: "rgba(var(--ink),.05)", color: C.text2, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, opacity: busy ? 0.6 : 1 };

  return (
    <div style={{ background: "linear-gradient(180deg,rgba(var(--ink),.05),rgba(var(--ink),.018))", border: `1px solid ${C.cardBd}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>To · {draft.recipients}</span>
        {!editing && <button onClick={() => setEditing(true)} style={{ cursor: "pointer", border: `1px solid ${C.cardBd}`, background: "rgba(var(--ink),.05)", color: C.text3, borderRadius: 7, fontSize: 11.5, fontWeight: 700, padding: "3px 10px", fontFamily: FONT.sans }}>✎ Edit</button>}
        <span style={tag(C.purpleText)}>{editing ? "editing" : "draft"}</span>
      </div>

      {editing
        ? <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...inputStyle, marginTop: 9, fontWeight: 600 }} placeholder="Subject" />
        : <div style={{ fontSize: 13.5, color: C.text2, marginTop: 4 }}>{subject}</div>}

      {editing
        ? <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ ...inputStyle, marginTop: 8, minHeight: 150, lineHeight: 1.55, resize: "vertical" }} placeholder="Message" />
        : <div style={{ fontSize: 12.5, color: C.muted, marginTop: 5, lineHeight: 1.5, maxHeight: 60, overflow: "hidden", whiteSpace: "pre-wrap" }}>{body}</div>}

      <div style={{ display: "flex", gap: 9, marginTop: 11 }}>
        {editing ? (<>
          <button disabled={busy} onClick={cancel} style={ghost}>Cancel</button>
          <button disabled={busy} onClick={save} style={solid(C.gold, "#081627")}>{dirty ? "Save changes" : "Done"}</button>
        </>) : (<>
          <button disabled={busy} onClick={() => decide("discard")} style={ghost}>Discard</button>
          <button disabled={busy} onClick={() => decide("approve")} style={solid(C.green, "#062418")}>Approve &amp; send</button>
        </>)}
      </div>
      <div style={{ fontSize: 10.5, color: C.dim, marginTop: 8, fontFamily: FONT.mono }}>drafted by the Drafting Agent · R3 · {editing ? "edit, then save before you approve" : "never auto-sent"}</div>
    </div>
  );
}

function tag(color: string): CSSProperties {
  return { display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, fontFamily: FONT.mono, color, background: "rgba(var(--ink),.08)", whiteSpace: "nowrap", flexShrink: 0 };
}
