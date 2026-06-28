"use client";
/*
 * AdminPanel.tsx — the operator/admin console for the Chief of Staff platform.
 * Five sections: Models · API Cost · Agent Rules · Skills · Sources. Demo-grade
 * interactive: reads the real config defaults (lib/admin-config.ts) and persists
 * operator overrides to localStorage. It does NOT rewrite server config — safe
 * for the live demo. (R3 posture: nothing here sends or acts on its own.)
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { C, FONT, card, eyebrow, pill } from "@/lib/cos-design";
import {
  MODEL_OPTIONS, ROUTER_DEFAULT, PIPELINE_MODELS, CAPABILITIES, AUTONOMY_LADDER,
  SOURCES_DEFAULT, COST_MODEL, type SourceDef,
} from "@/lib/admin-config";
import { COS_PERSONA_DEFAULT, COS_TONE_PRESETS, type CosPersona, type CosTone } from "@/lib/morning";

type Section = "appearance" | "cos" | "models" | "cost" | "rules" | "skills" | "sources" | "status";

// Temporary: link to the live PM status dashboard (its own Vercel project).
// Remove this tab once the project ships — it's a build-time convenience, not a product feature.
const PROJECT_STATUS_URL = "https://project-status-ten.vercel.app";

const THEMES = [
  { id: "midnight", name: "Midnight", desc: "The original deep navy — maximum focus.", sw: ["#070b12", "#102139", "#e7b53c", "#eaf1fa"] },
  { id: "dim", name: "Dim", desc: "Softer slate, brighter text. Easy on the eyes.", sw: ["#141a24", "#27384f", "#ecbe4c", "#f3f7fc"], rec: true },
  { id: "daylight", name: "Daylight", desc: "Light scheme, dark text. Best in bright rooms & on mobile.", sw: ["#eef2f8", "#ffffff", "#a9750c", "#18212f"] },
  { id: "contrast", name: "High contrast", desc: "Pure black & white — accessibility-first.", sw: ["#000000", "#1a1a1a", "#ffcb47", "#ffffff"] },
];

interface AdminState {
  router: Record<string, string>;
  answerModel: string;
  notes: Record<string, string>;
  skillsOff: string[];
  sources: Record<string, { enabled: boolean; schedule: string }>;
  extraSources: SourceDef[];
  cos: CosPersona;
}
const DEFAULT_STATE: AdminState = {
  router: Object.fromEntries(ROUTER_DEFAULT.map((r) => [r.task, r.model])),
  answerModel: "gpt-4o-mini",
  notes: {},
  skillsOff: [],
  sources: {},
  extraSources: [],
  cos: COS_PERSONA_DEFAULT,
};
const KEY = "bw-admin-config-v1";

function load(): AdminState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
  } catch { return DEFAULT_STATE; }
}

const modelLabel = (id: string) => MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id;

export default function AdminPanel() {
  const [section, setSection] = useState<Section>("models");
  const [st, setSt] = useState<AdminState>(DEFAULT_STATE);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setSt(load()); }, []);
  function update(next: Partial<AdminState>) {
    setSt((cur) => {
      const merged = { ...cur, ...next };
      try { window.localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }
  function reset() {
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
    setSt(DEFAULT_STATE);
  }

  const tabs: [Section, string][] = [
    ["appearance", "Appearance"], ["cos", "Chief of Staff"], ["models", "Models"], ["cost", "API Cost"],
    ["rules", "Agent Rules"], ["skills", "Skills"], ["sources", "Sources"],
    ["status", "Project Status"],
  ];

  return (
    <div className="fu" style={{ padding: "30px 36px 56px", maxWidth: 1180 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div style={eyebrow(C.dim)}>Admin · Operator console</div>
          <div style={{ fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, color: C.text, lineHeight: 1.05, marginTop: 6 }}>System configuration</div>
          <div style={{ fontSize: 13.5, color: C.text3, marginTop: 5 }}>Models, cost, autonomy rules, skills, and sources. Changes persist locally; they don&rsquo;t alter server config.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saved && <span style={{ ...pill(C.greenText, "rgba(52,201,139,.14)") }}>saved ✓</span>}
          <button onClick={reset} style={ghostBtn}>Reset to defaults</button>
        </div>
      </div>

      {/* sub-nav */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {tabs.map(([k, label]) => {
          const on = section === k;
          return (
            <button key={k} onClick={() => setSection(k)} style={{
              cursor: "pointer", padding: "9px 17px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans,
              background: on ? C.gold : "transparent", color: on ? "#081627" : C.text3,
              border: `1px solid ${on ? C.gold : "rgba(var(--ink),.14)"}`,
            }}>{label}</button>
          );
        })}
      </div>

      {section === "appearance" && <Appearance />}
      {section === "cos" && <ChiefOfStaff st={st} update={update} />}
      {section === "models" && <Models st={st} update={update} />}
      {section === "cost" && <Cost st={st} />}
      {section === "rules" && <Rules st={st} update={update} />}
      {section === "skills" && <Skills st={st} update={update} />}
      {section === "sources" && <Sources st={st} update={update} />}
      {section === "status" && <ProjectStatus />}
    </div>
  );
}

