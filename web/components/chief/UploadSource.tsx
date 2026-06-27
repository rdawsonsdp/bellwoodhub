"use client";
/*
 * UploadSource — agent-driven source ingestion (Phase 1, demo-safe / keyless).
 *
 * Flow: pick type → drop file → agent drafts the Envelope → human confirms (R3)
 * → commit. The form fields map 1:1 to the canonical model (see source-types.ts).
 * In this phase the "agent parse" is simulated and the commit is in-memory
 * (lib/ingested-sources). Phase 2 swaps in a real OpenAI-vision parse; Phase 3
 * writes real canonical rows + entity_aliases + chunks.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C, FONT } from "@/lib/cos-design";
import {
  SOURCE_TYPES, getSourceType, simulateExtraction, storageRoute, SENSITIVITY_META,
  type IngestDraft, type Sensitivity, type EntityDraft,
} from "@/lib/source-types";
import { addIngested, newId, type IngestedRecord } from "@/lib/ingested-sources";

type Step = "type" | "file" | "analyzing" | "review" | "committing" | "done";

const entKindColor: Record<string, string> = {
  address: C.blue, parcel: C.blue, person: C.green, business: C.purpleText, organization: C.gold, department: C.orange,
};

function Svg({ d, w = 22, sw = 1.9 }: { d: string; w?: number; sw?: number }) {
  return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d.split("M").filter(Boolean).map((p, i) => <path key={i} d={"M" + p} />)}</svg>;
}

export default function UploadSource({ onClose, onCommitted }: { onClose: () => void; onCommitted?: (r: IngestedRecord) => void }) {
  const [step, setStep] = useState<Step>("type");
  const [typeKey, setTypeKey] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [draft, setDraft] = useState<IngestDraft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function chooseType(k: string) { setTypeKey(k); setStep("file"); }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setStep("analyzing");
    // simulate the Ingestion Agent reading + extracting
    window.setTimeout(() => { setDraft(simulateExtraction(typeKey, f.name)); setStep("review"); }, 1700);
  }

  function commit() {
    if (!draft) return;
    setStep("committing"); // run the pipeline progress, then finalize
  }
  function finalize() {
    if (!draft) return;
    const rec: IngestedRecord = {
      ...draft,
      id: newId(),
      ingestedAt: new Date().toISOString(),
      fileName,
      storageLabel: storageRoute(draft.sensitivity).label,
    };
    addIngested(rec);
    onCommitted?.(rec);
    setStep("done");
  }

  const t = getSourceType(typeKey);
  const title = step === "review" || step === "analyzing" ? "Review & categorize" : step === "committing" ? "Adding to corpus" : step === "done" ? "Ingested" : "Upload source";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, background: "var(--c-appbg)", color: C.text, display: "flex", flexDirection: "column", animation: "sheetUp .22s ease-out", fontFamily: FONT.sans }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top) + 12px) 16px 12px", borderBottom: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.04)", backdropFilter: "blur(12px)" }}>
        <button onClick={onClose} aria-label="Close" style={iconBtn}><Svg d="M18 6 6 18M6 6l12 12" w={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 600 }}>{title}</div>
          {t && step !== "type" && <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, marginTop: 1 }}>{t.label}{fileName ? ` · ${fileName}` : ""}</div>}
        </div>
        <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.gold, letterSpacing: ".08em" }}>AGENT INGEST</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {/* STEP 1 — type */}
        {step === "type" && (
          <div style={{ display: "grid", gap: 11 }}>
            <p style={lead}>What are you uploading? The agent uses this to know how to read the document and where it belongs.</p>
            {SOURCE_TYPES.map((st) => {
              const sm = SENSITIVITY_META[st.sensitivity];
              return (
                <button key={st.key} onClick={() => chooseType(st.key)} style={{ ...cardBtn }}>
                  <span style={{ color: C.gold, flexShrink: 0 }}><Svg d={st.icon} w={22} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{st.label}</div>
                    <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2, lineHeight: 1.4 }}>{st.blurb}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                      <Tag c={C.muted}>{st.stream}</Tag>
                      <Tag c={sm.color}>{sm.label}{st.sensitivity === "restricted" ? " · secured store" : ""}</Tag>
                    </div>
                  </div>
                  <Svg d="M9 6l6 6-6 6" w={15} />
                </button>
              );
            })}
          </div>
        )}

        {/* STEP 2 — file */}
        {step === "file" && (
          <div style={{ display: "grid", gap: 14 }}>
            <p style={lead}>Drop the {t?.label.toLowerCase()} (PDF, image, or document). The agent will read it and draft the record for your review.</p>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.txt" onChange={onFile} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} style={{ ...dropZone }}>
              <span style={{ color: C.gold }}><Svg d="M12 16V4M7 9l5-5 5 5M5 20h14" w={30} sw={1.8} /></span>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>Choose a file</span>
              <span style={{ fontSize: 12, color: C.dim }}>or take a photo of the document</span>
            </button>
            <button onClick={() => setStep("type")} style={ghost}>← Change type</button>
          </div>
        )}

        {/* STEP 3 — analyzing */}
        {step === "analyzing" && (
          <div style={{ display: "grid", gap: 16, placeItems: "center", padding: "48px 0" }}>
            <span style={{ color: C.gold, animation: "cosSpin .8s linear infinite" }}><Svg d="M21 12a9 9 0 1 1-6.2-8.5" w={34} sw={2.2} /></span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: FONT.serif, fontSize: 18 }}>Ingestion Agent is reading the document…</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 6, lineHeight: 1.6 }}>Extracting key fields · resolving people & places · classifying topic</div>
            </div>
          </div>
        )}

        {/* STEP 4 — review */}
        {step === "review" && draft && <ReviewForm draft={draft} setDraft={setDraft} onCommit={commit} />}

        {/* STEP 5 — committing (pipeline progress into the corpus) */}
        {step === "committing" && draft && <Committing draft={draft} onComplete={finalize} />}

        {/* STEP 6 — done */}
        {step === "done" && draft && <Done draft={draft} onClose={onClose} />}
      </div>
    </div>
  );
}

