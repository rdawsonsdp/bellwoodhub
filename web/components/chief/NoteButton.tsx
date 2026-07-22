"use client";
/*
 * NoteButton — the pencil in the top bar (FEAT-36, RD 2026-07-21): an explicit
 * way to leave the Chief of Staff a note, OUTSIDE the Ask box. Tapping the
 * pencil means "this is a note" — no note-vs-question classifier, straight to
 * the cleaner. Voice-first (hold to talk), typing as the fallback; confirm-first
 * (nothing saves until Keep). Same /api/cos-notes contract as the smart route.
 */
import { useRef, useState } from "react";
import { C, FONT } from "@/lib/cos-design";

const audioExt = (mime: string): string => {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4"; // iOS Safari
  if (mime.includes("ogg")) return "ogg";
  return "webm";
};

export default function NoteButton({ variant }: { variant: "desktop" | "mobile" }) {
  const mobile = variant === "mobile";
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [rec, setRec] = useState<"idle" | "rec" | "busy">("idle");
  const [prepared, setPrepared] = useState<{ title: string; body: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const reset = () => { setTyped(""); setPrepared(null); setSaved(false); setErr(null); setRec("idle"); };

  /** clean any captured text into a staff item (pencil = always a note) */
  async function prepare(text: string) {
    const t = text.trim(); if (!t) return;
    setErr(null); setRec("busy");
    try {
      const r = await fetch("/api/cos-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: t }) });
      const p = (await r.json().catch(() => null)) as { title?: string; body?: string } | null;
      // kind is ignored on purpose — the pencil already declared intent
      if (r.ok && p?.body) { setPrepared({ title: p.title || p.body, body: p.body }); return; }
      setErr("Couldn't process that — try again.");
    } catch { setErr("Couldn't reach the Chief of Staff — check your connection."); }
    finally { setRec("idle"); }
  }

  async function keep() {
    const n = prepared; if (!n) return;
    setPrepared(null);
    const r = await fetch("/api/cos-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: n.title, body: n.body, source: typed ? "text" : "voice" }) }).catch(() => null);
    if (r?.ok) { setSaved(true); setTyped(""); setTimeout(() => { setOpen(false); reset(); }, 1600); }
    else setErr("Couldn't save the note — try again.");
  }

  async function mic() {
    if (rec === "rec") { mrRef.current?.stop(); return; }
    if (rec !== "idle") return;
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec("busy");
        try {
          const type = mr.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          if (blob.size < 1600) { setErr("Didn't catch any speech — hold, speak, release."); setRec("idle"); return; }
          const fd = new FormData();
          fd.append("audio", blob, `note.${audioExt(type)}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          const d = (await r.json().catch(() => ({}))) as { text?: string };
          if (r.ok && d.text) { await prepare(d.text); return; }
          setErr("Couldn't hear that — try again."); setRec("idle");
        } catch { setErr("Voice capture failed."); setRec("idle"); }
      };
      mr.start(); mrRef.current = mr; setRec("rec");
    } catch { setErr("Microphone access was blocked."); }
  }

  const btn = (
    <button
      onClick={() => { if (open) { setOpen(false); reset(); } else setOpen(true); }}
      aria-label="Leave a note for your Chief of Staff" title="Leave a note"
      style={{ width: mobile ? 33 : 36, height: mobile ? 33 : 36, borderRadius: 99, border: `1px solid ${open ? C.gold : C.line}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: open ? C.gold : C.text2, background: open ? "rgba(231,181,60,.14)" : "rgba(var(--ink),.06)" }}
    >
      {/* pencil */}
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
      </svg>
    </button>
  );

  const panel = open && (
    <div style={mobile
      ? { position: "fixed", left: 10, right: 10, top: "calc(env(safe-area-inset-top) + 58px)", zIndex: 80, background: "var(--c-appbg)", border: `1px solid ${C.line}`, borderRadius: 15, padding: "14px 15px", boxShadow: "0 16px 40px rgba(10,15,30,.35)" }
      : { position: "absolute", top: "calc(100% + 8px)", right: 0, width: 360, zIndex: 80, background: "var(--c-appbg)", border: `1px solid ${C.line}`, borderRadius: 15, padding: "14px 15px", boxShadow: "0 16px 40px rgba(10,15,30,.3)" }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.gold, marginBottom: 9 }}>Note to your Chief of Staff</div>

      {saved ? (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 2px", color: C.greenText, fontSize: 13.5, fontWeight: 700, fontFamily: FONT.sans }}>
          ✓ Noted — it&rsquo;ll be in your briefing.
        </div>
      ) : prepared ? (
        <>
          <div style={{ fontFamily: FONT.serif, fontSize: 16, fontWeight: 700, lineHeight: 1.25, color: C.text }}>{prepared.title}</div>
          {prepared.body !== prepared.title && <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5, marginTop: 4 }}>{prepared.body}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => void keep()} style={{ flex: 1, cursor: "pointer", border: 0, borderRadius: 10, padding: "11px 14px", fontWeight: 800, fontSize: 13.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}>✓ Keep it</button>
            <button onClick={() => setPrepared(null)} style={{ cursor: "pointer", borderRadius: 10, padding: "11px 13px", fontWeight: 700, fontSize: 12.5, fontFamily: FONT.sans, border: `1px solid ${C.line}`, background: "transparent", color: C.muted }}>✕</button>
          </div>
        </>
      ) : (
        <>
          {/* voice-first: hold to talk */}
          <button
            onPointerDown={(e) => { e.preventDefault(); if (rec === "idle") void mic(); }}
            onPointerUp={() => { if (rec === "rec") void mic(); }}
            onPointerCancel={() => { if (rec === "rec") void mic(); }}
            onContextMenu={(e) => e.preventDefault()}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", padding: "13px 12px", borderRadius: 12, border: 0, cursor: "pointer", touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none", fontFamily: FONT.sans, fontWeight: 800, fontSize: 14, color: rec === "rec" ? "#fff" : "#0a1322", background: rec === "rec" ? "linear-gradient(135deg,#e8574a,#c23a2e)" : "linear-gradient(135deg,#F4CB63,#D7991C)", animation: rec === "rec" ? "cosPulse 1.1s infinite" : undefined }}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            {rec === "rec" ? "Listening — release when done" : rec === "busy" ? "One moment…" : "Hold to talk"}
          </button>
          {/* typing fallback */}
          <form onSubmit={(e) => { e.preventDefault(); void prepare(typed); }} style={{ display: "flex", gap: 7, marginTop: 9 }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type it"
              style={{ flex: 1, minWidth: 0, background: "rgba(var(--ink),.05)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", outline: "none", fontSize: 13.5, color: C.text, fontFamily: FONT.sans }} />
            <button type="submit" disabled={!typed.trim() || rec === "busy"} style={{ cursor: typed.trim() ? "pointer" : "default", border: 0, borderRadius: 10, padding: "9px 14px", fontWeight: 800, fontSize: 13, fontFamily: FONT.sans, background: typed.trim() ? "rgba(231,181,60,.9)" : "rgba(var(--ink),.08)", color: typed.trim() ? "#0a1322" : C.dim }}>→</button>
          </form>
        </>
      )}
      {err && <div style={{ marginTop: 9, fontSize: 12, color: C.redText }}>{err}</div>}
    </div>
  );

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {btn}
      {panel}
    </div>
  );
}
