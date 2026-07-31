"use client";
/*
 * NotesScreen — the notes destination (RD 2026-07-31). Until now notes could
 * only be CREATED (the top-bar pencil, a voice utterance routed as a note) and
 * glimpsed as a count on the dashboard; there was nowhere to read them back.
 *
 * Capture works exactly like NoteButton so there is one contract, not two:
 * type or hold-to-talk, transcription is CLEANED into a title + body by the
 * server, and nothing is stored until you press Keep. Confirm-first matters for
 * voice — a mis-transcription that silently persists is worse than no note.
 *
 * Notes live in app.cos_notes via /api/cos-notes. An "export to an external
 * tool" step is deliberately NOT built in yet — see the note on `source` below.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { C, FONT, card } from "@/lib/cos-design";

interface Note {
  id: string; title: string; body: string;
  source: string; status: string; createdAt: string; stale: boolean;
}

const audioExt = (mime: string) =>
  mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";

const when = (iso: string) => {
  const d = new Date(iso), now = Date.now();
  const days = Math.floor((now - d.getTime()) / 864e5);
  if (days === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function NotesScreen({ seed }: { seed?: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [typed, setTyped] = useState(seed ?? "");
  const [rec, setRec] = useState<"idle" | "rec" | "busy">("idle");
  const [prepared, setPrepared] = useState<{ title: string; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/cos-notes?status=all");
      const d = r.ok ? await r.json() : { notes: [] };
      setNotes(d.notes ?? []);
    } catch { setNotes([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /** Server turns raw text into a clean title + body. Nothing is saved yet. */
  async function prepare(text: string) {
    const t = text.trim(); if (!t) return;
    setErr(null);
    try {
      const r = await fetch("/api/cos-notes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: t }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't prepare that note");
      setPrepared({ title: d.title ?? t.slice(0, 60), body: d.body ?? t });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't prepare that note"); }
  }

  async function keep() {
    if (!prepared) return;
    try {
      const r = await fetch("/api/cos-notes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: prepared.title, body: prepared.body, source: "notes" }),
      });
      if (!r.ok) throw new Error("Couldn't save");
      setPrepared(null); setTyped(""); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); }
  }

  async function done(id: string) {
    setNotes((n) => (n ?? []).map((x) => (x.id === id ? { ...x, status: "done" } : x)));
    await fetch("/api/cos-notes", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: "done" }),
    }).catch(() => {});
  }

  // Hold-to-talk. iOS Safari emits audio/mp4, not webm — the upload filename
  // extension is taken from the REAL mime type or transcription rejects it.
  async function micToggle() {
    if (rec === "rec") { mrRef.current?.stop(); return; }
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
          if (blob.size < 1600) { setErr("Didn't catch any speech — hold the button while you talk."); return; }
          const fd = new FormData();
          fd.append("audio", blob, `speech.${audioExt(type)}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          const d = await r.json().catch(() => ({} as { text?: string }));
          if (d.text?.trim()) await prepare(d.text); else setErr("Didn't catch that — try again.");
        } finally { setRec("idle"); }
      };
      mrRef.current = mr; mr.start(); setRec("rec");
    } catch { setErr("Microphone unavailable — type the note instead."); }
  }
  useEffect(() => () => { try { if (mrRef.current?.state === "recording") mrRef.current.stop(); } catch { /* released */ } }, []);

  const open = (notes ?? []).filter((n) => n.status !== "done");
  const closed = (notes ?? []).filter((n) => n.status === "done");

  return (
    <div style={{ padding: "4px 16px 20px" }}>
      {/* ── capture ── */}
      <div style={{ ...card, padding: 13, marginBottom: 16 }}>
        {prepared ? (
          <>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim, marginBottom: 7 }}>Keep this note?</div>
            <div style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 700, color: C.text, overflowWrap: "anywhere" }}>{prepared.title}</div>
            <div style={{ fontFamily: FONT.sans, fontSize: 13, color: C.text2, marginTop: 4, lineHeight: 1.5, overflowWrap: "anywhere" }}>{prepared.body}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={keep} style={{ padding: "9px 16px", borderRadius: 999, border: 0, background: C.gold, color: "#081627", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Keep</button>
              <button onClick={() => setPrepared(null)} style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${C.line}`, background: "transparent", color: C.text3, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Discard</button>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={(e) => { e.preventDefault(); void prepare(typed); }} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={typed} onChange={(e) => setTyped(e.target.value)}
                placeholder="Write a note…"
                style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", fontSize: 16, color: C.text, fontFamily: FONT.sans }}
              />
              <button type="submit" disabled={!typed.trim()} style={{ padding: "8px 15px", borderRadius: 999, border: 0, background: typed.trim() ? C.gold : "rgba(var(--ink),.10)", color: typed.trim() ? "#081627" : C.dim, fontWeight: 700, fontSize: 13.5, cursor: typed.trim() ? "pointer" : "default" }}>Add</button>
            </form>
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); if (rec === "idle") void micToggle(); }}
              onPointerUp={() => { if (rec === "rec") void micToggle(); }}
              onPointerCancel={() => { if (rec === "rec") void micToggle(); }}
              onPointerLeave={() => { if (rec === "rec") void micToggle(); }}
              onContextMenu={(e) => e.preventDefault()}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", marginTop: 10, padding: "13px 14px", borderRadius: 12, border: 0, cursor: "pointer", touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none", fontFamily: FONT.sans, fontWeight: 800, fontSize: 14.5, color: rec === "rec" ? "#fff" : "#0a1322", background: rec === "rec" ? "linear-gradient(135deg,#e8574a,#c23a2e)" : "linear-gradient(135deg,#F4CB63,#D7991C)" }}
            >
              {rec === "rec" ? "Listening — release to save" : rec === "busy" ? "Transcribing…" : "Hold to talk"}
            </button>
          </>
        )}
        {err && <div style={{ marginTop: 9, fontFamily: FONT.sans, fontSize: 12.5, color: C.red ?? "#c53030" }}>{err}</div>}
      </div>

      {/* ── the notes ── */}
      {notes === null ? null : open.length === 0 && closed.length === 0 ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 13, color: C.dim, lineHeight: 1.55 }}>
          No notes yet. Type one above, or hold the button and say it.
        </div>
      ) : (
        <>
          <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", marginBottom: 9 }}>
            Open · {open.length}
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            {open.map((n) => (
              <div key={n.id} style={{ ...card, padding: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <button onClick={() => done(n.id)} aria-label={`Mark "${n.title}" done`} title="Mark done"
                  style={{ width: 19, height: 19, borderRadius: 999, border: `1.7px solid ${C.gold}`, background: "transparent", cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: FONT.sans, fontSize: 14.5, fontWeight: 700, color: C.text, overflowWrap: "anywhere" }}>{n.title}</div>
                  {n.body && n.body !== n.title && (
                    <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: C.text2, marginTop: 3, lineHeight: 1.5, overflowWrap: "anywhere" }}>{n.body}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{when(n.createdAt)}</span>
                    {n.stale && <span style={{ fontFamily: FONT.sans, fontSize: 9.5, fontWeight: 800, color: "#c53030" }}>STILL OPEN</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {closed.length > 0 && (
            <>
              <button onClick={() => setShowDone((v) => !v)}
                style={{ marginTop: 16, background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase" }}>
                Done · {closed.length} {showDone ? "▾" : "▸"}
              </button>
              {showDone && (
                <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                  {closed.map((n) => (
                    <div key={n.id} style={{ ...card, padding: 11, opacity: 0.62 }}>
                      <div style={{ fontFamily: FONT.sans, fontSize: 13.5, color: C.text2, textDecoration: "line-through", overflowWrap: "anywhere" }}>{n.title}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
