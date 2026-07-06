"use client";
/*
 * AgentsPage — "Staff Agents": the landing page to SHOW and TRACK the Mayor's
 * team of agents and the work they do. Read-only UX view — agents are configured
 * and tested in Claude Code, not here. Click an agent to see its recent activity.
 * The team is open-ended: today it's email; tomorrow it could be approving time cards.
 */
import { useEffect, useState } from "react";
import { C, FONT, card, eyebrow, pill } from "@/lib/cos-design";
import { COS_AGENTS, AUTONOMY_LABEL, agentByKey, type CosAgent } from "@/lib/cos-agents";
import { DOMAIN_AGENTS, domainAgentByKey } from "@/lib/domain-agents";
import { IS_LIVE_BUILD } from "@/lib/live";
import UsagePanel from "./UsagePanel";

// The `recent` lines in the registry are demo-era narrative with invented
// timestamps. On the live pilot they must not read as real activity — suppress
// them (and the count they feed) until agents actually log runs.
const LIVE_ACTIVITY_NOTE = "Activity appears here once this agent runs live.";

/** Live facts behind an email agent's card — from /api/agents/config, derived
 *  from connector state (FEAT-20: the card must describe the REAL account). */
interface EmailFacts {
  address: string;
  provider: string;
  walled: boolean;
  status: string;
  midWalk: boolean;
  messages: number;
  sendEnabled: boolean;
}
interface LiveAgentData {
  email: Record<string, EmailFacts>;
  activity: Record<string, string[]>;
}

/** On live builds the email agents' registry copy is demo-persona fiction —
 *  rebuild role/job/plain from the connected account's actual facts. */
function liveEmailOverlay(a: CosAgent, f: EmailFacts): CosAgent {
  const providerName = f.provider === "gmail" ? "Gmail" : "Outlook";
  const lane = f.walled
    ? "WALLED: private — kept out of the public record and default search."
    : "Connected as the public-record lane on this pilot.";
  const send = f.sendEnabled
    ? "Outgoing mail: it transmits only replies a human has approved — behind a master switch and a recipient allowlist."
    : "Read-only: it cannot send.";
  return {
    ...a,
    role: `Mirrors ${f.address} (${providerName}) into the Hub.`,
    job: `Pulls ${f.address} via the ${providerName} API on a rolling sync and mirrors every message into the record — ${f.messages.toLocaleString()} so far${f.midWalk ? ", initial mailbox walk still in progress" : ""}. ${lane} ${send}`,
    produces: f.walled
      ? "The walled private inbox in the Hub."
      : "Your inbox in the Hub — organized, searchable, with a live status card on the Wall.",
    plain: {
      reads: `Email in ${f.address}${f.provider === "gmail" ? ", plus its calendar (read-only)" : ""}. Nothing else.`,
      produces: "Your mail, mirrored into the Hub and kept in sync — the raw material every other agent works from.",
      never: f.sendEnabled
        ? "It never writes or sends anything by itself. The only mail that ever leaves is a reply you personally approved — and a master switch plus a recipient list stand between your approval and the send. It never deletes or edits your mail."
        : "It cannot send, delete, or change any email — the connection is read-only.",
      decides: "You. It watches and reports; anything that touches the outside world needs your approval.",
    },
  };
}

const tone: Record<string, string> = { R1: C.blue, R2: C.orange, R3: C.purpleText, R4: C.green };

// Agents read as Active (in use) or Inactive (not yet in use) — each its own colour.
const isActive = (a: CosAgent) => a.status !== "planned";
function StateBadge({ a, disabled }: { a: CosAgent; disabled?: boolean }) {
  const on = isActive(a) && !disabled;
  const c = on ? C.greenText : C.dim;
  const bg = on ? "rgba(52,201,139,.16)" : "rgba(var(--ink),.08)";
  return (
    <span style={{ ...pill(c, bg), display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: on ? c : "transparent", border: on ? 0 : `1.5px solid ${c}` }} />
      {disabled ? "Disabled" : on ? "Active" : "Inactive"}
    </span>
  );
}

