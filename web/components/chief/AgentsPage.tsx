"use client";
/*
 * AgentsPage — "Staff Agents": the landing page to SHOW and TRACK the Mayor's
 * team of agents and the work they do. Read-only UX view — agents are configured
 * and tested in Claude Code, not here. Click an agent to see its recent activity.
 * The team is open-ended: today it's email; tomorrow it could be approving time cards.
 */
import { useEffect, useState } from "react";
import VoiceSkillCard from "./VoiceSkillCard";
import { P, SANS, WorkingTheater } from "./DashboardHub";
import { AgentAvatar } from "./AgentBadge";
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

/* dashboard-system card (RD 2026-07-22): white, navy border, soft shadow */
const dashCard: React.CSSProperties = {
  background: P.card, border: `1px solid ${P.border}`, borderRadius: 14,
  boxShadow: "0 1px 3px rgba(30,30,30,.05)",
};

/** The section language of the staff pages (RD 2026-07-05): every section is
 *  a tinted panel with a serif header — color is the separator. */
const panelStyle = (hue: string): React.CSSProperties => ({
  marginTop: 16, borderRadius: 16, border: `1px solid ${P.border}`,
  borderTop: `3px solid rgba(${hue},.85)`,
  background: P.card, boxShadow: "0 1px 3px rgba(30,30,30,.05)",
  padding: "14px 16px",
});
function PanelHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>{title}</span>
      {sub && <span style={{ fontSize: 12, color: C.text3 }}>{sub}</span>}
    </div>
  );
}
const HUE = { plain: "231,181,60", profile: "103,173,255", instructions: "157,139,255", skills: "52,201,139", activity: "128,140,155" };

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
  // the working theater (RD 2026-07-22): while the fleet runs, show data
  // collection + each desk's REAL completion (its run timestamp advancing).
  const [roster, setRoster] = useState<{ key: string; name: string }[]>([]);
  const [filed, setFiled] = useState<Set<string>>(new Set());
  const pollRef = useState<{ t?: number }>({})[0];
  async function pollProgress(startedAt: number) {
    try {
      const r = await fetch(`/api/wall?hour=${new Date().getHours()}`);
      if (!r.ok) return;
      const w = (await r.json()) as { cabinet?: { agentKey: string; name: string }[]; runs?: Record<string, { ranAt: string }> };
      if (!roster.length && w.cabinet?.length) setRoster(w.cabinet.map((c) => ({ key: c.agentKey, name: c.name.replace(/ Agent$/, "") })));
      const done = new Set<string>();
      for (const [k, run] of Object.entries(w.runs ?? {})) {
        if (new Date(run.ranAt).getTime() > startedAt) done.add(k);
      }
      setFiled(done);
    } catch { /* keep last */ }
  }
  async function run() {
    if (running) return;
    setState("idle");
    onRunning(true);
    const startedAt = Date.now();
    setFiled(new Set());
    void pollProgress(startedAt);
    pollRef.t = window.setInterval(() => void pollProgress(startedAt), 5000);
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
    } finally {
      if (pollRef.t) window.clearInterval(pollRef.t);
    }
  }
  return (
    <>
    <button onClick={run} title="Run every active agent once, right now"
      style={{ display: "block", width: "100%", maxWidth: 420, marginTop: 12, cursor: "pointer", padding: "12px 18px", borderRadius: 13, fontWeight: 800, fontSize: 13.5, fontFamily: FONT.sans, border: `1px solid ${state === "err" ? C.red : C.gold}`, background: running ? "rgba(var(--ink),.05)" : "linear-gradient(135deg,#F4CB63,#D7991C)", color: running ? C.text2 : "#081627" }}>
      {running ? "Running agents… (takes a minute)" : state === "done" ? "Done — refreshing" : state === "err" ? "Run failed — see console" : "▶ Run agents now"}
    </button>
    {running && (
      <div style={{ ...dashCard, marginTop: 10, maxWidth: 560, overflow: "hidden" }}>
        <WorkingTheater agentKeys={roster.map((r) => r.key)} caption="Collecting new mail and the record — each desk files its report as it finishes." />
        <div style={{ padding: "0 18px 14px", display: "grid", gap: 7 }}>
          {roster.map((a) => {
            const done = filed.has(a.key);
            return (
              <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ borderRadius: 99, animation: done ? undefined : "dashPulseRing 1.4s ease-out infinite" }}>
                  <AgentAvatar agentKey={a.key} size={19} />
                </span>
                <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: P.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, color: done ? "#1E7B45" : P.text3 }}>
                  {done ? "✓ filed" : "working…"}
                </span>
              </div>
            );
          })}
          {roster.length === 0 && <span style={{ fontFamily: SANS, fontSize: 12, color: P.text3 }}>Waking the desks…</span>}
        </div>
      </div>
    )}
    </>
  );
}