/* ───────────────────────── PROJECT STATUS (temporary) ───────────────────────── */
function ProjectStatus() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Banner tone="gold" title="Project status dashboard · temporary"
        body="A live, shareable readout of project status — tasks, risks, decisions, and recent git activity — published from the Project Manager. This link is a build-time convenience and will be removed before go-live." />
      <div style={{ ...card, padding: 20, display: "grid", gap: 14 }}>
        <div>
          <div style={eyebrow(C.dim)}>Live status page</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text3, marginTop: 6, wordBreak: "break-all" }}>{PROJECT_STATUS_URL}</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={PROJECT_STATUS_URL} target="_blank" rel="noopener noreferrer" style={{
            cursor: "pointer", padding: "10px 18px", borderRadius: 10, background: C.gold, color: "#081627",
            border: `1px solid ${C.gold}`, fontSize: 13, fontWeight: 700, fontFamily: FONT.sans, textDecoration: "none",
          }}>Open full page ↗</a>
          <button onClick={() => { try { navigator.clipboard.writeText(PROJECT_STATUS_URL); } catch { /* */ } }} style={ghostBtn}>Copy link</button>
        </div>
      </div>
      {/* Live dashboard embedded inline so it's visible inside the app, not just a link. */}
      <iframe
        src={PROJECT_STATUS_URL}
        title="Project status dashboard"
        loading="lazy"
        style={{ width: "100%", height: "72vh", minHeight: 460, border: `1px solid ${C.cardBd}`, borderRadius: 14, background: "#fff" }}
      />
      <div style={{ fontSize: 11.5, color: C.dim, fontFamily: FONT.mono }}>Auto-refreshes on each push to git · maintained by the Project Manager skill.</div>
    </div>
  );
}