/** The enable switch, upper-right of every card (RD 2026-07-03: disable an
 *  agent from the card — FEAT-19's first in-app config control). A span,
 *  not a button: cards are buttons and can't nest one. */
function EnableSwitch({ on, onFlip }: { on: boolean; onFlip: () => void }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={on ? "Disable this agent" : "Enable this agent"}
      title={on ? "On — tap to disable" : "Off — tap to enable"}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFlip(); }}
      style={{ display: "inline-flex", alignItems: "center", width: 34, height: 20, borderRadius: 99, padding: 2, cursor: "pointer", flexShrink: 0, background: on ? C.green : "rgba(var(--ink),.15)", transition: "background .15s ease" }}
    >
      <span style={{ width: 16, height: 16, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transform: on ? "translateX(14px)" : "translateX(0)", transition: "transform .15s ease" }} />
    </span>
  );
}

/** The in-app cabinet trigger (RD 2026-07-03: agents managed in the app).
 *  Live builds only — runs every active agent once, then reloads so the
 *  Wall picks up the fresh runs. Full-width row so it can't fall off a
 *  narrow screen; flips every card's badge to Running via onRunning. */
function RunAgentsButton({ running, onRunning }: { running: boolean; onRunning: (r: boolean) => void }) {
  const [state, setState] = useState<"idle" | "err" | "done">("idle");
  async function run() {
    if (running) return;
    setState("idle");
    onRunning(true);
    try {
      const r = await fetch("/api/agents/run-now", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "agent run reported failures");
      setState("done");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      console.error("[agents.run]", err instanceof Error ? err.message : err);
      onRunning(false);
      setState("err");
      window.setTimeout(() => setState("idle"), 3000);
    }
  }
  return (
    <button onClick={run} title="Run every active agent once, right now"
      style={{ display: "block", width: "100%", maxWidth: 420, marginTop: 12, cursor: "pointer", padding: "12px 18px", borderRadius: 13, fontWeight: 800, fontSize: 13.5, fontFamily: FONT.sans, border: `1px solid ${state === "err" ? C.red : C.gold}`, background: running ? "rgba(var(--ink),.05)" : "linear-gradient(135deg,#F4CB63,#D7991C)", color: running ? C.text2 : "#081627" }}>
      {running ? "Running agents… (takes a minute)" : state === "done" ? "Done — refreshing" : state === "err" ? "Run failed — see console" : "▶ Run agents now"}
    </button>
  );
}

/** A cabinet desk (domain registry) viewed as a console card — so the gear on
 *  any box lands on a real detail page even before the rosters unify. */
function domainAsCos(key: string): CosAgent | null {
  const d = domainAgentByKey(key);
  if (!d) return null;
  const autonomy = d.autonomy === "draft" ? "R3" : d.autonomy === "suggest" ? "R2" : "R1";
  return {
    key: d.key, name: d.name, autonomy, status: d.active ? "active" : "planned",
    powers: d.domains, role: d.charter.split(". ")[0], job: d.charter,
    produces: d.autonomy === "draft" ? "Cited cabinet digests + draft replies for your approval." : "Cited cabinet digests.",
    plain: {
      reads: `Mail routed to the ${d.name.replace(/ Agent$/, "")} desk${d.walled ? " — its walled, private lane" : ""}. Nothing else.`,
      produces: d.autonomy === "draft" ? "A cited digest on its cabinet card, and draft replies that wait for you." : "A cited digest on its cabinet card.",
      never: "It never sends anything itself, never cites evidence it wasn't given, and never speaks outside its desk.",
      decides: "You.",
    },
    recent: [],
  };
}

