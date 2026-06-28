"use client";
/*
 * FeedbackButton — a footer button (bottom-right) that opens a quick note dialog
 * the Mayor can TYPE or SPEAK into freely. The note posts to /api/feedback, which
 * logs it as a tracked issue and returns a link to the project portal. Voice reuses
 * the same MediaRecorder → /api/transcribe (Whisper) pipeline as the Ask mic.
 */
import { useRef, useState } from "react";
import { C, FONT } from "@/lib/cos-design";

/** Filename ext must match the real MIME (iOS Safari records audio/mp4, not webm). */
function audioExt(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mpga")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

const BUBBLE = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";
const MIC = "M9 2h6v12a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3";
const CLOSE = "M18 6 6 18M6 6l12 12";

function Ic({ d, w = 20, sw = 1.9 }: { d: string; w?: number; sw?: number }) {
  return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d.split("M").filter(Boolean).map((p, i) => <path key={i} d={"M" + p} />)}</svg>;
}

export default function FeedbackButton({ raised }: { raised?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Send feedback to the team" title="Send a quick note"
        style={{ position: "fixed", right: "max(16px, env(safe-area-inset-right))", bottom: raised ? "calc(env(safe-area-inset-bottom) + 90px)" : "calc(env(safe-area-inset-bottom) + 18px)", zIndex: 45,
          width: 46, height: 46, borderRadius: 99, border: `1px solid ${C.cardBd}`, background: "var(--c-appbg)", color: C.text2,
          boxShadow: "0 6px 18px rgba(0,0,0,.22)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Ic d={BUBBLE} w={20} />
      </button>
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [rec, setRec] = useState<"idle" | "rec" | "busy">("idle");
  const [sent, setSent] = useState<{ id: string; url: string; kind?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function mic() {
    if (rec === "rec") { recRef.current?.stop(); return; }
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRec("busy");
        try {
          const type = mr.mimeType || "audio/webm";
          const blob = new Blob(chunks.current, { type });
          if (blob.size < 1600) { setErr("Didn't catch any speech — tap the mic, speak, then tap again to stop."); return; }
          const fd = new FormData(); fd.append("audio", blob, `note.${audioExt(type)}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          const d = await r.json().catch(() => ({} as { text?: string; error?: string; empty?: boolean }));
          if (r.ok && d.text) setText((t) => (t ? t.trim() + " " : "") + d.text);
          else setErr(d.empty ? "Didn't catch any speech — speak, then tap the mic to stop." : d.error || "Couldn't hear that — try again.");
        } catch { setErr("Voice capture failed — check your connection."); }
        finally { setRec((s) => (s === "busy" ? "idle" : s)); }
      };
      mr.start(); recRef.current = mr; setRec("rec");
    } catch { setErr("Microphone access was blocked."); setRec("idle"); }
  }

  async function send() {
    const body = text.trim(); if (!body) return;
    setSending(true); setErr(null);
    try {
      const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body, page: typeof location !== "undefined" ? location.pathname : "" }) });
      const d = await r.json().catch(() => ({} as { ok?: boolean; id?: string; url?: string; kind?: string; error?: string }));
      if (r.ok && d.ok && d.id && d.url) setSent({ id: d.id, url: d.url, kind: d.kind });
      else setErr(d.error || "Couldn't send — try again.");
    } catch { setErr("Couldn't send — check your connection."); }
    finally { setSending(false); }
  }

  const status = rec === "rec" ? "Listening… tap the mic to stop" : rec === "busy" ? "Transcribing…" : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "var(--c-appbg)", borderRadius: "18px 18px 0 0", border: `1px solid ${C.cardBd}`, padding: "18px 18px calc(env(safe-area-inset-bottom) + 18px)", animation: "sheetUp .2s ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: C.gold }}><Ic d={BUBBLE} w={20} /></span>
          <div style={{ flex: 1, fontFamily: FONT.serif, fontSize: 18, fontWeight: 600, color: C.text }}>Quick note to the team</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `1px solid ${C.cardBd}`, background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Ic d={CLOSE} w={16} /></button>
        </div>

        {sent ? (
          <div style={{ padding: "8px 2px 4px" }}>
            <div style={{ fontSize: 15, color: C.text, fontWeight: 600 }}>Sent to the Chief of Staff team ✓</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>{sent.kind === "issue" ? <>Opened as a tracked issue (<b style={{ color: C.text2 }}>{sent.id}</b>) for the dev team.</> : <>Logged as <b style={{ color: C.text2 }}>{sent.id}</b> — the dev team will see it in the project portal.</>}</div>
            <a href={sent.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 12, color: C.blue, fontSize: 13.5, fontWeight: 700 }}>{sent.kind === "issue" ? "View the issue →" : "Open the project portal →"}</a>
            <div style={{ marginTop: 16 }}><button onClick={onClose} style={{ width: "100%", padding: 11, borderRadius: 11, border: 0, background: C.gold, color: "#081627", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: FONT.sans }}>Done</button></div>
          </div>
        ) : (<>
          <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>Type or <b style={{ color: C.text2 }}>talk freely</b> — tell us what's working, what's broken, or what you'd like next. It goes to the team as a tracked issue.</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="What's on your mind, Mayor?" rows={5}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.cardBd}`, background: "rgba(var(--ink),.05)", color: C.text, fontFamily: FONT.sans, fontSize: 15, padding: "11px 13px", lineHeight: 1.5, outline: "none", resize: "vertical" }} />
          {status && <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "10px", borderRadius: 11, fontSize: 13, fontWeight: 700, background: rec === "rec" ? "rgba(255,107,94,.12)" : "rgba(231,181,60,.12)", color: rec === "rec" ? C.red : C.gold, border: `1px solid ${rec === "rec" ? "rgba(255,107,94,.4)" : "rgba(231,181,60,.4)"}`, animation: "bwPulse 1.2s ease-in-out infinite" }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "currentColor" }} />{status}</div>}
          {err && <div style={{ marginTop: 10, padding: "10px 13px", borderRadius: 11, background: "rgba(255,107,94,.1)", border: "1px solid rgba(255,107,94,.35)", color: C.red, fontSize: 13, fontWeight: 600 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button onClick={mic} aria-label="Record a voice note" title="Talk freely" style={{ width: 46, height: 46, borderRadius: 99, border: 0, flexShrink: 0, background: rec === "rec" ? "rgba(255,107,94,.18)" : "rgba(231,181,60,.16)", color: rec === "rec" ? C.red : C.gold, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: rec === "rec" ? "cosPulse 1.1s infinite" : undefined }}>
              {rec === "busy" ? <span style={{ display: "inline-flex", animation: "cosSpin .8s linear infinite" }}><Ic d="M21 12a9 9 0 0 0-9-9" w={18} /></span> : <Ic d={MIC} w={18} />}
            </button>
            <button onClick={send} disabled={sending || !text.trim()} style={{ flex: 1, padding: 12, borderRadius: 11, border: 0, background: !text.trim() ? "rgba(231,181,60,.5)" : C.gold, color: "#081627", fontWeight: 700, fontSize: 15, cursor: text.trim() ? "pointer" : "default", fontFamily: FONT.sans, opacity: sending ? 0.7 : 1 }}>{sending ? "Sending…" : "Send to the team"}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}
