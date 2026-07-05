"use client";
/*
 * AgentsPage — "Staff Agents": the landing page to SHOW and TRACK the Mayor's
 * team of agents and the work they do. Read-only UX view — agents are configured
 * and tested in Claude Code, not here. Click an agent to see its recent activity.
 * The team is open-ended: today it's email; tomorrow it could be approving time cards.
 */
import { useEffect, useState } from "react";
import { C, FONT, card, eyebrow, pill } from "@/lib/cos-design";
import { COS_AGENTS, AUTONOMY_LABEL, type CosAgent } from "@/lib/cos-agents";
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

export default function AgentsPage() {
  const [sel, setSel] = useState<CosAgent | null>(null);
  // Running state lifted here so every card can flip its badge to "Running…"
  // while a manual pass is in flight (RD 2026-07-03).
  const [running, setRunning] = useState(false);
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
  if (sel) return <AgentDetail a={effective(sel)} activity={live.activity[sel.key]} onBack={() => setSel(null)} />;

  const active = COS_AGENTS.filter((a) => a.status !== "planned").length;
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
        <Metric n={String(COS_AGENTS.length)} label="on the team" />
        <Metric n={IS_LIVE_BUILD ? "—" : String(actions)} label="recent actions" />
      </div>
      {IS_LIVE_BUILD && <RunAgentsButton running={running} onRunning={setRunning} />}

      <UsagePanel />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 14, marginTop: 16 }}>
        {COS_AGENTS.map((a) => (
          <AgentCard key={a.key} a={effective(a)} activity={live.activity[a.key]} running={running} enabled={enabledOf(a.key)}
            onFlip={IS_LIVE_BUILD ? () => flip(a.key) : undefined} onClick={() => setSel(a)} />
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: C.dim, fontFamily: FONT.mono, marginTop: 18 }}>Agents are configured &amp; tested in Claude Code · this is the Mayor&rsquo;s read-only view to track their work.</div>
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

function AgentDetail({ a, activity, onBack }: { a: CosAgent; activity?: string[]; onBack: () => void }) {
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