export default function AgentsPage({ initialAgentKey }: { initialAgentKey?: string } = {}) {
  // Deep link from a cabinet box's gear (RD 2026-07-05): land directly on
  // that agent's detail. Cabinet desks resolve via the domain registry.
  const [sel, setSel] = useState<CosAgent | null>(() => (initialAgentKey ? agentByKey(initialAgentKey) ?? domainAsCos(initialAgentKey) : null));
  // Running state lifted here so every card can flip its badge to "Running…"
  // while a manual pass is in flight (RD 2026-07-03).
  const [running, setRunning] = useState(false);
  // Section collapse (RD 2026-07-05: "collapsible … for quick reading") —
  // Agents open by default; the other panels start as header + description.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ agents: true, capabilities: false, connectors: false });
  // Enable switches (FEAT-19): absent key = enabled; live builds load the
  // exceptions from app.agent_configs and flips persist + audit there.
  const [configs, setConfigs] = useState<Record<string, boolean>>({});
  // FEAT-20: live facts + real activity ride the same call.
  const [live, setLive] = useState<LiveAgentData>({ email: {}, activity: {} });
  useEffect(() => {
    if (!IS_LIVE_BUILD) return;
    fetch("/api/agents/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { configs?: Record<string, boolean>; email?: Record<string, EmailFacts>; activity?: Record<string, string[]> }) => {
        setConfigs(d.configs ?? {});
        setLive({ email: d.email ?? {}, activity: d.activity ?? {} });
      })
      .catch(() => { /* switches default to on */ });
  }, []);
  // The card describes reality: on live, email agents wear their connected
  // account's facts instead of the demo persona's.
  const effective = (a: CosAgent) => (IS_LIVE_BUILD && live.email[a.key] ? liveEmailOverlay(a, live.email[a.key]) : a);
  const enabledOf = (key: string) => configs[key] !== false;
  const flip = (key: string) => {
    const next = !enabledOf(key);
    setConfigs((c) => ({ ...c, [key]: next })); // optimistic
    fetch("/api/agents/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentKey: key, enabled: next }),
    }).catch(() => setConfigs((c) => ({ ...c, [key]: !next }))); // roll back on failure
  };
  if (sel) return <AgentDetail a={effective(sel)} activity={live.activity[sel.key]} onBack={() => setSel(null)} onOpenAgent={(k) => setSel(agentByKey(k) ?? domainAsCos(k))} />;

  const active = COS_AGENTS.filter((a) => a.status !== "planned").length + DOMAIN_AGENTS.filter((d) => d.active).length;
  const roster = COS_AGENTS.length + DOMAIN_AGENTS.length;
  const actions = COS_AGENTS.reduce((n, a) => n + a.recent.length, 0);
  return (
    <div className="fu" style={{ padding: "30px 20px 56px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={eyebrow(C.dim)}>The Chief of Staff</div>
      <div style={{ fontFamily: FONT.serif, fontSize: 30, fontWeight: 500, color: C.text, lineHeight: 1.05, marginTop: 6 }}>Staff Agents</div>
      <div style={{ fontSize: 14, color: C.text3, marginTop: 7, maxWidth: 660, lineHeight: 1.55 }}>
        The Mayor&rsquo;s team of agents and the work they&rsquo;re doing. The team grows over time — today it handles email; tomorrow it could approve time cards. Agents draft and organize; every action stays a human gate.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 16, marginBottom: 6, alignItems: "center" }}>
        <Metric n={String(active)} label="active agents" />
        <Metric n={String(roster)} label="on the team" />
        <Metric n={IS_LIVE_BUILD ? "—" : String(actions)} label="recent actions" />
      </div>
      {IS_LIVE_BUILD && <RunAgentsButton running={running} onRunning={setRunning} />}

      <UsagePanel />

      {/* Three kinds of staff, three tinted collapsible panels + an index
          (RD 2026-07-05: sections need color/shading, collapsible, with the
          descriptions readable — quick reading first). */}
      {(() => {
        // DEC-13 (RD 2026-07-05): "Agent" means AUTONOMOUS — it runs on its
        // own schedule with a prompt, a task, and skills. Sentinel qualifies;
        // Ask/Drafting/Brief/History are on-demand Capabilities, not agents.
        const sentinel = COS_AGENTS.find((a) => a.key === "sentinel");
        const desks = [
          ...DOMAIN_AGENTS.map((d) => domainAsCos(d.key)).filter((x): x is CosAgent => !!x),
          ...(sentinel ? [sentinel] : []),
        ];
        const SECTIONS = [
          {
            id: "agents", title: "Agents", sub: "autonomous staff", hue: "231,181,60", list: desks,
            blurb: "Autonomous: each runs on its own schedule with a prompt (charter, goals, urgency rules), a task, and skills — all yours to configure. Tap a card to edit its instructions; everything an agent produces is cited, and every action stays human-gated.",
          },
          {
            id: "capabilities", title: "Capabilities", sub: "on-demand abilities", hue: "157,139,255",
            list: COS_AGENTS.filter((a) => !a.key.startsWith("email-") && a.key !== "sentinel"),
            blurb: "Not autonomous — they act when you do: Ask answers your question, Drafting writes when a reply is needed, History assembles on request. They take skills; their base prompts become editable in a coming update.",
          },
          {
            id: "connectors", title: "Connectors", sub: "the plumbing", hue: "103,173,255",
            list: COS_AGENTS.filter((a) => a.key.startsWith("email-")),
            blurb: "They move your mail and calendar into the record and never think. Nothing to instruct — the switch pauses their pulls; the connection itself is managed on Sources.",
          },
        ];
        const toggle = (id: string) => setOpenSections((o) => ({ ...o, [id]: !o[id] }));
        return (
          <>
            {/* the quick-read index */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
              {SECTIONS.map((s) => (
                <button key={s.id} onClick={() => toggle(s.id)}
                  style={{ cursor: "pointer", borderRadius: 99, padding: "7px 14px", fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 700, color: C.text2, background: `rgba(${s.hue},${openSections[s.id] ? ".16" : ".07"})`, border: `1px solid rgba(${s.hue},.4)` }}>
                  {s.title} · {s.list.length}
                </button>
              ))}
            </div>
            {SECTIONS.map((s) => {
              const open = !!openSections[s.id];
              return (
                <div key={s.id} style={{ marginTop: 14, borderRadius: 18, border: `1px solid rgba(${s.hue},.32)`, background: `linear-gradient(180deg, rgba(${s.hue},.07), rgba(${s.hue},.02))`, overflow: "hidden" }}>
                  <button onClick={() => toggle(s.id)} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "14px 16px 4px", background: "none", border: 0, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 11, color: C.text3, transform: open ? "rotate(90deg)" : undefined, transition: "transform .12s ease", flexShrink: 0 }}>▶</span>
                    <span style={{ fontFamily: FONT.serif, fontSize: 19, fontWeight: 700, color: C.text }}>{s.title}</span>
                    <span style={{ fontSize: 12.5, color: C.text3 }}>— {s.sub}</span>
                    <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 11, color: C.text3, flexShrink: 0 }}>{s.list.length}{open ? "" : " · tap to expand"}</span>
                  </button>
                  <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.55, padding: "4px 16px 12px 38px", maxWidth: 780 }}>{s.blurb}</div>
                  {open && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 14, padding: "0 14px 14px" }}>
                      {s.list.map((a) => (
                        <AgentCard key={a.key} a={effective(a)} activity={live.activity[a.key]} running={running} enabled={enabledOf(a.key)}
                          onFlip={IS_LIVE_BUILD ? () => flip(a.key) : undefined} onClick={() => setSel(a)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        );
      })()}

      <div style={{ fontSize: 11.5, color: C.dim, fontFamily: FONT.mono, marginTop: 18 }}>Desk &amp; capability agents are yours to configure · connectors are code, on purpose · every edit is audited.</div>
    </div>
  );
}

function Metric({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: FONT.serif, fontSize: 24, fontWeight: 600, color: C.text }}>{n}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function AgentCard({ a, activity, running, enabled = true, onFlip, onClick }: { a: CosAgent; activity?: string[]; running?: boolean; enabled?: boolean; onFlip?: () => void; onClick: () => void }) {
  const showRunning = running && isActive(a) && enabled;
  return (
    <button onClick={onClick} style={{ ...card, padding: 17, textAlign: "left", color: C.text, cursor: "pointer", display: "block", width: "100%", opacity: !isActive(a) ? 0.62 : enabled ? 1 : 0.45 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{a.name}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {showRunning ? (
            <span style={{ ...pill("#0a1322", C.gold), fontWeight: 800, animation: "cosPulse 1.2s ease-in-out infinite" }}>Running…</span>
          ) : (
            <StateBadge a={a} disabled={!enabled} />
          )}
          {onFlip && <EnableSwitch on={enabled} onFlip={onFlip} />}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5, marginBottom: 11 }}>{a.role}</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 11 }}>
        <span style={{ ...pill(tone[a.autonomy], "rgba(var(--ink),.07)"), fontWeight: 700 }}>{a.autonomy}</span>
        <span style={pill(C.muted, "rgba(var(--ink),.06)")}>{a.powers.join(" · ")}</span>
      </div>
      <div style={{ borderTop: "1px solid var(--c-cardbd)", paddingTop: 10 }}>
        <div style={{ ...eyebrow(C.dim2), fontSize: 9.5, marginBottom: 6 }}>Recent activity</div>
        {IS_LIVE_BUILD ? (
          activity?.length ? (
            <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {activity[0]}</div>
          ) : (
            <div style={{ fontSize: 12.5, color: C.dim }}>{LIVE_ACTIVITY_NOTE}</div>
          )
        ) : a.recent.length ? (
          <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {a.recent[0]}</div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.dim }}>No activity yet — planned.</div>
        )}
        <div style={{ fontSize: 12, color: C.gold, fontWeight: 600, marginTop: 9 }}>View activity →</div>
      </div>
    </button>
  );
}