/** Agents CREATED in the app (app.agents) — they exist only in the database, so
 *  the client has to fetch them. Cached at module scope: the gear on a created
 *  agent's card deep-links straight into its detail, and that initial useState
 *  runs before any effect could have loaded them. Populated on first mount and
 *  refreshed whenever the page mounts. */
export interface CreatedAgent {
  key: string; name: string; icon: string; color: string;
  instruction: string; focusQuery: string | null;
  autonomy: "observe" | "suggest" | "draft"; mailbox: "gov" | "biz"; active: boolean;
}
let CREATED: CreatedAgent[] = [];
export const createdByKey = (k: string): CreatedAgent | undefined => CREATED.find((a) => a.key === k);

/** A created agent viewed as a console card, so the gear lands on a real
 *  detail page exactly as it does for a built-in desk. */
function createdAsCos(key: string): CosAgent | null {
  const a = createdByKey(key);
  if (!a) return null;
  const autonomy = a.autonomy === "draft" ? "R3" : a.autonomy === "suggest" ? "R2" : "R1";
  return {
    key: a.key, name: a.name, autonomy, status: a.active ? "active" : "planned",
    powers: [], role: a.instruction.split(". ")[0], job: a.instruction,
    produces: a.autonomy === "draft" ? "Cited digests + draft replies for your approval." : "Cited digests.",
    plain: {
      reads: a.focusQuery
        ? `Records matching \u201c${a.focusQuery}\u201d across the whole archive${a.mailbox === "biz" ? ", in the walled private lane" : ""}.`
        : "New mail only \u2014 no search query could be derived from its instruction yet.",
      produces: "A cited digest on its agent card.",
      never: "It never sends anything itself and never cites evidence it wasn't given.",
      decides: "You.",
    },
    recent: [],
  };
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
    produces: d.autonomy === "draft" ? "Cited digests + draft replies for your approval." : "Cited digests.",
    plain: {
      reads: `Mail routed to the ${d.name.replace(/ Agent$/, "")} desk${d.walled ? " — its walled, private lane" : ""}. Nothing else.`,
      produces: d.autonomy === "draft" ? "A cited digest on its agent card, and draft replies that wait for you." : "A cited digest on its agent card.",
      never: "It never sends anything itself, never cites evidence it wasn't given, and never speaks outside its desk.",
      decides: "You.",
    },
    recent: [],
  };
}

