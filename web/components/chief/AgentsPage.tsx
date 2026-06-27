"use client";
/*
 * AgentsPage — "Staff Agents": the landing page to SHOW and TRACK the Mayor's
 * team of agents and the work they do. Read-only UX view — agents are configured
 * and tested in Claude Code, not here. Click an agent to see its recent activity.
 * The team is open-ended: today it's email; tomorrow it could be approving time cards.
 */
import { useState } from "react";
import { C, FONT, card, eyebrow, pill } from "@/lib/cos-design";
import { COS_AGENTS, AUTONOMY_LABEL, type CosAgent } from "@/lib/cos-agents";

const tone: Record<string, string> = { R1: C.blue, R2: C.orange, R3: C.purpleText, R4: C.green };
const statusPill: Record<string, [string, string]> = {
  active: [C.greenText, "rgba(52,201,139,.14)"],
  partial: [C.orangeText, "rgba(240,163,60,.14)"],
  planned: [C.dim, "rgba(var(--ink),.06)"],
};

export default function AgentsPage() {
  const [sel, setSel] = useState<CosAgent | null>(null);
  if (sel) return <AgentDetail a={sel} onBack={() => setSel(null)} />;

  const active = COS_AGENTS.filter((a) => a.status !== "planned").length;
  const actions = COS_AGENTS.reduce((n, a) => n + a.recent.length, 0);
  return (
    <div className="fu" style={{ padding: "30px 20px 56px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={eyebrow(C.dim)}>The Chief of Staff</div>
      <div style={{ fontFamily: FONT.serif, fontSize: 30, fontWeight: 500, color: C.text, lineHeight: 1.05, marginTop: 6 }}>Staff Agents</div>
      <div style={{ fontSize: 14, color: C.text3, marginTop: 7, maxWidth: 660, lineHeight: 1.55 }}>
        The Mayor&rsquo;s team of agents and the work they&rsquo;re doing. The team grows over time — today it handles email; tomorrow it could approve time cards. Agents draft and organize; every action stays a human gate.
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 16, marginBottom: 6 }}>
        <Metric n={String(active)} label="active agents" />
        <Metric n={String(COS_AGENTS.length)} label="on the team" />
        <Metric n={String(actions)} label="recent actions" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 14, marginTop: 16 }}>
        {COS_AGENTS.map((a) => <AgentCard key={a.key} a={a} onClick={() => setSel(a)} />)}
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

function AgentCard({ a, onClick }: { a: CosAgent; onClick: () => void }) {
  const [sc, sb] = statusPill[a.status];
  return (
    <button onClick={onClick} style={{ ...card, padding: 17, textAlign: "left", color: C.text, cursor: "pointer", display: "block", width: "100%", opacity: a.status === "planned" ? 0.66 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{a.name}</span>
        <span style={{ ...pill(sc, sb), marginLeft: "auto" }}>{a.status}</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5, marginBottom: 11 }}>{a.role}</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 11 }}>
        <span style={{ ...pill(tone[a.autonomy], "rgba(var(--ink),.07)"), fontWeight: 700 }}>{a.autonomy}</span>
        <span style={pill(C.muted, "rgba(var(--ink),.06)")}>{a.powers.join(" · ")}</span>
      </div>
      <div style={{ borderTop: "1px solid var(--c-cardbd)", paddingTop: 10 }}>
        <div style={{ ...eyebrow(C.dim2), fontSize: 9.5, marginBottom: 6 }}>Recent activity</div>
        {a.recent.length ? (
          <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {a.recent[0]}</div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.dim }}>No activity yet — planned.</div>
        )}
        <div style={{ fontSize: 12, color: C.gold, fontWeight: 600, marginTop: 9 }}>View activity →</div>
      </div>
    </button>
  );
}

function AgentDetail({ a, onBack }: { a: CosAgent; onBack: () => void }) {
  const [sc, sb] = statusPill[a.status];
  return (
    <div className="fu" style={{ padding: "24px 20px 56px", maxWidth: 760, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(var(--ink),.05)", border: "1px solid var(--c-cardbd)", borderRadius: 99, padding: "7px 14px", cursor: "pointer", color: C.text2, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, marginBottom: 18 }}>← All agents</button>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 26, fontWeight: 500, color: C.text }}>{a.name}</span>
        <span style={pill(sc, sb)}>{a.status}</span>
      </div>
      <div style={{ fontSize: 14, color: C.text2, marginTop: 7, lineHeight: 1.55 }}>{a.role}</div>

      <div style={{ ...card, padding: 17, marginTop: 18, display: "grid", gap: 11 }}>
        <Field k="What it does" v={a.job} />
        <Field k="Autonomy" v={<span><span style={{ ...pill(tone[a.autonomy], "rgba(var(--ink),.07)"), fontWeight: 700, marginRight: 7 }}>{a.autonomy}</span>{AUTONOMY_LABEL[a.autonomy]}</span>} />
        <Field k="Serves" v={a.powers.join(" · ")} />
        <Field k="Produces" v={a.produces} />
      </div>

      <div style={{ ...eyebrow(C.dim), marginTop: 22, marginBottom: 11 }}>Recent activity</div>
      {a.recent.length ? (
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

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span style={{ flex: "0 0 92px", fontFamily: FONT.mono, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: C.dim }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text2, lineHeight: 1.55 }}>{v}</span>
    </div>
  );
}