function AgentDetail({ a, activity, onBack, onOpenAgent }: { a: CosAgent; activity?: string[]; onBack: () => void; onOpenAgent?: (key: string) => void }) {
  return (
    <div className="fu" style={{ padding: "24px 20px 56px", maxWidth: 760, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(var(--ink),.05)", border: "1px solid var(--c-cardbd)", borderRadius: 99, padding: "7px 14px", cursor: "pointer", color: C.text2, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, marginBottom: 18 }}>← All agents</button>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 26, fontWeight: 500, color: C.text }}>{a.name}</span>
        <StateBadge a={a} />
      </div>
      <div style={{ fontSize: 14, color: C.text2, marginTop: 7, lineHeight: 1.55 }}>{a.role}</div>

      {/* FEAT-20 — the four questions, in household English, before anything
          technical. This is the card that reduces the fear of agents. */}
      <div style={{ ...card, padding: "6px 17px", marginTop: 18, borderColor: "rgba(231,181,60,.35)" }}>
        <div style={{ ...eyebrow(C.gold), fontSize: 10, margin: "12px 0 2px" }}>In plain English</div>
        <PlainRow q="What does it read?" a={a.plain.reads} />
        <PlainRow q="What does it produce?" a={a.plain.produces} />
        <PlainRow q="What can it never do?" a={a.plain.never} />
        <PlainRow q="Who decides?" a={a.plain.decides} last />
      </div>

      <div style={{ ...card, padding: 17, marginTop: 14, display: "grid", gap: 11 }}>
        <Field k="What it does" v={a.job} />
        <Field k="Autonomy" v={<span><span style={{ ...pill(tone[a.autonomy], "rgba(var(--ink),.07)"), fontWeight: 700, marginRight: 7 }}>{a.autonomy}</span>{AUTONOMY_LABEL[a.autonomy]}</span>} />
        <Field k="Serves" v={a.powers.join(" · ")} />
        <Field k="Produces" v={a.produces} />
        {a.spec && <Field k="Full spec" v={<span>Defined in <code style={{ fontFamily: FONT.mono, fontSize: 12, color: C.gold }}>{a.spec}</code> — versioned in the repo, not the UX.</span>} />}
      </div>

      {IS_LIVE_BUILD && <InstructionsSection agentKey={a.key} onOpenAgent={onOpenAgent} />}
      {IS_LIVE_BUILD && <SkillsSection agentKey={a.key} />}

      <div style={{ ...eyebrow(C.dim), marginTop: 22, marginBottom: 11 }}>Recent activity</div>
      {IS_LIVE_BUILD ? (
        activity?.length ? (
          <div style={{ ...card, overflow: "hidden" }}>
            {activity.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: i < activity.length - 1 ? "1px solid var(--c-cardbd)" : undefined, alignItems: "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: tone[a.autonomy], flexShrink: 0, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>{line}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...card, padding: 24, textAlign: "center", color: C.dim, fontSize: 13 }}>{LIVE_ACTIVITY_NOTE}</div>
        )
      ) : a.recent.length ? (
        <div style={{ ...card, overflow: "hidden" }}>
          {a.recent.map((r, i) => {
            const [text, time] = r.split(" · ");
            return (
              <div key={i} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: i < a.recent.length - 1 ? "1px solid var(--c-cardbd)" : undefined, alignItems: "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: tone[a.autonomy], flexShrink: 0, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>{text}</div>
                  {time && <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, marginTop: 2 }}>{time}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...card, padding: 24, textAlign: "center", color: C.dim, fontSize: 13 }}>No activity yet — this agent is planned. Configured in Claude Code when ready.</div>
      )}
    </div>
  );
}

/** FEAT-19 slice 2 — the agent's PROMPT, editable by the end user (RD
 *  2026-07-05: "this needs to be configured on the Agent Card and stored in
 *  the database, not hard-coded"). Charter, goals, and the urgency directives
 *  ("these types of emails are ALWAYS urgent") load from the code registry as
 *  defaults; edits land in app.agent_configs.overrides, beat the defaults at
 *  run time, and are audited. Autonomy is deliberately not editable here. */
function InstructionsSection({ agentKey, onOpenAgent }: { agentKey: string; onOpenAgent?: (key: string) => void }) {
  const d = domainAgentByKey(agentKey);
  const [charter, setCharter] = useState("");
  const [goals, setGoals] = useState("");
  const [urgency, setUrgency] = useState("");
  const [edited, setEdited] = useState(false); // an override row exists
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "err">("loading");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    fetch("/api/agents/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((cfg: { overrides?: Record<string, { charter?: string; goals?: string[]; urgencyRules?: string }> }) => {
        const ov = cfg.overrides?.[agentKey] ?? {};
        setCharter(ov.charter ?? d.charter);
        setGoals((ov.goals ?? d.goals).join("\n"));
        setUrgency(ov.urgencyRules ?? d.urgencyRules);
        setEdited(!!(ov.charter || ov.goals || ov.urgencyRules));
        setState("idle");
      })
      .catch(() => { setCharter(d.charter); setGoals(d.goals.join("\n")); setUrgency(d.urgencyRules); setState("idle"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  // Connector agents (Gmail/Outlook) don't run a prompt — they mirror mail.
  // Say so honestly and point to the desks that DO read this mail and can be
  // instructed (RD 2026-07-05: "I don't see where to update the prompt").
  if (!d) {
    const desks = DOMAIN_AGENTS.filter((x) => x.active);
    return (
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: FONT.serif, fontSize: 17, fontWeight: 700, color: C.text }}>Instructions</span>
        </div>
        <div style={{ ...card, padding: 15 }}>
          <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.6 }}>
            This agent mirrors your mailbox — it runs no prompt, so there is nothing to instruct here.
            The mail it brings in is read by the <b>desk agents</b> below; each of those carries an
            editable prompt (charter, goals, and your urgency rules — e.g. &ldquo;emails about water
            main breaks are always urgent&rdquo;).
          </div>
          {onOpenAgent && (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
              {desks.map((x) => (
                <button key={x.key} onClick={() => onOpenAgent(x.key)} style={{ cursor: "pointer", border: `1px solid ${C.line}`, background: "rgba(var(--ink),.05)", borderRadius: 99, padding: "7px 14px", color: C.text2, fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans }}>
                  {x.name.replace(/ Agent$/, "")} →
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const save = async (reset: boolean) => {
    setState("saving"); setErr(null);
    try {
      const overrides = reset ? null : { charter, goals: goals.split("\n").map((g) => g.trim()).filter(Boolean), urgencyRules: urgency };
      const r = await fetch("/api/agents/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentKey, overrides }) });
      const dta = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dta.error || "save failed");
      if (reset) { setCharter(d.charter); setGoals(d.goals.join("\n")); setUrgency(d.urgencyRules); }
      setEdited(!reset);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1800);
    } catch (e) { setErr(e instanceof Error ? e.message : "save failed"); setState("err"); }
  };

  const area = (v: string, set: (s: string) => void, rows: number, ph: string) => (
    <textarea value={v} onChange={(e) => set(e.target.value)} rows={rows} placeholder={ph} disabled={state === "loading" || state === "saving"}
      style={{ width: "100%", boxSizing: "border-box", background: "rgba(var(--ink),.04)", border: "1px solid var(--c-cardbd)", borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13.5, lineHeight: 1.55, fontFamily: FONT.sans, resize: "vertical" }} />
  );
  const label = (t: string, hint?: string) => (
    <div style={{ marginBottom: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{t}</span>
      {hint && <span style={{ fontSize: 11.5, color: C.text3, marginLeft: 8 }}>{hint}</span>}
    </div>
  );

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 17, fontWeight: 700, color: C.text }}>Instructions</span>
        <span style={{ fontSize: 12, color: C.text3 }}>the prompt this agent runs with — yours to edit</span>
        <span style={{ ...pill(edited ? C.goldHi : C.muted, edited ? "rgba(231,181,60,.14)" : "rgba(var(--ink),.06)"), fontSize: 9.5, fontWeight: 800 }}>{edited ? "EDITED" : "DEFAULT"}</span>
      </div>
      <div style={{ ...card, padding: 15, display: "grid", gap: 13 }}>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, borderLeft: `3px solid ${C.gold}`, paddingLeft: 12 }}>
          This is the exact material this agent is given before every run. <b>The default prompt is
          loaded below</b> — copy it, edit any part, and <b>Save</b>; your version takes effect on the
          agent&rsquo;s next run. <b>Reset to default</b> discards your edits and restores the original.
          The <b>Urgency rules</b> box is where your standing directives live — for example:
          &ldquo;Any email about a water main break is ALWAYS urgent.&rdquo;
        </div>
        <div>
          {label("Charter", "who this agent is and what its desk covers")}
          {area(charter, setCharter, 3, "The agent's role, in prose…")}
        </div>
        <div>
          {label("Goals", "one per line")}
          {area(goals, setGoals, 4, "- Track every open constituent issue…")}
        </div>
        <div>
          {label("Urgency rules", "what is ALWAYS red or yellow on this desk — e.g. “Any email about a water main break is always urgent”")}
          {area(urgency, setUrgency, 4, "Red: … Yellow: …")}
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <button disabled={state === "saving" || state === "loading"} onClick={() => save(false)}
            style={{ cursor: "pointer", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 13, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}>
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save instructions"}
          </button>
          <button disabled={state === "saving" || state === "loading" || !edited} onClick={() => save(true)}
            style={{ cursor: "pointer", background: "rgba(var(--ink),.06)", border: "1px solid var(--c-cardbd)", borderRadius: 10, padding: "10px 14px", color: C.text3, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, opacity: edited ? 1 : 0.5 }}>
            Reset to default
          </button>
          {err && <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{err}</span>}
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.dim, textAlign: "center" }}>
          takes effect on the agent&rsquo;s next run · every edit audited · autonomy &amp; the human gate are not editable
        </div>
      </div>
    </div>
  );
}

/** FEAT-21 — Skills on the agent console (RD 2026-07-05: "skills are the way
 *  to have specific rules for each agent; the skill.md is uploaded from the
 *  UX"). Upload a markdown file, attach/detach existing skills; the runner
 *  injects attached content into this agent's prompt. Live builds only. */
interface SkillRow { skillId: string; name: string; kind: string; version: number; updatedAt: string; chars: number; attached: boolean }

function SkillsSection({ agentKey }: { agentKey: string }) {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`/api/agents/skills?agent=${encodeURIComponent(agentKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { skills?: SkillRow[] }) => setSkills(d.skills ?? []))
      .catch(() => setSkills([]));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [agentKey]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/agents/skills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "request failed");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); } finally { setBusy(false); }
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      const name = f.name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]/g, " ").trim() || f.name;
      void post({ action: "upload", name, content, agentKey });
    };
    reader.readAsText(f);
  };

  const attached = (skills ?? []).filter((s) => s.attached);
  const others = (skills ?? []).filter((s) => !s.attached);
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 17, fontWeight: 700, color: C.text }}>Skills</span>
        <span style={{ fontSize: 12, color: C.text3 }}>rules this agent follows — uploaded, versioned, audited</span>
      </div>
      <div style={{ ...card, padding: 15, display: "grid", gap: 10 }}>
        {skills === null && <div style={{ fontSize: 12.5, color: C.dim }}>Loading skills…</div>}
        {skills !== null && attached.length === 0 && <div style={{ fontSize: 12.5, color: C.dim }}>No skills attached yet. Upload a skill.md below — e.g. a voice guide or drafting rules.</div>}
        {attached.map((s) => (
          <div key={s.skillId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            <span style={{ ...pill(C.muted, "rgba(var(--ink),.06)"), fontSize: 10 }}>{s.kind} · v{s.version} · {(s.chars / 1000).toFixed(1)}k</span>
            <button disabled={busy} onClick={() => post({ action: "detach", skillId: s.skillId, agentKey })} style={{ cursor: "pointer", background: "rgba(var(--ink),.06)", border: "1px solid var(--c-cardbd)", borderRadius: 8, padding: "5px 11px", color: C.text3, fontSize: 11.5, fontWeight: 600, fontFamily: FONT.sans }}>Detach</button>
          </div>
        ))}
        {others.length > 0 && (
          <div style={{ borderTop: "1px solid var(--c-cardbd)", paddingTop: 10, display: "grid", gap: 8 }}>
            <div style={{ ...eyebrow(C.dim2), fontSize: 9 }}>In the library, not attached here</div>
            {others.map((s) => (
              <div key={s.skillId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: C.text2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <button disabled={busy} onClick={() => post({ action: "attach", skillId: s.skillId, agentKey })} style={{ cursor: "pointer", background: "rgba(52,201,139,.12)", border: "1px solid rgba(52,201,139,.35)", borderRadius: 8, padding: "5px 11px", color: C.greenText, fontSize: 11.5, fontWeight: 700, fontFamily: FONT.sans }}>Attach</button>
              </div>
            ))}
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1.5px dashed rgba(var(--ink),.28)", borderRadius: 11, padding: "12px 14px", cursor: "pointer", color: C.text2, fontSize: 13, fontWeight: 700, fontFamily: FONT.sans }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>⇪</span> {busy ? "Working…" : "Upload skill (.md)"}
          <input type="file" accept=".md,.markdown,.txt" style={{ display: "none" }} disabled={busy}
            onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
        {err && <div style={{ fontSize: 12, color: C.redText ?? C.red, fontWeight: 600 }}>{err}</div>}
        <div style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.dim, textAlign: "center" }}>skills shape voice &amp; judgment · they can never send, delete, or override the human gate</div>
      </div>
    </div>
  );
}

/** One question-and-answer row of the plain-English card (FEAT-20). */
function PlainRow({ q, a, last }: { q: string; a: string; last?: boolean }) {
  return (
    <div style={{ padding: "11px 0", borderBottom: last ? 0 : "1px solid var(--c-cardbd)" }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 600, color: C.text }}>{q}</div>
      <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.6, marginTop: 4 }}>{a}</div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span style={{ flex: "0 0 92px", fontFamily: FONT.mono, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: C.dim }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text2, lineHeight: 1.55 }}>{v}</span>
    </div>
  );
}