export default function AgentsPage({ initialAgentKey, initialSection }: { initialAgentKey?: string; initialSection?: string } = {}) {
  // Deep link from a cabinet box's gear (RD 2026-07-05): land directly on
  // that agent's detail. Cabinet desks resolve via the domain registry.
  const [sel, setSel] = useState<CosAgent | null>(() => (initialAgentKey ? agentByKey(initialAgentKey) ?? domainAsCos(initialAgentKey) ?? createdAsCos(initialAgentKey) : null));
  void initialSection; // consumed in the openSections initializer below
  // Running state lifted here so every card can flip its badge to "Running…"
  // while a manual pass is in flight (RD 2026-07-03).
  const [running, setRunning] = useState(false);
  // Load agents created in the app. If the gear deep-linked to one before the
  // fetch landed, `sel` is null — resolve it once the list arrives rather than
  // dumping the operator on the roster with no explanation.
  const [createdTick, setCreatedTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/agents/create")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.agents) return;
        CREATED = j.agents as CreatedAgent[];
        setCreatedTick((n) => n + 1);
        if (initialAgentKey) setSel((cur) => cur ?? createdAsCos(initialAgentKey));
      })
      .catch(() => {/* built-in desks still render */});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Section collapse (RD 2026-07-05: "collapsible … for quick reading") —
  // Agents open by default; the nav sub-menu targets one section directly.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    initialSection
      ? { agents: initialSection === "agents", capabilities: initialSection === "capabilities", connectors: initialSection === "connectors" }
      : { agents: true, capabilities: false, connectors: false },
  );
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
  if (sel) return <AgentDetail a={effective(sel)} activity={live.activity[sel.key]} onBack={() => setSel(null)} onOpenAgent={(k) => setSel(agentByKey(k) ?? domainAsCos(k) ?? createdAsCos(k))} />;

  const active = COS_AGENTS.filter((a) => a.status !== "planned").length + DOMAIN_AGENTS.filter((d) => d.active).length;
  const roster = COS_AGENTS.length + DOMAIN_AGENTS.length;
  const actions = COS_AGENTS.reduce((n, a) => n + a.recent.length, 0);
  return (
    <div className="fu" style={{ padding: "30px 20px 56px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={eyebrow(C.dim)}>The Chief of Staff</div>
      <div style={{ fontFamily: SANS, fontSize: 26, fontWeight: 800, color: P.text, lineHeight: 1.05, marginTop: 6, letterSpacing: "-.01em" }}>Staff Agents</div>
      <div style={{ fontSize: 14, color: C.text3, marginTop: 7, maxWidth: 660, lineHeight: 1.55 }}>
        The Mayor&rsquo;s team of agents and the work they&rsquo;re doing. The team grows over time — today it handles email; tomorrow it could approve time cards. Agents draft and organize; every action stays a human gate.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 16, marginBottom: 6, alignItems: "center" }}>
        <Metric n={String(active)} label="active agents" />
        <Metric n={String(roster)} label="on the team" />
        <Metric n={IS_LIVE_BUILD ? "—" : String(actions)} label="recent actions" />
      </div>
      {IS_LIVE_BUILD && <RunAgentsButton running={running} onRunning={setRunning} />}

      {/* THE place to upload your voice (RD 2026-07-22) — the foundation of
          auto-respond; one upload covers every drafting desk. */}
      {IS_LIVE_BUILD && <VoiceSkillCard />}

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
                    <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 800, color: P.text }}>{s.title}</span>
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
      <div style={{ fontFamily: SANS, fontSize: 26, fontWeight: 800, color: P.text }}>{n}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function AgentCard({ a, activity, running, enabled = true, onFlip, onClick }: { a: CosAgent; activity?: string[]; running?: boolean; enabled?: boolean; onFlip?: () => void; onClick: () => void }) {
  const showRunning = running && isActive(a) && enabled;
  return (
    <button onClick={onClick} style={{ ...dashCard, padding: 17, textAlign: "left", color: C.text, cursor: "pointer", display: "block", width: "100%", opacity: !isActive(a) ? 0.62 : enabled ? 1 : 0.45 }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SANS, fontSize: 23, fontWeight: 800, color: P.text }}>{a.name}</span>
        <StateBadge a={a} />
        {/* see the agent → EDIT the agent (RD 2026-07-21): the editor lives
            further down this page; this is the obvious door to it. */}
        {IS_LIVE_BUILD && (
          <button
            onClick={() => { document.getElementById("agent-edit")?.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => document.querySelector<HTMLTextAreaElement>("#agent-edit textarea")?.focus(), 450); }}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", border: 0, borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 13, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}
          >
            ✎ Edit instructions
          </button>
        )}
      </div>
      <div style={{ fontSize: 14, color: C.text2, marginTop: 7, lineHeight: 1.55 }}>{a.role}</div>

      {/* FEAT-20 — the four questions, in household English, before anything
          technical. This is the card that reduces the fear of agents. */}
      <div style={panelStyle(HUE.plain)}>
        <PanelHead title="In plain English" sub="the four questions everyone should be able to answer" />
        <PlainRow q="What does it read?" a={a.plain.reads} />
        <PlainRow q="What does it produce?" a={a.plain.produces} />
        <PlainRow q="What can it never do?" a={a.plain.never} />
        <PlainRow q="Who decides?" a={a.plain.decides} last />
      </div>

      <div style={panelStyle(HUE.profile)}>
        <PanelHead title="Profile" sub="the technical card" />
        <div style={{ display: "grid", gap: 11 }}>
          <Field k="What it does" v={a.job} />
          <Field k="Autonomy" v={<span><span style={{ ...pill(tone[a.autonomy], "rgba(var(--ink),.07)"), fontWeight: 700, marginRight: 7 }}>{a.autonomy}</span>{AUTONOMY_LABEL[a.autonomy]}</span>} />
          <Field k="Serves" v={a.powers.join(" · ")} />
          <Field k="Produces" v={a.produces} />
          {a.spec && <Field k="Full spec" v={<span>Defined in <code style={{ fontFamily: FONT.mono, fontSize: 12, color: C.gold }}>{a.spec}</code> — versioned in the repo, not the UX.</span>} />}
        </div>
      </div>

      {IS_LIVE_BUILD && <div id="agent-edit"><InstructionsSection agentKey={a.key} onOpenAgent={onOpenAgent} /></div>}
      {IS_LIVE_BUILD && <SkillsSection agentKey={a.key} />}

      <div style={panelStyle(HUE.activity)}>
      <PanelHead title="Recent activity" sub="what this one has actually done" />
      {IS_LIVE_BUILD ? (
        activity?.length ? (
          <div style={{ ...dashCard, overflow: "hidden" }}>
            {activity.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: i < activity.length - 1 ? "1px solid var(--c-cardbd)" : undefined, alignItems: "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: tone[a.autonomy], flexShrink: 0, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>{line}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...dashCard, padding: 24, textAlign: "center", color: C.dim, fontSize: 13 }}>{LIVE_ACTIVITY_NOTE}</div>
        )
      ) : a.recent.length ? (
        <div style={{ ...dashCard, overflow: "hidden" }}>
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
        <div style={{ ...dashCard, padding: 24, textAlign: "center", color: C.dim, fontSize: 13 }}>No activity yet — this agent is planned. Configured in Claude Code when ready.</div>
      )}
      </div>
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
  // A CREATED agent stores its instruction on its own row (app.agents), not in
  // app.agent_configs.overrides. Same box, different endpoint — the operator
  // should not be able to tell which kind of agent they are editing.
  const created = createdByKey(agentKey);
  const [charter, setCharter] = useState("");
  const [goals, setGoals] = useState("");
  const [urgency, setUrgency] = useState("");
  const [instruction, setInstruction] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [focus, setFocus] = useState("");
  const [edited, setEdited] = useState(false); // an override row exists
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "err">("loading");
  const [err, setErr] = useState<string | null>(null);
  // Focus preview: what this instruction actually pulls out of the archive.
  // Shown BEFORE the operator trusts a digest built on it.
  type Hit = { messageId: string; date: string; from: string; subject: string; snippet: string; score: number };
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [pv, setPv] = useState<"idle" | "running" | "err">("idle");
  const [pvErr, setPvErr] = useState<string | null>(null);

  useEffect(() => {
    if (created) {
      setInstruction(created.instruction);
      setEdited(true);
      setState("idle");
      return;
    }
    if (!d) return;
    fetch("/api/agents/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((cfg: { overrides?: Record<string, { instruction?: string; charter?: string; goals?: string[]; urgencyRules?: string; focus?: string }> }) => {
        const ov = cfg.overrides?.[agentKey] ?? {};
        setCharter(ov.charter ?? d.charter);
        setGoals((ov.goals ?? d.goals).join("\n"));
        setUrgency(ov.urgencyRules ?? d.urgencyRules);
        setInstruction(ov.instruction ?? "");
        setFocus(ov.focus ?? "");
        setEdited(!!(ov.instruction || ov.charter || ov.goals || ov.urgencyRules || ov.focus));
        setState("idle");
      })
      .catch(() => { setCharter(d.charter); setGoals(d.goals.join("\n")); setUrgency(d.urgencyRules); setState("idle"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  // Connector agents (Gmail/Outlook) don't run a prompt — they mirror mail.
  // Say so honestly and point to the desks that DO read this mail and can be
  // instructed (RD 2026-07-05: "I don't see where to update the prompt").
  if (!d && !created) {
    const desks = DOMAIN_AGENTS.filter((x) => x.active);
    return (
      <div style={panelStyle(HUE.instructions)}>
        <PanelHead title="Instructions" />
        <div>
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
      if (created) {
        // Reset means "clear my edits back to the registry default" — a created
        // agent HAS no registry default, so there is nothing to reset to.
        if (reset) { setState("idle"); return; }
        const r = await fetch("/api/agents/create", {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: agentKey, instruction }),
        });
        const dta = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dta.error || "save failed");
        created.instruction = instruction;
        created.focusQuery = dta.focusQuery ?? null;
        setState("saved");
        window.setTimeout(() => setState("idle"), 1800);
        return;
      }
      const overrides = reset
        ? null
        : { instruction, ...(advanced ? { charter, goals: goals.split("\n").map((g) => g.trim()).filter(Boolean), urgencyRules: urgency, focus } : {}) };
      const r = await fetch("/api/agents/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentKey, overrides }) });
      const dta = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dta.error || "save failed");
      // `d` is defined on this path: the created-agent branch returned above,
      // and the !d && !created guard rendered instead.
      if (reset && d) { setInstruction(""); setCharter(d.charter); setGoals(d.goals.join("\n")); setUrgency(d.urgencyRules); setFocus(""); setHits(null); }
      setEdited(!reset);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1800);
    } catch (e) { setErr(e instanceof Error ? e.message : "save failed"); setState("err"); }
  };

  /** Run the same retrieval the agent will run — no model, no writes — so the
   *  operator sees what the instruction matches before a digest depends on it. */
  const preview = async () => {
    setPv("running"); setPvErr(null);
    try {
      const r = await fetch("/api/agents/focus-preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentKey, focus: instruction }),
      });
      const dta = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dta.error || "preview failed");
      setHits(dta.hits ?? []);
      setPv("idle");
    } catch (e) { setPvErr(e instanceof Error ? e.message : "preview failed"); setPv("err"); }
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
    <div style={panelStyle(HUE.instructions)}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>Instructions</span>
        <span style={{ fontSize: 12, color: C.text3 }}>the prompt this agent runs with — yours to edit</span>
        <span style={{ ...pill(edited ? C.goldHi : C.muted, edited ? "rgba(231,181,60,.14)" : "rgba(var(--ink),.06)"), fontSize: 9.5, fontWeight: 800 }}>{edited ? "EDITED" : "DEFAULT"}</span>
      </div>
      <div style={{ display: "grid", gap: 13 }}>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, borderLeft: `3px solid ${C.gold}`, paddingLeft: 12 }}>
          This is the exact material this agent is given before every run. <b>The default prompt is
          loaded below</b> — copy it, edit any part, and <b>Save</b>; your version takes effect on the
          agent&rsquo;s next run. <b>Reset to default</b> discards your edits and restores the original.
          The <b>Urgency rules</b> box is where your standing directives live — for example:
          &ldquo;Any email about a water main break is ALWAYS urgent.&rdquo;
        </div>
        {/* ONE BOX. Four fields (charter / goals / urgency / focus) meant learning
            a taxonomy before you could configure anything, and nobody prompting
            Claude learns one (RD 2026-07-18: "you should be able to prompt the
            agent like you would prompt Claude normally"). Everything else moves
            behind Advanced. */}
        <div>
          {label("What should this agent do?", "plain English — the way you'd brief a person")}
          {area(instruction, setInstruction, 5, "e.g. Watch for anything security-related from Google — sign-in alerts, breached passwords, suspicious activity. Tell me which ones are a real risk and what to do about each. Ignore marketing and billing.")}
          <div style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 9, flexWrap: "wrap" }}>
            <button disabled={pv === "running" || !instruction.trim()} onClick={preview}
              style={{ cursor: instruction.trim() ? "pointer" : "default", background: "rgba(var(--ink),.06)", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 13px", color: C.text2, fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans, opacity: instruction.trim() ? 1 : 0.5 }}>
              {pv === "running" ? "Searching…" : "Preview what this finds"}
            </button>
            {pvErr && <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{pvErr}</span>}
            {hits && !pvErr && (
              <span style={{ fontSize: 12, color: C.text3 }}>
                {hits.length
                  ? `${hits.length} record${hits.length === 1 ? "" : "s"} matched`
                  : "nothing in the record matched — try naming a specific thing"}
              </span>
            )}
          </div>
          {hits && hits.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {hits.map((h) => (
                <div key={h.messageId} style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: 12.5, color: C.text2, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, flexShrink: 0 }}>{h.date.slice(0, 10)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <b style={{ color: C.text }}>{h.subject}</b> · {h.from}
                  </span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, flexShrink: 0 }}>{h.score.toFixed(2)}</span>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.5, marginTop: 3 }}>
                These are the records the agent will reason over. If they look wrong, reword the
                instruction — matching is by meaning, not keywords. Abstract wording
                (&ldquo;anything important&rdquo;) retrieves poorly; name a thing you could search for.
              </div>
            </div>
          )}
        </div>

        {/* Advanced: the original fields, for anyone who wants them. */}
        <button
          onClick={() => setAdvanced((a) => !a)}
          style={{ cursor: "pointer", background: "none", border: 0, padding: 0, textAlign: "left", color: C.text3, fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans, display: "flex", alignItems: "center", gap: 7 }}
        >
          <span style={{ display: "inline-block", transform: advanced ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>&rsaquo;</span>
          Advanced — charter, goals, urgency rules
        </button>

        {advanced && <div>
          {label("Charter", "who this agent is and what its desk covers")}
          {area(charter, setCharter, 3, "The agent's role, in prose…")}
        </div>}
        {advanced && <div>
          {label("Goals", "one per line")}
          {area(goals, setGoals, 4, "- Track every open constituent issue…")}
        </div>}
        {advanced && <div>
          {label("Urgency rules", "what is ALWAYS red or yellow on this desk — e.g. “Any email about a water main break is always urgent”")}
          {area(urgency, setUrgency, 4, "Red: … Yellow: …")}
        </div>}
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
    <div style={panelStyle(HUE.skills)}>
      <PanelHead title="Skills" sub="rules this agent follows — uploaded, versioned, audited" />
      <div style={{ display: "grid", gap: 10 }}>
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