/* The pipeline-progress view — watch the document move through the 5-step
 * ingest contract into the corpus. In the demo it's timed; in production each
 * row reflects a real stage event (the embed step is when it becomes searchable). */
function Committing({ draft, onComplete }: { draft: IngestDraft; onComplete: () => void }) {
  const route = storageRoute(draft.sensitivity);
  const stages: { label: string; sub: string }[] = [
    { label: "Storing original", sub: route.label },
    { label: "Writing canonical record", sub: "1 message" },
    { label: "Resolving people & places", sub: `${draft.entities.length} linked` },
    { label: "Classifying topic & stream", sub: `${draft.topic} → ${draft.stream}` },
    { label: "Embedding for AI Search", sub: "Voyage · 1024-dim" },
    { label: "Indexed — searchable", sub: "live in AI Search" },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= stages.length) { const t = window.setTimeout(onComplete, 480); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => setI((n) => n + 1), i === 4 ? 1000 : 620); // embedding takes a touch longer
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  const pct = Math.round((Math.min(i, stages.length) / stages.length) * 100);

  return (
    <div style={{ display: "grid", gap: 18, paddingTop: 12 }}>
      <div>
        <div style={{ fontFamily: FONT.serif, fontSize: 19, lineHeight: 1.3 }}>Adding to the corpus…</div>
        <div style={{ fontSize: 13, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>“{draft.title}” is moving through the ingestion pipeline.</div>
      </div>

      {/* progress bar */}
      <div>
        <div style={{ height: 8, borderRadius: 99, background: "rgba(var(--ink),.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,var(--c-goldlo),var(--c-goldhi))`, borderRadius: 99, transition: "width .5s cubic-bezier(.4,0,.2,1)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>
          <span>{pct}%</span><span>{Math.min(i, stages.length)} / {stages.length} steps</span>
        </div>
      </div>

      {/* stage checklist */}
      <div style={{ display: "grid", gap: 2 }}>
        {stages.map((s, idx) => {
          const done = idx < i, active = idx === i;
          return (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 11, background: active ? "rgba(231,181,60,.07)" : "transparent" }}>
              <span style={{ width: 22, height: 22, flexShrink: 0, display: "grid", placeItems: "center", color: done ? C.green : active ? C.gold : C.dim }}>
                {done
                  ? <Svg d="M20 6 9 17l-5-5" w={16} sw={2.4} />
                  : active
                    ? <span style={{ display: "inline-flex", animation: "cosSpin .8s linear infinite" }}><Svg d="M21 12a9 9 0 1 1-6.2-8.5" w={15} sw={2.2} /></span>
                    : <span style={{ width: 8, height: 8, borderRadius: 99, border: `1.5px solid ${C.dim}` }} />}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: active || done ? 600 : 500, color: active || done ? C.text : C.text3 }}>{s.label}</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, textAlign: "right" }}>{s.sub}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: FONT.mono, textAlign: "center" }}>5-step ingest contract · audit-logged · R3</div>
    </div>
  );
}

