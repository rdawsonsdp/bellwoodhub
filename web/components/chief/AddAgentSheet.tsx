"use client";
/*
 * AddAgentSheet — the "Add an agent" surface (the + card on the Wall).
 *
 * Design (RD ref 2026-07-02, integration-picker idiom): a serif-headed panel
 * with a GRID of type cards — icon tile, name, one-line description. Clicking
 * a type drills into what its onboarding interview asks and which connections
 * it will request. The Agent Builder that RUNS the interview arrives with the
 * Agent Factory (RB-6, docs/rebuild/AGENT_FACTORY.md) — stated honestly on the
 * detail view; never a dead button.
 */
import { useState, type CSSProperties } from "react";
import { C, FONT, card, eyebrow } from "@/lib/cos-design";
import { AGENT_TYPES, type AgentTypeSeed } from "@/lib/agent-types";

interface Props {
  variant: "mobile" | "desktop";
  onClose: () => void;
}

/** Type tiles: stroke icon on a solid hue (same identity language as agents). */
const TYPE_META: Record<string, { color: string; d: string[] }> = {
  "email-ingest": { color: "#5b8def", d: ["M3 7l9 6 9-6", "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"] },
  "domain-desk": { color: "#2fb7a8", d: ["M3 21h18", "M5 21V10M9 21V10M15 21V10M19 21V10", "M3 10l9-7 9 7"] },
  "entity-scope": { color: "#a983ea", d: ["M4 9h16v11H4z", "M3 9l2-5h14l2 5", "M9 20v-6h6v6"] },
  commitments: { color: "#f0be3c", d: ["M7 3v3M17 3v3M4 9h16", "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"] },
  "doc-connector": { color: "#93a4bd", d: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M9 13h6M9 17h6"] },
};

function TypeTile({ typeKey, size = 30 }: { typeKey: string; size?: number }) {
  const m = TYPE_META[typeKey] ?? { color: "#93a4bd", d: ["M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z"] };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: Math.round(size * 0.3), background: m.color, boxShadow: "inset 0 -2px 4px rgba(0,0,0,.14)", flexShrink: 0 }}>
      <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="none" stroke="#182126" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {m.d.map((p, i) => <path key={i} d={p} />)}
      </svg>
    </span>
  );
}