/* ───────────────────────── CHIEF OF STAFF (persona) ───────────────────────── */
function ChiefOfStaff({ st, update }: { st: AdminState; update: (n: Partial<AdminState>) => void }) {
  const cos = st.cos ?? COS_PERSONA_DEFAULT;
  const set = (patch: Partial<CosPersona>) => update({ cos: { ...cos, ...patch } });
  const inputStyle: CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.cardBd}`,
    background: "rgba(var(--ink),.04)", color: C.text, fontSize: 14, fontFamily: FONT.sans, outline: "none",
  };
  const labelStyle: CSSProperties = { ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 7, display: "block" };
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <Banner tone="gold" title="Your Chief of Staff"
        body="The agent that greets the Mayor each morning and runs the Today screen. Set who he is and the voice he speaks in — it's injected into the briefing the Mayor reads first thing. Saved on this device." />
      <div style={{ ...card, padding: 20, display: "grid", gap: 18 }}>
        <div>
          <span style={labelStyle}>Mayor&rsquo;s name</span>
          <input style={inputStyle} value={cos.mayorName} onChange={(e) => set({ mayorName: e.target.value })} placeholder="Mayor Harvey" />
        </div>
        <div>
          <span style={labelStyle}>Greeting</span>
          <input style={inputStyle} value={cos.greeting} onChange={(e) => set({ greeting: e.target.value })} placeholder="Good morning, {name}." />
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 6 }}><code>{"{name}"}</code> inserts the name · <code>{"{timeOfDay}"}</code> = morning / afternoon / evening</div>
        </div>
        <div>
          <span style={labelStyle}>Tone</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(COS_TONE_PRESETS) as CosTone[]).map((t) => {
              const on = cos.tone === t;
              return <button key={t} onClick={() => set({ tone: t })} style={{
                cursor: "pointer", padding: "8px 16px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans,
                background: on ? C.gold : "transparent", color: on ? "#081627" : C.text3, border: `1px solid ${on ? C.gold : "rgba(var(--ink),.14)"}`,
              }}>{COS_TONE_PRESETS[t].label}</button>;
            })}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>{COS_TONE_PRESETS[cos.tone]?.prompt}</div>
        </div>
        <div>
          <span style={labelStyle}>Personality instructions</span>
          <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical", lineHeight: 1.5 }} value={cos.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            placeholder="e.g. Call me Mayor. Open with something upbeat. Keep it under four sentences. Always surface the most sensitive item first." />
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 6 }}>Injected into the briefing prompt so the Mayor hears a consistent voice each morning.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => set(COS_PERSONA_DEFAULT)} style={ghostBtn}>Reset persona</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── APPEARANCE ───────────────────────── */
function Appearance() {
  const [theme, setTheme] = useState("midnight");
  useEffect(() => { try { setTheme(localStorage.getItem("bw-theme") || "midnight"); } catch { /* */ } }, []);
  function apply(id: string) {
    try { localStorage.setItem("bw-theme", id); } catch { /* */ }
    if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", id);
    setTheme(id);
  }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Banner tone="gold" title="Color scheme"
        body="Pick a scheme that's easy to read in your environment. Schemes are tuned for WCAG-AA text contrast; your choice is saved on this device and applies across every screen. ~80% of usage is on mobile — Daylight reads best in bright light." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        {THEMES.map((t) => {
          const on = theme === t.id;
          return (
            <button key={t.id} onClick={() => apply(t.id)} style={{
              cursor: "pointer", textAlign: "left", padding: 0, overflow: "hidden", borderRadius: 14,
              border: `2px solid ${on ? C.gold : C.cardBd}`, background: "transparent",
            }}>
              {/* live swatch preview */}
              <div style={{ display: "flex", height: 64 }}>
                {t.sw.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
              </div>
              <div style={{ padding: "12px 14px", background: "rgba(var(--ink),.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{t.name}</span>
                  {t.rec && <span style={pill(C.greenText, "rgba(52,201,139,.14)")}>recommended</span>}
                  {on && <span style={{ ...pill(C.gold, "rgba(231,181,60,.16)"), marginLeft: "auto" }}>active ✓</span>}
                </div>
                <div style={{ fontSize: 12.5, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>{t.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: C.dim, fontFamily: FONT.mono }}>Tip: also switchable from the moon/sun toggle in the top bar.</div>
    </div>
  );
}

/* ───────────────────────── MODELS ───────────────────────── */
function Models({ st, update }: { st: AdminState; update: (n: Partial<AdminState>) => void }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Banner tone="gold" title="Graduated-autonomy routing · 70 / 20 / 10"
        body="Haiku handles classification & triage, Sonnet reasons & drafts, Opus is gated behind eval for the highest-stakes work. This split cuts blended cost by more than half versus all-Sonnet." />
      <div style={{ ...card, padding: 4 }}>
        {ROUTER_DEFAULT.map((r, i) => (
          <div key={r.task} style={{ display: "flex", alignItems: "center", gap: 16, padding: "15px 18px", borderTop: i ? `1px solid ${C.line2}` : undefined }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.label}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{r.note}</div>
            </div>
            <select value={st.router[r.task]} onChange={(e) => update({ router: { ...st.router, [r.task]: e.target.value } })} style={selectStyle}>
              {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div style={eyebrow(C.dim)}>Pipeline models</div>
      <div style={{ ...card, padding: 4 }}>
        {PIPELINE_MODELS.map((p, i) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 16, padding: "13px 18px", borderTop: i ? `1px solid ${C.line2}` : undefined }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{p.label}</div>
            </div>
            {p.key === "answer" ? (
              <select value={st.answerModel} onChange={(e) => update({ answerModel: e.target.value })} style={selectStyle}>
                {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            ) : (
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text3 }}>{p.model}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── COST ───────────────────────── */
function Cost({ st }: { st: AdminState }) {
  const [perDay, setPerDay] = useState(200);
  const monthlyQ = useMemo(() => Math.round(perDay * 30 * COST_MODEL.blendedPerQuestion), [perDay]);
  const opusShare = Object.values(st.router).filter((m) => m.includes("opus")).length;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...card, padding: "18px 20px" }}>
        <div style={eyebrow(C.dim)}>Estimated monthly cost</div>
        <div style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 40, color: C.gold, lineHeight: 1.05, marginTop: 6 }}>${COST_MODEL.monthlyLow}–${COST_MODEL.monthlyHigh}<span style={{ fontSize: 16, fontWeight: 600, color: C.muted }}> / month</span></div>
        <div style={{ fontSize: 13, color: C.text3, marginTop: 5 }}>All-in for one village · <b style={{ color: C.text2 }}>${COST_MODEL.blendedPerQuestion.toFixed(3)}</b> blended per question.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <Metric big={`$${COST_MODEL.blendedPerQuestion.toFixed(3)}`} label="blended / question" sub="at retrieval, < 1¢" color={C.green} />
        <Metric big={`$${COST_MODEL.oneTimeEmbedLow}–${COST_MODEL.oneTimeEmbedHigh}`} label="one-time backfill" sub="70k emails, Batch API 50% off" color={C.blue} />
        <Metric big={`$${COST_MODEL.monthlyLow}–${COST_MODEL.monthlyHigh}`} label="steady-state / month" sub="all-in, one village" color={C.gold} />
        <Metric big={`${COST_MODEL.split.haiku}/${COST_MODEL.split.sonnet}/${COST_MODEL.split.opus}`} label="Haiku / Sonnet / Opus" sub={`${opusShare} tier(s) on Opus now`} color={C.purpleText} />
      </div>

      <div style={{ ...card, padding: 20 }}>
        <div style={eyebrow(C.dim)}>Projection</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
          <input type="range" min={20} max={2000} step={20} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} style={{ flex: 1, minWidth: 220, accentColor: C.gold }} />
          <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text2, whiteSpace: "nowrap" }}>{perDay} questions/day</div>
          <div style={{ fontFamily: FONT.serif, fontSize: 26, color: C.text, whiteSpace: "nowrap" }}>≈ ${monthlyQ}<span style={{ fontSize: 13, color: C.muted }}> /mo in model calls</span></div>
        </div>
      </div>

      <div style={{ ...card, padding: 20 }}>
        <div style={eyebrow(C.dim)}>Cost levers (active)</div>
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: C.text2, fontSize: 13.5, lineHeight: 1.9 }}>
          {COST_MODEL.levers.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>
      <div style={{ fontSize: 11.5, color: C.dim, fontFamily: FONT.mono }}>Figures from the architecture brief §8/§10 · verify against live billing at contract time.</div>
    </div>
  );
}

/* ───────────────────────── AGENT RULES ───────────────────────── */
function Rules({ st, update }: { st: AdminState; update: (n: Partial<AdminState>) => void }) {
  const tone: Record<string, string> = { R1: C.blue, R2: C.orange, R3: C.purpleText, R4: C.green };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Banner tone="purple" title="Agents draft. The Mayor decides."
        body="Every capability is pinned to an autonomy level. Nothing sends or acts without a human gate (R3); proactive digests must cite sources and state gaps (R4)." />
      {AUTONOMY_LADDER.map((r) => (
        <div key={r.level} style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 9 }}>
            <span style={{ ...pill(tone[r.level], "rgba(var(--ink),.07)"), fontWeight: 700 }}>{r.level}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{r.title}</span>
          </div>
          <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.6, marginBottom: 12 }}>{r.rule}</div>
          <div style={eyebrow(C.dim2)}>Operator note</div>
          <textarea
            value={st.notes[r.level] ?? ""}
            placeholder="Add a documented rule or exception for this autonomy level…"
            onChange={(e) => update({ notes: { ...st.notes, [r.level]: e.target.value } })}
            style={{ width: "100%", marginTop: 7, minHeight: 54, resize: "vertical", background: "rgba(var(--ink),.04)", border: `1px solid ${C.line}`, borderRadius: 10, color: C.text, fontFamily: FONT.sans, fontSize: 13, padding: "9px 11px", outline: "none" }} />
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── SKILLS (capability agents) ───────────────────────── */
function Skills({ st, update }: { st: AdminState; update: (n: Partial<AdminState>) => void }) {
  const statusPill: Record<string, CSSProperties> = {
    built: pill(C.greenText, "rgba(52,201,139,.14)"),
    partial: pill(C.orangeText, "rgba(240,163,60,.14)"),
    planned: pill(C.dim, "rgba(var(--ink),.06)"),
  };
  const toggle = (k: string) => {
    const off = new Set(st.skillsOff);
    off.has(k) ? off.delete(k) : off.add(k);
    update({ skillsOff: [...off] });
  };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Banner tone="gold" title="Capability agents (skills)"
        body="Each skill reads only the canonical store and is added without touching others — one connector makes every skill smarter at once. Toggle what's live in this tenant." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 14 }}>
        {CAPABILITIES.map((c) => {
          const enabled = !st.skillsOff.includes(c.key);
          return (
            <div key={c.key} style={{ ...card, padding: 17, opacity: enabled ? 1 : 0.55 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{c.name}</span>
                <Toggle on={enabled} onClick={() => toggle(c.key)} />
              </div>
              <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.55, marginBottom: 12, minHeight: 54 }}>{c.desc}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={statusPill[c.status]}>{c.status}</span>
                <span style={pill(C.text3, "rgba(var(--ink),.06)")}>{c.autonomy}</span>
                <span style={{ ...pill(C.dim, "rgba(var(--ink),.05)"), marginLeft: "auto" }}>Phase {c.phase}</span>
              </div>
            </div>
          );
        })}
      </div>
      <button style={{ ...ghostBtn, justifySelf: "start" }}>+ Add skill from registry</button>
    </div>
  );
}

/* ───────────────────────── SOURCES ───────────────────────── */
function Sources({ st, update }: { st: AdminState; update: (n: Partial<AdminState>) => void }) {
  const dot: Record<string, string> = { healthy: C.green, syncing: C.blue, degraded: C.orange, off: C.dim2 };
  const all = [...SOURCES_DEFAULT, ...st.extraSources];
  const isOn = (s: SourceDef) => st.sources[s.key]?.enabled ?? s.enabled;
  const sched = (s: SourceDef) => st.sources[s.key]?.schedule ?? s.schedule;
  const setSrc = (k: string, patch: { enabled?: boolean; schedule?: string }, base: SourceDef) =>
    update({ sources: { ...st.sources, [k]: { enabled: patch.enabled ?? isOn(base), schedule: patch.schedule ?? sched(base) } } });

  function addSource() {
    const n = st.extraSources.length + 1;
    update({ extraSources: [...st.extraSources, { key: `custom-${n}`, name: `New connector ${n}`, kind: "REST API", enabled: false, schedule: "hourly", status: "off" }] });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Banner tone="blue" title="Ingestion plane · connectors"
        body="Connectors only land data into the canonical store — messy paths (forwarded mailbox, nightly CSV, legacy SFTP) are first-class. Enable, schedule, and watch health here." />
      <div style={{ ...card, padding: 4 }}>
        {all.map((s, i) => {
          const on = isOn(s);
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", borderTop: i ? `1px solid ${C.line2}` : undefined }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: on ? dot[s.status] : C.dim2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: on ? C.text : C.muted }}>{s.name}</div>
                <div style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.dim, marginTop: 2 }}>{s.kind} · {on ? s.status : "off"}</div>
              </div>
              <select value={sched(s)} onChange={(e) => setSrc(s.key, { schedule: e.target.value }, s)} style={{ ...selectStyle, minWidth: 130 }}>
                {["every 5 min", "every 15 min", "hourly", "daily 02:00", "weekly"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <Toggle on={on} onClick={() => setSrc(s.key, { enabled: !on }, s)} />
            </div>
          );
        })}
      </div>
      <button onClick={addSource} style={{ ...ghostBtn, justifySelf: "start" }}>+ Add source</button>
    </div>
  );
}

/* ───────────────────────── shared bits ───────────────────────── */
const selectStyle: CSSProperties = {
  background: "rgba(var(--ink),.05)", color: C.text, border: `1px solid ${C.line}`,
  borderRadius: 9, padding: "8px 11px", fontSize: 12.5, fontFamily: FONT.sans, outline: "none", cursor: "pointer",
};
const ghostBtn: CSSProperties = {
  cursor: "pointer", padding: "9px 16px", borderRadius: 10, background: "rgba(var(--ink),.05)",
  border: `1px solid ${C.line}`, color: C.text2, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans,
};

function Banner({ tone, title, body }: { tone: "gold" | "purple" | "blue"; title: string; body: string }) {
  const map = { gold: [C.gold, "rgba(231,181,60,.3)", "rgba(231,181,60,.06)"], purple: [C.purpleText, "rgba(157,139,255,.3)", "rgba(157,139,255,.06)"], blue: [C.blue, "rgba(103,173,255,.3)", "rgba(103,173,255,.06)"] }[tone];
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${map[1]}`, background: map[2], padding: "15px 18px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: map[0] as string, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}

function Metric({ big, label, sub, color }: { big: string; label: string; sub: string; color: string }) {
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 28, fontWeight: 500, color }}>{big}</div>
      <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      cursor: "pointer", width: 42, height: 24, borderRadius: 99, border: 0, padding: 3, flexShrink: 0,
      background: on ? C.green : "rgba(var(--ink),.14)", transition: "background .15s",
    }}>
      <span style={{ display: "block", width: 18, height: 18, borderRadius: 99, background: "#fff", transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform .15s" }} />
    </button>
  );
}