function ReviewForm({ draft, setDraft, onCommit }: { draft: IngestDraft; setDraft: (d: IngestDraft) => void; onCommit: () => void }) {
  const t = getSourceType(draft.typeKey)!;
  const route = storageRoute(draft.sensitivity);
  const set = (patch: Partial<IngestDraft>) => setDraft({ ...draft, ...patch });
  const setField = (k: string, v: string) => setDraft({ ...draft, fields: { ...draft.fields, [k]: v } });
  const setEntity = (i: number, patch: Partial<EntityDraft>) => {
    const e = [...draft.entities]; e[i] = { ...e[i], ...patch }; set({ entities: e });
  };
  const removeEntity = (i: number) => set({ entities: draft.entities.filter((_, j) => j !== i) });

  return (
    <div style={{ display: "grid", gap: 16, paddingBottom: 28 }}>
      <div style={banner}>The agent drafted this from your document. Correct anything, then commit — nothing is saved until you do.</div>

      <Section label="Record">
        <Field label="Title"><input style={inp} value={draft.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Row2>
          <Field label="Date of record"><input style={inp} type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Topic"><input style={inp} value={draft.topic} onChange={(e) => set({ topic: e.target.value })} /></Field>
        </Row2>
        <Row2>
          <Field label="Stream"><input style={inp} value={draft.stream} onChange={(e) => set({ stream: e.target.value as IngestDraft["stream"] })} /></Field>
          <Field label="Author / origin"><input style={inp} value={draft.author} onChange={(e) => set({ author: e.target.value })} /></Field>
        </Row2>
        <Field label="Summary (embedded for AI Search)"><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} /></Field>
      </Section>

      <Section label={`${t.label} — key fields`}>
        {t.fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.kind === "textarea"
              ? <textarea style={{ ...inp, minHeight: 64, resize: "vertical" }} value={draft.fields[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} />
              : <input style={inp} value={draft.fields[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} />}
          </Field>
        ))}
      </Section>

      <Section label={`People & places (${draft.entities.length}) — linked to History`}>
        <div style={{ display: "grid", gap: 8 }}>
          {draft.entities.map((en, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", border: "1px solid var(--c-cardbd)", borderRadius: 11, background: "rgba(var(--ink),.04)" }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: entKindColor[en.kind] || C.muted, flexShrink: 0 }} />
              <input style={{ ...inp, flex: 1, padding: "5px 8px", fontSize: 13.5 }} value={en.name} onChange={(e) => setEntity(i, { name: e.target.value })} />
              <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, flexShrink: 0 }}>{en.kind} · {Math.round(en.confidence * 100)}%</span>
              <button onClick={() => removeEntity(i)} aria-label="Remove" style={{ ...iconBtn, width: 28, height: 28, color: C.dim }}><Svg d="M18 6 6 18M6 6l12 12" w={13} /></button>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.dim, fontFamily: FONT.mono }}>New names route to the identity review queue — no silent merges.</div>
        </div>
      </Section>

      <Section label="Sensitivity & storage">
        <div style={{ display: "flex", gap: 8 }}>
          {(["public", "internal", "restricted"] as Sensitivity[]).map((s) => {
            const on = draft.sensitivity === s; const sm = SENSITIVITY_META[s];
            return <button key={s} onClick={() => set({ sensitivity: s })} style={{ flex: 1, cursor: "pointer", padding: "9px 6px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, border: `1px solid ${on ? sm.color : "var(--c-cardbd)"}`, background: on ? `${sm.color}22` : "transparent", color: on ? sm.color : C.text3 }}>{sm.label}</button>;
          })}
        </div>
        <div style={{ marginTop: 10, padding: "11px 13px", borderRadius: 11, border: `1px solid ${route.secure ? "rgba(255,107,94,.35)" : "var(--c-cardbd)"}`, background: route.secure ? "rgba(255,107,94,.07)" : "rgba(var(--ink),.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: route.secure ? C.red : C.text2 }}>
            <Svg d={route.secure ? "M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z" : "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7"} w={15} />
            {route.label}
          </div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>{route.note}</div>
        </div>
      </Section>

      <button onClick={onCommit} style={commitBtn}>Commit to canonical store →</button>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: FONT.mono, textAlign: "center" }}>R3 · agent drafts, you decide · audit-logged</div>
    </div>
  );
}