export default function AddAgentSheet({ variant, onClose }: Props) {
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [autonomy, setAutonomy] = useState<"observe" | "suggest" | "draft">("observe");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ name: string; focusQuery: string | null } | null>(null);
  // Preview BEFORE create. Typing "anything important" and getting noise a day
  // later is the main way a new agent ends up distrusted; catching it here
  // costs one cheap call and ten seconds.
  type Hit = { messageId: string; date: string; from: string; subject: string; score: number };
  const [pv, setPv] = useState<{ query: string | null; hits: Hit[]; note?: string } | null>(null);
  const [pvBusy, setPvBusy] = useState(false);

  async function preview() {
    setPvBusy(true); setErr(null);
    try {
      const r = await fetch("/api/agents/focus-preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "preview failed");
      setPv({ query: d.query ?? null, hits: d.hits ?? [], note: d.note });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "preview failed");
    } finally { setPvBusy(false); }
  }

  async function create() {
    if (made) { setMade(null); setName(""); setInstruction(""); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/agents/create", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, instruction, autonomy }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "could not create the agent");
      setMade({ name: d.name, focusQuery: d.focusQuery ?? null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not create the agent");
    } finally { setBusy(false); }
  }

  const mobile = variant === "mobile";
  const [sel, setSel] = useState<AgentTypeSeed | null>(null);
  const panel: CSSProperties = mobile
    ? { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88dvh", borderRadius: "18px 18px 0 0", borderTop: `1px solid ${C.line}` }
    : { position: "absolute", top: 0, right: 0, bottom: 0, width: 520, maxWidth: "94vw", borderLeft: `1px solid ${C.line}` };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", backdropFilter: "blur(2px)" }}>
      <div className="scrl" onClick={(e) => e.stopPropagation()} style={{ ...panel, background: "var(--c-appbg)", overflowY: "auto", padding: "20px 20px 30px", color: C.text, fontFamily: FONT.sans }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sel && (
            <button onClick={() => setSel(null)} aria-label="Back" style={{ background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 99, width: 30, height: 30, color: C.text2, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>←</button>
          )}
          <span style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 600, flex: 1, letterSpacing: "-.01em" }}>{sel ? sel.name : "Add an agent"}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 99, width: 30, height: 30, color: C.text2, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>

        {!sel ? (
          <>
            <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.55, margin: "8px 0 18px" }}>
              Pick a type of agent to add. Onboarding is an interview — a few
              questions configure the seat; sign-ins are requested only if the agent needs them.
              Every new agent starts observe-only until it earns more.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr", gap: 11 }}>
              {AGENT_TYPES.map((t) => (
                <button key={t.key} onClick={() => setSel(t)} style={{ ...card, textAlign: "left", cursor: "pointer", padding: "14px 14px 13px", display: "flex", flexDirection: "column", gap: 9, color: C.text, fontFamily: FONT.sans, background: "var(--c-sidebar, rgba(var(--ink),.03))" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <TypeTile typeKey={t.key} />
                    <span style={{ fontSize: 14, fontWeight: 800, minWidth: 0 }}>{t.name}</span>
                  </span>
                  <span style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{t.blurb}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: "11px 14px", borderRadius: 12, fontSize: 12, lineHeight: 1.55, color: C.text3, background: "rgba(var(--ink),.045)", border: `1px solid ${C.line}` }}>
              Need something that fits none of these? The Builder can interview from scratch and
              define a new type — bound by the same rules: observe-first, always cites, never sends.
            </div>
          </>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <TypeTile typeKey={sel.key} size={38} />
              <span style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{sel.blurb}</span>
            </div>
            {/* THE REAL BUILDER. This was a mockup — a described interview no
                code could complete, because agents only existed as literals in
                lib/domain-agents.ts. FEAT-27 is what made it buildable: a desk's
                scope can be a sentence resolved semantically instead of a
                StreamKey enum plus a routing regex. */}
            <div style={{ ...eyebrow(C.dim), margin: "18px 0 7px" }}>Name it</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={sel.key === "email-ingest" ? "e.g. Public Works Mailbox" : "e.g. Public Works Agent"}
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(var(--ink),.04)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px", color: C.text, fontSize: 15, fontFamily: FONT.sans }}
            />

            <div style={{ ...eyebrow(C.dim), margin: "16px 0 7px" }}>What should it do?</div>
            <textarea
              value={instruction}
              onChange={(e) => { setInstruction(e.target.value); setPv(null); }}
              rows={5}
              placeholder={"Plain English \u2014 the way you'd brief a person.\n\ne.g. Watch for anything about water main breaks, street flooding, or sewer backups. Tell me where, how many, and whether the same address keeps coming up. Flag anything a resident is still waiting on."}
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(var(--ink),.04)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px", color: C.text, fontSize: 14, lineHeight: 1.55, fontFamily: FONT.sans, resize: "vertical" }}
            />
            <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.5, marginTop: 6 }}>
              Name a thing you could search for. Concrete subjects (&ldquo;water main breaks&rdquo;,
              &ldquo;invoices&rdquo;) find the right mail; abstract ones (&ldquo;anything important&rdquo;)
              return noise.
            </div>

            <button
              onClick={preview}
              disabled={pvBusy || instruction.trim().length < 10}
              style={{ marginTop: 9, cursor: instruction.trim().length < 10 ? "default" : "pointer", background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 13px", color: C.text2, fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans, opacity: instruction.trim().length < 10 ? 0.5 : 1 }}
            >
              {pvBusy ? "Searching\u2026" : "Preview what it will find"}
            </button>

            {pv && (
              <div style={{ marginTop: 10, padding: "11px 13px", borderRadius: 11, border: `1px solid ${pv.query && pv.hits.length ? C.line : "#e6c9a8"}`, background: pv.query && pv.hits.length ? "rgba(var(--ink),.03)" : "rgba(240,163,60,.08)" }}>
                {!pv.query ? (
                  <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.55 }}>
                    <b style={{ color: C.text }}>Nothing searchable in that yet.</b>{" "}
                    {pv.note}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11.5, color: C.text3, marginBottom: pv.hits.length ? 8 : 0, lineHeight: 1.5 }}>
                      It will search the record for{" "}
                      <span style={{ fontFamily: FONT.mono, color: C.text2 }}>&ldquo;{pv.query}&rdquo;</span>
                      {pv.hits.length ? ` \u2014 ${pv.hits.length} record${pv.hits.length === 1 ? "" : "s"} match today.` : " \u2014 but nothing in the record matches it yet."}
                    </div>
                    {pv.hits.slice(0, 6).map((h) => (
                      <div key={h.messageId} style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: 12.5, color: C.text2, borderTop: `1px solid ${C.line}`, paddingTop: 6, marginTop: 6 }}>
                        <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, flexShrink: 0 }}>{h.date.slice(0, 10)}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <b style={{ color: C.text }}>{h.subject}</b> \u00b7 {h.from}
                        </span>
                      </div>
                    ))}
                    {!pv.hits.length && (
                      <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.5, marginTop: 4 }}>
                        That can be fine if the mail hasn&rsquo;t arrived yet \u2014 but if you expected
                        matches, reword it using the words the mail itself would use.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ ...eyebrow(C.dim), margin: "16px 0 7px" }}>What may it do with what it finds?</div>
            <div style={{ display: "grid", gap: 7 }}>
              {([
                ["observe", "Watch and report", "Summarizes and flags. Writes nothing."],
                ["suggest", "Suggest next steps", "Adds a recommended action to its digest."],
                ["draft", "Draft replies for you", "Writes replies that wait for your approval. Never sends."],
              ] as const).map(([val, label, note]) => (
                <button
                  key={val}
                  onClick={() => setAutonomy(val)}
                  style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px", borderRadius: 11, border: `1px solid ${autonomy === val ? C.gold : C.line}`, background: autonomy === val ? "rgba(231,181,60,.10)" : "transparent", color: C.text, fontFamily: FONT.sans }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: C.text3, marginTop: 1 }}>{note}</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.5, marginTop: 7 }}>
              No agent can send mail. That ceiling is in the code, not this form.
            </div>

            {err && (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.red}55`, background: "rgba(255,107,94,.08)", color: C.redText, fontSize: 13, lineHeight: 1.5 }}>
                {err}
              </div>
            )}
            {made && (
              <div style={{ marginTop: 12, padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.green}55`, background: "rgba(52,201,139,.09)", fontSize: 13, lineHeight: 1.55, color: C.text2 }}>
                <b style={{ color: C.text }}>{made.name} created.</b>{" "}
                {made.focusQuery
                  ? <>It will search the record for <i>&ldquo;{made.focusQuery}&rdquo;</i> and report on the next run.</>
                  : <>It couldn&rsquo;t turn that instruction into a search &mdash; it will only see new mail until you reword it on its card.</>}
              </div>
            )}

            <button
              onClick={create}
              disabled={busy || !name.trim() || instruction.trim().length < 10}
              style={{ display: "block", width: "100%", marginTop: 16, padding: "13px 14px", borderRadius: 13, border: 0, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322", fontWeight: 800, fontSize: 14, fontFamily: FONT.sans, opacity: busy || !name.trim() || instruction.trim().length < 10 ? 0.45 : 1, cursor: busy ? "wait" : "pointer" }}
            >
              {busy ? "Creating\u2026" : made ? "Create another" : "Create this agent"}
            </button>
            <div style={{ marginTop: 8, textAlign: "center", fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>
              it runs on the next cycle \u00b7 every claim it makes will cite the email it came from
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
