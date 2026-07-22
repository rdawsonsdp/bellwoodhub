"use client";
/*
 * VoiceSkillCard — THE place to upload your voice (RD 2026-07-22).
 *
 * The voice skill is the foundation of auto-respond: every reply an agent
 * drafts is written in it. One upload here (a skill.md exported from Claude)
 * stores it as kind='voice' and attaches it to EVERY draft-ceiling desk at
 * once — no per-agent plumbing. Re-uploading the same file bumps the version;
 * every upload is audited. Sits at the top of the Agents page, unmissable.
 */
import { useEffect, useState } from "react";
import { C, FONT } from "@/lib/cos-design";

interface SkillRow { skillId: string; name: string; kind: string; version: number; updatedAt: string; chars: number; agents: string[] }

const pretty = (k: string) => k.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function VoiceSkillCard() {
  const [voice, setVoice] = useState<SkillRow | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () =>
    fetch("/api/agents/skills?agent=_voice_")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { skills?: SkillRow[] }) => setVoice((d.skills ?? []).find((s) => s.kind === "voice") ?? null))
      .catch(() => setVoice(null));
  useEffect(() => { void load(); }, []);

  const onFile = (f: File | null) => {
    if (!f) return;
    setBusy(true); setErr(null); setSaved(false);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const content = String(reader.result ?? "");
        const name = f.name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]/g, " ").trim() || "voice";
        const r = await fetch("/api/agents/skills", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "upload", name, content, kind: "voice", attachDrafting: true }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "upload failed");
        setSaved(true);
        await load();
      } catch (e) { setErr(e instanceof Error ? e.message : "upload failed"); }
      finally { setBusy(false); }
    };
    reader.readAsText(f);
  };

  return (
    <div style={{ margin: "18px 0 4px", borderRadius: 15, border: `1px solid ${voice ? "rgba(52,201,139,.4)" : "rgba(231,181,60,.45)"}`, background: voice ? "rgba(52,201,139,.05)" : "rgba(231,181,60,.06)", padding: "15px 17px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* the voice mark */}
        <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={voice ? C.greenText : C.goldHi} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        <span style={{ fontFamily: FONT.serif, fontSize: 16.5, fontWeight: 700, color: C.text }}>Your Voice</span>
        {voice === undefined && <span style={{ fontSize: 12, color: C.dim }}>checking…</span>}
        {voice === null && <span style={{ fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.goldHi, background: "rgba(231,181,60,.16)", padding: "3px 9px", borderRadius: 99 }}>not uploaded</span>}
        {voice && <span style={{ fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.greenText, background: "rgba(52,201,139,.14)", padding: "3px 9px", borderRadius: 99 }}>active · v{voice.version}</span>}
      </div>

      {voice ? (
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.55, marginTop: 8 }}>
          <b style={{ color: C.text }}>{pretty(voice.name)}</b> · {(voice.chars / 1000).toFixed(1)}k chars ·
          {" "}writing for {voice.agents.length} drafting desk{voice.agents.length === 1 ? "" : "s"}
          {voice.agents.length > 0 && <span style={{ color: C.text3 }}> ({voice.agents.map(pretty).join(", ")})</span>}.
          Every reply an agent drafts is written in this voice.
        </div>
      ) : voice === null ? (
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.55, marginTop: 8 }}>
          Upload the voice skill you exported from Claude (a <code style={{ fontFamily: FONT.mono, fontSize: 11.5 }}>.md</code> file).
          It attaches to every drafting desk at once — replies get written the way <i>you</i> write, and auto-respond stays off until you turn it on.
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", borderRadius: 11, padding: "10px 16px", fontWeight: 800, fontSize: 13, fontFamily: FONT.sans, background: voice ? "rgba(var(--ink),.06)" : "linear-gradient(135deg,#F4CB63,#D7991C)", color: voice ? C.text2 : "#0a1322", border: voice ? `1px solid ${C.line}` : "0" }}>
          ⇪ {busy ? "Uploading…" : voice ? "Replace voice (.md)" : "Upload your voice (.md)"}
          <input type="file" accept=".md,.markdown,.txt" style={{ display: "none" }} disabled={busy}
            onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} />
        </label>
        {saved && <span style={{ fontSize: 12.5, fontWeight: 700, color: C.greenText }}>✓ Voice saved and attached — drafts now write as you.</span>}
        {err && <span style={{ fontSize: 12.5, color: C.redText }}>{err}</span>}
      </div>
    </div>
  );
}