function Done({ draft, onClose }: { draft: IngestDraft; onClose: () => void }) {
  const route = storageRoute(draft.sensitivity);
  const rows: [string, string][] = [
    ["Canonical record", "1 message written · searchable"],
    ["People & places", `${draft.entities.length} linked → History timelines`],
    ["Topic / stream", `${draft.topic} → ${draft.stream}`],
    ["AI Search", "summary embedded · returns with citation"],
    ["Original file", route.label],
  ];
  return (
    <div style={{ display: "grid", gap: 16, placeItems: "center", paddingTop: 24 }}>
      <span style={{ width: 56, height: 56, borderRadius: 99, background: "rgba(79,180,119,.16)", color: C.green, display: "grid", placeItems: "center" }}><Svg d="M20 6 9 17l-5-5" w={26} sw={2.4} /></span>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 20 }}>Ingested & searchable</div>
        <div style={{ fontSize: 13, color: C.text3, marginTop: 5, maxWidth: 300, lineHeight: 1.5 }}>“{draft.title}” is now part of the record — findable in AI Search and on the linked timelines.</div>
      </div>
      <div style={{ width: "100%", border: "1px solid var(--c-cardbd)", borderRadius: 13, overflow: "hidden" }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ display: "flex", gap: 10, padding: "11px 14px", borderTop: i ? "1px solid var(--c-cardbd)" : undefined, alignItems: "center" }}>
            <span style={{ flex: "0 0 120px", fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, textTransform: "uppercase" }}>{k}</span>
            <span style={{ flex: 1, fontSize: 13, color: C.text2 }}>{v}</span>
          </div>
        ))}
      </div>
      <button onClick={onClose} style={{ ...commitBtn, background: "rgba(var(--ink),.06)", color: C.text }}>Done</button>
    </div>
  );
}

/* ── small bits ── */
const Tag = ({ children, c }: { children: React.ReactNode; c: string }) => <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: c, background: "rgba(var(--ink),.08)", border: "1px solid rgba(var(--ink),.1)" }}>{children}</span>;
const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "grid", gap: 9 }}>
    <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase" }}>{label}</div>
    {children}
  </div>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 4 }}>
    <span style={{ fontSize: 11.5, color: C.text3, fontWeight: 600 }}>{label}</span>
    {children}
  </label>
);
const Row2 = ({ children }: { children: React.ReactNode }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>{children}</div>;

const lead: CSSProperties = { fontSize: 13.5, color: C.text3, lineHeight: 1.6, margin: "2px 0 6px" };
const banner: CSSProperties = { fontSize: 12.5, color: C.text2, lineHeight: 1.5, padding: "11px 13px", borderRadius: 11, border: "1px solid rgba(231,181,60,.3)", background: "rgba(231,181,60,.07)" };
const iconBtn: CSSProperties = { width: 36, height: 36, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" };
const cardBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", padding: 15, borderRadius: 14, border: "1px solid var(--c-cardbd)", background: "linear-gradient(180deg,rgba(var(--ink),.05),rgba(var(--ink),.018))", color: C.text, cursor: "pointer" };
const dropZone: CSSProperties = { display: "grid", placeItems: "center", gap: 8, padding: "38px 16px", borderRadius: 16, border: "1.5px dashed rgba(231,181,60,.45)", background: "rgba(231,181,60,.05)", color: C.text2, cursor: "pointer" };
const inp: CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text, fontSize: 14, fontFamily: FONT.sans, outline: "none" };
const ghost: CSSProperties = { justifySelf: "start", padding: "8px 14px", borderRadius: 10, background: "transparent", border: "1px solid var(--c-cardbd)", color: C.text3, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const commitBtn: CSSProperties = { width: "100%", padding: "13px", borderRadius: 12, border: 0, background: C.gold, color: "#081627", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT.sans };
