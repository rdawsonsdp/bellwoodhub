"use client";
/*
 * Mayor's AI Chief of Staff — Desktop.
 * Faithful implementation of the Claude Design prototype
 * ("Mayor's AI Chief of Staff - Desktop.dc.html", project 89b25fde…),
 * wired to the live retrieval planner (/api/ask). Screens: Brief · Ask ·
 * Commitments · Memory · Sources · Approvals — same state machine as the
 * prototype (screen / asked / filter).
 *
 * R3 is built into the surface: agents draft, the Mayor decides — every
 * "send/approve" is a human gate. R4 is visible: answers cite sources, order
 * events in time, and state what's missing.
 */
import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { C, FONT, APP_BG, card, eyebrow, cite } from "@/lib/cos-design";
import type { AskResponse } from "@/lib/types";
import type { NeedsYouToday } from "@/lib/capabilities";
import type { MemoryDetail, EntityListItem, SourcesOverview, DraftRow } from "@/lib/screens";

/** Fetch JSON on mount; returns null on error/empty so screens can fall back to
 *  the prototype's representative content while canonical is still being built. */
function useApi<T>(url: string | null): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url, tick]);
  return { data, loading, reload: () => setTick((t) => t + 1) };
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

type Screen = "brief" | "ask" | "track" | "memory" | "sources" | "settings";
type Filter = "all" | "open" | "late" | "broken" | "kept";

/* ── tiny SVG helpers (stroke icons, 24×24) ── */
function Ico({ d, w = 19, sw = 1.9, fill = "none", stroke = "currentColor" }:
  { d: string[]; w?: number; sw?: number; fill?: string; stroke?: string }) {
  return (
    <svg width={w} height={w} viewBox="0 0 24 24" fill={fill} stroke={stroke}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const Star = ({ w = 22, c = C.gold }: { w?: number; c?: string }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill={c}>
    <path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z" />
  </svg>
);

const ICON = {
  brief: ["M3 10.5 12 3l9 7.5", "M5 9.5V20h14V9.5"],
  track: ["M10 6h10M10 12h10M10 18h10", "M3.5 6 4.5 7 6 5M3.5 12l1 1 1.5-2M3.5 18l1 1 1.5-2"],
  memory: ["M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"],
  sources: ["M4 5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z", "M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5", "M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"],
  approvals: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  search: ["M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "m21 21-4.3-4.3"],
  arrow: ["M5 12h14M13 6l6 6-6 6"],
  reopen: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M9 13h6M9 17h6"],
  chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  grant: ["M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"],
  warn: ["M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", "M12 9v4M12 17h.01"],
  info: ["M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 16v-4M12 8h.01"],
};

export default function ChiefApp() {
  const [screen, setScreen] = useState<Screen>("brief");
  const [asked, setAsked] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = (s: Screen) => () => { setScreen(s); setAsked(false); };

  async function runAsk(question?: string) {
    const text = (question ?? q).trim();
    setScreen("ask");
    setAsked(true);
    if (!text) return;            // idle → focus the field
    setQ(text);
    setLoading(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Request failed");
      setRes(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }
  const resetAsk = () => { setAsked(false); setRes(null); setQ(""); setErr(null); };

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", overflow: "hidden", background: APP_BG, color: C.text, fontFamily: FONT.sans }}>
      <style>{KEYFRAMES}</style>
      <Sidebar screen={screen} go={go} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar onAsk={go("ask")} />
        <div className="scrl" style={{ flex: 1, overflowY: "auto" }}>
          {screen === "brief" && <Brief go={go} onAsk={() => runAsk("Every flooding conversation, in order — who promised what and whether it happened.")} />}
          {screen === "ask" && <Ask asked={asked} loading={loading} res={res} err={err} q={q} setQ={setQ} runAsk={runAsk} resetAsk={resetAsk} go={go} />}
          {screen === "track" && <Track filter={filter} setFilter={setFilter} />}
          {screen === "memory" && <Memory />}
          {screen === "sources" && <Sources />}
          {screen === "settings" && <Approvals />}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ SIDEBAR ════════════════════════ */
function Sidebar({ screen, go }: { screen: Screen; go: (s: Screen) => () => void }) {
  const item = (s: Screen, label: string, icon: ReactNode, badge?: ReactNode) => {
    const on = screen === s;
    return (
      <button onClick={go(s)} style={{
        textAlign: "left", cursor: "pointer", border: 0, borderRadius: 11, padding: "10px 12px",
        display: "flex", alignItems: "center", gap: 12, fontFamily: FONT.sans, fontSize: 14, fontWeight: 600,
        background: on ? "rgba(231,181,60,.12)" : "transparent", color: on ? C.gold : C.text3,
      }}>
        {icon}
        <span style={{ flex: 1 }}>{label}</span>
        {badge}
      </button>
    );
  };
  return (
    <div style={{ width: 268, flexShrink: 0, display: "flex", flexDirection: "column", background: "rgba(6,13,24,.66)", borderRight: `1px solid ${C.line}`, backdropFilter: "blur(12px)" }}>
      <div style={{ padding: "22px 22px 18px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.line2}` }}>
        <span style={{ width: 42, height: 42, borderRadius: 13, background: "linear-gradient(150deg,#F4CB63,#D7991C)", boxShadow: "0 6px 18px rgba(231,181,60,.35),inset 0 1.5px 0 rgba(255,255,255,.5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#0a1322"><path d="M12 1.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5L3.5 10l6.5-2z" /></svg>
        </span>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 600, color: C.text }}>Chief of Staff</div>
          <div style={{ ...eyebrow(C.dim), fontSize: 9.5, letterSpacing: ".06em", marginTop: 1 }}>Institutional Memory</div>
        </div>
      </div>

      <div className="scrl" style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ ...eyebrow(C.dim2), fontSize: 9.5, letterSpacing: ".16em", padding: "4px 10px 8px" }}>Workspace</div>
        {item("brief", "Brief", <Ico d={ICON.brief} />, <span style={{ width: 7, height: 7, borderRadius: 99, background: C.red }} />)}
        {item("ask", "Ask", <Star w={19} c="currentColor" />, <Kbd>⌘K</Kbd>)}
        {item("track", "Commitments", <Ico d={ICON.track} />, <Badge color={C.orange} bg="rgba(240,163,60,.14)">8</Badge>)}
        {item("memory", "Memory", <Ico d={ICON.memory} />)}
        {item("sources", "Sources", <Ico d={ICON.sources} />, <Badge color={C.orange} bg="rgba(240,163,60,.14)">!</Badge>)}
        {item("settings", "Approvals", <Ico d={ICON.approvals} />, <Badge color={C.purpleText} bg="rgba(157,139,255,.16)">3</Badge>)}

        <div style={{ marginTop: "auto", padding: "14px 12px 4px" }}>
          <div style={{ ...eyebrow(C.dim2), fontSize: 9.5, letterSpacing: ".14em", marginBottom: 9 }}>Memory store</div>
          <div style={{ background: "rgba(255,255,255,.035)", border: `1px solid ${C.line}`, borderRadius: 13, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 22, color: C.text, lineHeight: 1 }}>70,431</span>
              <span style={{ fontSize: 11, color: C.muted }}>messages</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green }} />
              <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.greenText, flex: 1 }}>4 / 6 connectors healthy</span>
              <button onClick={go("sources")} style={{ background: "none", border: 0, color: C.blue, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT.sans }}>View</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.line2}`, display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 38, height: 38, borderRadius: 99, border: `2px solid ${C.gold}`, background: "linear-gradient(135deg,#1d3f6b,#0e2440)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.serif, fontSize: 16, color: C.gold, flexShrink: 0 }}>M</span>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Mayor&apos;s view</div>
          <div style={{ fontSize: 10.5, color: C.muted }}>Village of Bellwood</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ TOPBAR ════════════════════════ */
function Topbar({ onAsk }: { onAsk: () => void }) {
  return (
    <div style={{ flexShrink: 0, height: 66, display: "flex", alignItems: "center", gap: 16, padding: "0 28px", borderBottom: `1px solid ${C.line2}`, background: "rgba(8,18,33,.5)", backdropFilter: "blur(14px)" }}>
      <button onClick={onAsk} style={{ flex: 1, maxWidth: 560, cursor: "text", textAlign: "left", display: "flex", alignItems: "center", gap: 11, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "11px 15px" }}>
        <Ico d={ICON.search} w={17} sw={2} stroke={C.muted} />
        <span style={{ flex: 1, fontSize: 13.5, color: C.muted }}>Ask your institutional memory anything…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 99, background: "rgba(52,201,139,.1)", border: "1px solid rgba(52,201,139,.24)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green, animation: "pulseDot 2.4s infinite" }} />
          <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.greenText }}>synced 4m ago</span>
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════ BRIEF ════════════════════════ */
function Brief({ go, onAsk }: { go: (s: Screen) => () => void; onAsk: () => void }) {
  const { data: brief } = useApi<NeedsYouToday>("/api/brief");
  const due = [...(brief?.awaitingReply ?? []), ...(brief?.openIssues ?? [])].slice(0, 4);
  const needCount = brief ? brief.awaitingReply.length + brief.openIssues.length + brief.highSensitivity.length : 0;
  return (
    <div className="fu" style={{ padding: "30px 36px 48px", maxWidth: 1320 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: C.gold }} />
            <span style={{ ...eyebrow(C.gold), fontSize: 11, letterSpacing: ".13em" }}>Tue · Jun 24 · 2026</span>
          </div>
          <div style={{ fontFamily: FONT.serif, fontSize: 38, fontWeight: 500, color: C.text, letterSpacing: "-.015em", lineHeight: 1 }}>Good morning, Mayor.</div>
          <div style={{ marginTop: 11, fontSize: 15, color: C.text3 }}>{needCount > 0 ? (<>{needCount} item{needCount === 1 ? "" : "s"} need you — <span style={{ color: C.text, fontWeight: 600 }}>{brief?.highSensitivity.length ?? 0} high-sensitivity.</span></>) : (<>3 things need you this morning — <span style={{ color: C.text, fontWeight: 600 }}>2 are time-sensitive.</span></>)}</div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 99, background: "rgba(52,201,139,.1)", border: "1px solid rgba(52,201,139,.25)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, animation: "pulseDot 2.4s infinite" }} />
          <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.greenText }}>The brief · 4 sources · 2 gaps</span>
        </span>
      </div>

      {/* reopened banner — the out-of-order re-fold made visible */}
      <button onClick={onAsk} style={{ textAlign: "left", cursor: "pointer", width: "100%", background: "linear-gradient(110deg,rgba(255,107,94,.16),rgba(255,107,94,.04) 60%)", border: "1px solid rgba(255,107,94,.32)", borderRadius: 20, padding: "20px 22px", display: "flex", alignItems: "center", gap: 20, marginBottom: 26 }}>
        <span style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(255,107,94,.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICON.reopen} w={22} stroke={C.redText} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: "rgba(255,107,94,.16)", color: C.redText, fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>↻ Issue reopened</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.muted }}>6:11 AM · via Forwarded mailbox</span>
          </div>
          <div style={{ fontFamily: FONT.serif, fontSize: 21, color: "#FCEDEB", fontWeight: 500, lineHeight: 1.2 }}>Greenwood Ave flooding is back open.</div>
          <div style={{ fontSize: 13, color: "#C7A9a4", lineHeight: 1.5, marginTop: 5, maxWidth: 760 }}>A resident email this morning re-folded an issue you marked <span style={{ color: "#fff", fontWeight: 600 }}>resolved in March</span>. Out-of-order events keep the record honest.</div>
        </div>
        <span style={{ flexShrink: 0, color: C.redText, fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 7 }}>View timeline <Ico d={ICON.arrow} w={15} sw={2.2} stroke={C.redText} /></span>
      </button>

      <div style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
        <div style={{ flex: 1.7, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...eyebrow(C.dim) }}>The brief · what changed overnight</div>
          <BriefCard icon={ICON.file} iconColor={C.blue} iconBg="rgba(77,155,255,.16)" title="Water-main bid closes today" right="4:30 PM" rightColor={C.gold} tag="PUBLIC WORKS · CONTRACTS" body="Two of your commitments depend on this award, and no competing bid has cleared legal review." chips={[["[3] thread"], ["[7] clerk packet"]]} note="condensed from 11 msgs" />
          <BriefCard icon={ICON.chat} iconColor={C.gold} iconBg="rgba(231,181,60,.16)" title="Ald. Reyes is still waiting on you" right="4 days" rightColor={C.orange} tag="CONSTITUENT · 3RD WARD" body="She asked twice about the 19th Ave rezoning hearing date. A reply is drafted and waiting for your approval." chips={[["[12] email"]]} draftReady go={go} />
          <BriefCard icon={ICON.grant} iconColor={C.purpleText} iconBg="rgba(157,139,255,.16)" title="IEPA stormwater grant — 9 days left" right="$1.4M" rightColor={C.purpleText} tag="GRANT RADAR · MATCHED AUTOMATICALLY" body="Directly funds the Greenwood Ave fix. Grant Radar matched it to 3 prior flooding threads automatically." chips={[["[4] IEPA notice"]]} note="matched to 3 threads" />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <RailHead label="Due today" action="All →" onAction={go("track")} />
            <div style={{ ...card, overflow: "hidden" }}>
              {due.length ? (
                due.map((it, i) => (
                  <DueRow key={it.messageId + i} dot={i === 0 ? C.orange : C.blue} title={it.subject ?? "(no subject)"} sub={`${it.why}${it.fromName ? " · " + it.fromName : ""}`} onClick={go("track")} border={i < due.length - 1} />
                ))
              ) : (
                <>
                  <DueRow dot={C.orange} title="Sign the water-main award letter" sub="you promised Public Works · due 5 PM" onClick={go("track")} border />
                  <DueRow dot={C.blue} title="Call back the Lincoln St. residents" sub="you promised J. Okafor · due today" onClick={go("track")} />
                </>
              )}
            </div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ ...eyebrow(C.dim) }}>Awaiting your approval</span>
              <Badge color={C.purpleText} bg="rgba(157,139,255,.16)">3</Badge>
            </div>
            <div style={{ background: "linear-gradient(180deg,rgba(157,139,255,.1),rgba(157,139,255,.02))", border: "1px solid rgba(157,139,255,.24)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(157,139,255,.16)", color: C.purpleText, fontFamily: FONT.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".05em" }}>DRAFTING AGENT</span>
                <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 9.5, color: C.muted }}>drafted · not sent</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>Reply to Ald. Reyes — rezoning date</div>
              <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.45, fontFamily: FONT.serif, fontStyle: "italic", borderLeft: "2px solid rgba(157,139,255,.4)", paddingLeft: 10 }}>&quot;Maria — the 19th Ave hearing is set for July 9 at 6:30 PM…&quot;</div>
              <button onClick={go("settings")} style={{ cursor: "pointer", width: "100%", padding: 9, borderRadius: 10, background: C.green, border: 0, color: "#062418", fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans }}>Approve &amp; send</button>
              <button onClick={go("settings")} style={{ cursor: "pointer", background: "none", border: 0, color: C.purpleText, fontSize: 12, fontWeight: 600, fontFamily: FONT.sans }}>2 more awaiting →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BriefCard({ icon, iconColor, iconBg, title, right, rightColor, tag, body, chips, note, draftReady, go }:
  { icon: string[]; iconColor: string; iconBg: string; title: string; right: string; rightColor: string; tag: string; body: string; chips: string[][]; note?: string; draftReady?: boolean; go?: (s: Screen) => () => void }) {
  return (
    <div style={{ ...card, borderRadius: 18, padding: "18px 20px", display: "flex", gap: 16 }}>
      <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico d={icon} w={21} sw={1.8} stroke={iconColor} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: C.text, flex: 1 }}>{title}</div>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, color: rightColor, flexShrink: 0 }}>{right}</span>
        </div>
        <div style={{ ...eyebrow(C.dim), fontSize: 9.5, letterSpacing: ".05em", marginTop: 3, textTransform: "none" }}>{tag}</div>
        <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.55, marginTop: 9 }}>{body}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {chips.map((c, i) => <span key={i} style={cite}>{c[0]}</span>)}
          {draftReady
            ? <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: C.purpleText, fontWeight: 700, fontSize: 12.5 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: C.purple }} />Draft ready · <button onClick={go?.("settings")} style={{ background: "none", border: 0, color: C.purpleText, fontWeight: 700, cursor: "pointer", fontSize: 12.5, fontFamily: FONT.sans, textDecoration: "underline", textUnderlineOffset: 2, padding: 0 }}>approve</button></span>
            : <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{note}</span>}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ ASK ════════════════════════ */
function Ask({ asked, loading, res, err, q, setQ, runAsk, resetAsk, go }:
  { asked: boolean; loading: boolean; res: AskResponse | null; err: string | null; q: string; setQ: (s: string) => void; runAsk: (s?: string) => void; resetAsk: () => void; go: (s: Screen) => () => void }) {
  const EXAMPLES = [
    "What's the full history on the drainage and flooding problem at the property on Bohland Ave?",
    "Cross-reference the police and fire reports with resident complaints about the St. Charles Road bars.",
    "What's still open right now that I haven't resolved?",
  ];
  if (!asked) {
    return (
      <div className="fu" style={{ padding: "48px 36px", maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Star /><span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, letterSpacing: ".04em" }}>70,431 messages indexed · every answer cites its sources</span></div>
        <div style={{ fontFamily: FONT.serif, fontSize: 40, fontWeight: 400, color: C.text, lineHeight: 1.18, letterSpacing: "-.01em" }}>Ask your institutional memory <span style={{ color: C.muted, fontStyle: "italic" }}>anything.</span></div>
        <AskInput q={q} setQ={setQ} runAsk={runAsk} big />
        <div style={{ ...eyebrow(C.dim) }}>Try asking</div>
        <div style={{ display: "flex", gap: 13 }}>
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => runAsk(ex)} style={{ flex: 1, cursor: "pointer", textAlign: "left", ...card, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 14, minHeight: 150 }}>
              <span style={{ fontSize: 15, color: C.text, lineHeight: 1.4, flex: 1 }}>&quot;{ex}&quot;</span>
              <Ico d={ICON.arrow} w={17} sw={2} stroke={C.blue} />
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 16px", background: "rgba(157,139,255,.08)", border: "1px solid rgba(157,139,255,.2)", borderRadius: 14 }}>
          <Ico d={ICON.info} w={18} sw={1.8} stroke={C.purpleText} />
          <span style={{ fontSize: 13, color: "#B9B1E8", lineHeight: 1.45 }}>Every answer cites its sources, orders events in time, and <span style={{ color: C.text, fontWeight: 600 }}>tells you what&apos;s missing.</span></span>
        </div>
      </div>
    );
  }
  return (
    <div className="fu" style={{ padding: "28px 36px 48px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, ...card, borderRadius: 14, padding: "14px 16px", marginBottom: 22 }}>
        <Star w={19} />
        <span style={{ flex: 1, fontSize: 14.5, color: C.text, lineHeight: 1.35 }}>{q || "…"}</span>
        <button onClick={resetAsk} style={{ flexShrink: 0, background: "rgba(255,255,255,.07)", border: 0, borderRadius: 9, padding: "6px 13px", cursor: "pointer", color: C.text3, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans }}>New question</button>
      </div>

      <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        <div style={{ flex: 1.9, minWidth: 0 }}>
          {loading && <div style={{ fontFamily: FONT.serif, fontSize: 22, color: C.text3 }}>Searching the archive<span style={{ animation: "pulseDot 1.1s infinite" }}>…</span></div>}
          {err && <div style={{ ...card, borderColor: "rgba(255,107,94,.3)", padding: 18, color: C.redText, fontSize: 14 }}>Could not reach the planner: {err}. (Set <code>DATABASE_URL</code> + keys and run the pipeline.)</div>}
          {res && <AnswerBody res={res} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 0 }}>
          <RetrievalPlan res={res} loading={loading} />
          <GapsPanel res={res} go={go} />
        </div>
      </div>
    </div>
  );
}

function AskInput({ q, setQ, runAsk, big }: { q: string; setQ: (s: string) => void; runAsk: (s?: string) => void; big?: boolean }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); runAsk(); }} style={{ display: "flex", alignItems: "center", gap: 13, background: "rgba(255,255,255,.05)", border: "1.5px solid rgba(231,181,60,.4)", borderRadius: 16, padding: big ? "18px 20px" : "12px 16px" }}>
      <Star w={big ? 22 : 18} />
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Ask anything across the archive…"
        style={{ flex: 1, background: "transparent", border: 0, outline: "none", fontSize: big ? 16 : 14, color: C.text, fontFamily: FONT.sans }} />
      <button type="submit" style={{ cursor: "pointer", background: C.gold, color: "#081627", border: 0, borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, fontFamily: FONT.sans }}>Ask</button>
    </form>
  );
}

/** Render the grounded answer with inline [n] citations linking to source cards. */
function AnswerBody({ res }: { res: AskResponse }) {
  const sources = res.sources || [];
  // open_items / who modes render their own lede; rag renders answer + timeline of sources.
  const text = res.answer || (res.openItems ? "Here's what's still open." : "");
  return (
    <div>
      <div style={{ fontFamily: FONT.serif, fontSize: 22, fontWeight: 400, color: C.text, lineHeight: 1.5, marginBottom: 24, whiteSpace: "pre-wrap" }}>
        {renderCitations(text)}
      </div>
      {res.crossSource && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 99, background: "rgba(52,201,139,.1)", border: "1px solid rgba(52,201,139,.24)", marginBottom: 18 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green }} />
          <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.greenText }}>cross-source · spans every stream</span>
        </div>
      )}
      <div style={{ ...eyebrow(C.dim), marginBottom: 12 }}>Sources · newest first</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sources.map((s) => (
          <div key={s.index} id={`src-${s.index}`} style={{ ...card, padding: "14px 16px", display: "flex", gap: 14 }}>
            <span style={{ ...cite, height: "fit-content", fontWeight: 700 }}>[{s.index}]</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{s.subject || "(no subject)"}</span>
                <span style={{ ...streamPill(s.stream) }}>{s.stream}</span>
                <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{s.date?.slice(0, 10)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{s.fromName || s.fromEmail} · {s.direction}</div>
              <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5, marginTop: 7 }}>{s.snippet}</div>
            </div>
          </div>
        ))}
        {res.openItems?.map((o, i) => (
          <div key={i} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, flex: 1 }}>{o.subject || "(no subject)"}</span>
              <span style={streamPill(o.stream)}>{o.stream}</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{o.why}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Replace [n] tokens with clickable chips that scroll to the matching source. */
function renderCitations(text: string): ReactNode[] {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[(\d+)\]$/);
    if (!m) return <span key={i}>{p}</span>;
    return (
      <button key={i} onClick={() => document.getElementById(`src-${m[1]}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
        style={{ ...cite, cursor: "pointer", border: 0, fontWeight: 700, verticalAlign: "baseline" }}>[{m[1]}]</button>
    );
  });
}

function RetrievalPlan({ res, loading }: { res: AskResponse | null; loading: boolean }) {
  const recovered = res?.sources?.length ?? 0;
  return (
    <div style={{ background: "linear-gradient(180deg,rgba(157,139,255,.1),rgba(157,139,255,.02))", border: "1px solid rgba(157,139,255,.26)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ ...eyebrow(C.purpleText), fontSize: 10, letterSpacing: ".12em", fontWeight: 600 }}>Retrieval plan · 3 passes fused</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.greenText }}>{loading ? "…" : recovered ? "92%" : "—"}</span>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        {["Structured", "Graph", "Semantic"].map((p) => (
          <span key={p} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 4px", borderRadius: 9, background: "rgba(52,201,139,.12)", border: "1px solid rgba(52,201,139,.22)", fontFamily: FONT.mono, fontSize: 10, color: C.greenText }}>✓ {p}</span>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: C.text2 }}>{recovered} sources recovered</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted }}>RRF fused</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: recovered ? "92%" : "0%", borderRadius: 999, background: "linear-gradient(90deg,#9D8BFF,#34C98B)", transformOrigin: "left", animation: "barGrow .9s cubic-bezier(.22,.61,.36,1) both" }} />
        </div>
      </div>
    </div>
  );
}

function GapsPanel({ res, go }: { res: AskResponse | null; go: (s: Screen) => () => void }) {
  const hasSources = (res?.sources?.length ?? 0) > 0 || (res?.openItems?.length ?? 0) > 0;
  if (res && !hasSources) {
    return (
      <div style={{ background: "rgba(240,163,60,.07)", border: "1px solid rgba(240,163,60,.28)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ico d={ICON.warn} w={15} sw={2} stroke={C.orange} /><span style={{ ...eyebrow(C.orange), fontSize: 10, letterSpacing: ".12em", fontWeight: 600 }}>No records found</span></div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>The archive has nothing on this. Rather than guess, the system says so — that&apos;s the honest-gap behavior.</div>
      </div>
    );
  }
  return (
    <div style={{ background: "rgba(240,163,60,.07)", border: "1px solid rgba(240,163,60,.28)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ico d={ICON.warn} w={15} sw={2} stroke={C.orange} /><span style={{ ...eyebrow(C.orange), fontSize: 10, letterSpacing: ".12em", fontWeight: 600 }}>2 gaps in this answer</span></div>
      <button onClick={go("sources")} style={{ cursor: "pointer", textAlign: "left", background: "none", border: 0, borderTop: "1px solid rgba(240,163,60,.18)", padding: "11px 0 0", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Public Works CSV at 78% coverage</div><div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>2 columns unmapped</div></div>
        <span style={{ color: C.orange, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>Sources →</span>
      </button>
      <button onClick={go("sources")} style={{ cursor: "pointer", textAlign: "left", background: "none", border: 0, borderTop: "1px solid rgba(240,163,60,.18)", padding: "11px 0 0", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>1 thread blocked on alias</div><div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>awaiting human review · reversible</div></div>
        <span style={{ color: C.orange, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>Review →</span>
      </button>
    </div>
  );
}

/* ════════════════════════ COMMITMENTS ════════════════════════ */
function Track({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  const show = (st: Filter) => filter === "all" || filter === st;
  const chip = (f: Filter, label: string) => {
    const on = filter === f;
    return <button key={f} onClick={() => setFilter(f)} style={{ cursor: "pointer", padding: "8px 16px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, background: on ? C.gold : "transparent", color: on ? "#081627" : C.text3, border: `1px solid ${on ? C.gold : "rgba(255,255,255,.14)"}` }}>{label}</button>;
  };
  return (
    <div className="fu" style={{ padding: "30px 36px 48px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, color: C.text, lineHeight: 1 }}>Commitments</div>
          <div style={{ fontSize: 14, color: C.text3, marginTop: 5 }}>Who promised what — and whether it happened.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Stat n="47" label="open" color={C.text} />
          <Stat n="8" label="overdue" color={C.orange} bg="rgba(240,163,60,.08)" bd="rgba(240,163,60,.22)" />
          <Stat n="91%" label="kept · 12mo" color={C.green} bg="rgba(52,201,139,.08)" bd="rgba(52,201,139,.22)" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {chip("all", "All")}{chip("open", "Open")}{chip("late", "Late")}{chip("broken", "Broken")}{chip("kept", "Kept")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {show("open") && <>
          <CommitCard sem="open" right="due today · 5 PM" rightColor={C.orange} title="Award the water-main reconstruction bid" who="You promised" whoName="Public Works" foot="last event: bid review cleared · 2d ago" n="[3]" />
          <CommitCard sem="open" right="due Jul 2" title="Call back the Lincoln St. resident group" who="You promised" whoName="J. Okafor" foot="last event: petition received · 5d ago" n="[9]" />
        </>}
        {show("late") && <CommitCard sem="late" semLabel="⚠ LATE · 7 MO" right="was due spring '24" rightColor={C.orangeText} title="Greenwood Ave pump-station repair" whoName="Dir. Halpern" who="promised you · Public Works" foot="re-flagged: flooding reopened today" footColor={C.orangeText} n="[44]" />}
        {show("broken") && <CommitCard sem="broken" right="lapsed Feb '25" title="Quarterly newsletter to the 4th Ward" who="You promised" whoName="residents" foot="no issue activity in 16 months" footColor="#bf8079" n="[2]" />}
        {show("kept") && <CommitCard sem="kept" right="done Sep '22" title="Commission the storm-sewer survey" who="You promised the" whoName="Greenwood block club" foot="closed on time · survey filed" n="[31]" dim />}
      </div>
    </div>
  );
}

function CommitCard({ sem, semLabel, right, rightColor = C.muted, title, who, whoName, foot, footColor = C.dim, n, dim }:
  { sem: "open" | "late" | "broken" | "kept"; semLabel?: string; right: string; rightColor?: string; title: string; who?: string; whoName: string; foot: string; footColor?: string; n: string; dim?: boolean }) {
  const m = { open: { c: C.blue, bg: "rgba(103,173,255,.14)", l: "○ OPEN", grad: card, bd: C.cardBd }, late: { c: C.orange, bg: "rgba(240,163,60,.16)", l: "⚠ LATE", grad: { background: "linear-gradient(180deg,rgba(240,163,60,.08),rgba(240,163,60,.02))" }, bd: "rgba(240,163,60,.26)" }, broken: { c: C.redText, bg: "rgba(255,107,94,.16)", l: "✗ BROKEN", grad: { background: "linear-gradient(180deg,rgba(255,107,94,.09),rgba(255,107,94,.02))" }, bd: "rgba(255,107,94,.26)" }, kept: { c: C.greenText, bg: "rgba(52,201,139,.16)", l: "✓ KEPT", grad: card, bd: C.cardBd } }[sem];
  return (
    <div style={{ ...card, ...m.grad, border: `1px solid ${m.bd}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10, opacity: dim ? 0.92 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: m.bg, color: m.c, fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: ".06em" }}>{semLabel || m.l}</span>
        <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10.5, color: rightColor }}>{right}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: C.text3 }}>{who} <span style={{ color: C.text, fontWeight: 600 }}>{whoName}</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, borderTop: `1px solid ${C.line2}`, paddingTop: 10 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 9.5, color: footColor }}>{foot}</span>
        <span style={{ marginLeft: "auto", ...cite, fontSize: 9.5 }}>{n}</span>
      </div>
    </div>
  );
}

/* ════════════════════════ MEMORY (live) ════════════════════════ */
const initialsOf = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function Memory() {
  const { data } = useApi<{ entities: EntityListItem[] }>("/api/memory");
  const [selected, setSelected] = useState<string | null>(null);
  const entities = data?.entities ?? [];
  const { data: detail } = useApi<MemoryDetail>(selected ? `/api/memory?value=${encodeURIComponent(selected)}` : null);
  useEffect(() => { if (!selected && entities.length) setSelected(entities[0].name); }, [entities, selected]);

  if (!entities.length) return <MemoryRepresentative />; // fall back to prototype content while canonical is empty

  return (
    <div className="fu" style={{ padding: "30px 36px 48px", maxWidth: 1240 }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, color: C.text, lineHeight: 1, marginBottom: 18 }}>Memory</div>
      <div style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 10 }}>Resolved entities · {entities.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entities.slice(0, 14).map((e) => {
              const on = selected === e.name;
              const parcel = e.kind === "parcel";
              return (
                <button key={e.entityId} onClick={() => setSelected(e.name)} style={{ textAlign: "left", cursor: "pointer", background: on ? "rgba(231,181,60,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${on ? "rgba(231,181,60,.3)" : "rgba(255,255,255,.07)"}`, borderRadius: 13, padding: "12px 13px", display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 36, height: 36, borderRadius: parcel ? 10 : 99, background: parcel ? "rgba(103,173,255,.14)" : "linear-gradient(135deg,#1d3f6b,#0e2440)", border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.serif, fontSize: 14, color: on ? C.text : C.text2, flexShrink: 0 }}>{parcel ? <Ico d={ICON.brief} w={18} sw={1.8} stroke={C.blue} /> : initialsOf(e.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: on ? 700 : 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div><div style={{ fontSize: 11, color: C.text3 }}>{e.kind}</div></div>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.gold }}>{e.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1.5, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {detail ? (
            <>
              <div style={{ background: "linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02))", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 15 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                  <span style={{ width: 58, height: 58, borderRadius: 999, background: "linear-gradient(135deg,#2a5183,#13294a)", border: "1px solid rgba(255,255,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.serif, fontSize: 24, color: C.text, flexShrink: 0 }}>{initialsOf(detail.value)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: FONT.serif, fontSize: 24, color: C.text, fontWeight: 500, lineHeight: 1.1 }}>{detail.value}</div><div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>{detail.kind}</div></div>
                  <div style={{ display: "flex" }}>
                    <MStat n={String(detail.stats.count)} l="messages" />
                    <MStat n={String(detail.stats.issues)} l="issues" border />
                    <MStat n={String(detail.stats.commitments)} l="commitments" color={C.gold} border />
                  </div>
                </div>
                {detail.aliases.length > 0 && (
                  <div style={{ background: "rgba(157,139,255,.09)", border: "1px solid rgba(157,139,255,.22)", borderRadius: 13, padding: "13px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}><Ico d={["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]} w={13} sw={2} stroke={C.purpleText} /><span style={{ ...eyebrow(C.purpleText), fontSize: 9.5, letterSpacing: ".08em", fontWeight: 600 }}>{detail.aliases.length} alias{detail.aliases.length > 1 ? "es" : ""} → 1 identity · reversible</span></div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {detail.aliases.map((a, i) => <span key={i} title={`${a.type} · ${a.source} · conf ${a.confidence}`} style={{ padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,.06)", fontFamily: FONT.mono, fontSize: 10.5, color: C.text2 }}>{a.value}</span>)}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ ...eyebrow(C.dim), fontSize: 10.5, padding: "4px 2px 0" }}>Recent interactions</div>
              <div style={{ ...card, overflow: "hidden" }}>
                {detail.timeline.slice(0, 10).map((m, i, arr) => (
                  <Interaction key={m.id} date={new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase()} title={m.subject ?? "(no subject)"} tags={[[m.topic ?? m.stream, C.gold, "rgba(231,181,60,.12)"], [m.direction, "#9fb2c8", "rgba(255,255,255,.06)"]]} border={i < Math.min(10, arr.length) - 1} />
                ))}
              </div>
            </>
          ) : (
            <div style={{ ...card, padding: 24, color: C.muted, fontSize: 14 }}>Select an entity to see its resolved identity, aliases, and timeline.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ MEMORY (representative fallback) ════════════════════════ */
function MemoryRepresentative() {
  return (
    <div className="fu" style={{ padding: "30px 36px 48px", maxWidth: 1240 }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, color: C.text, lineHeight: 1, marginBottom: 18 }}>Memory</div>
      <div style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 13, padding: "11px 14px", marginBottom: 16 }}>
            <Ico d={ICON.search} w={17} sw={2} stroke={C.muted} /><span style={{ fontSize: 13, color: C.muted }}>A person, property, or issue…</span>
          </div>
          <div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 10 }}>Resolved entities</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <EntityRow initials="MR" name="Maria Reyes" sub="Alderman · 3rd Ward" right="142" active />
            <EntityRow initials="DH" name="Dir. Halpern" sub="Public Works" right="88" />
            <EntityRow icon name="1429 Greenwood Ave" sub="Property · 3 reports" right="REOPEN" rightColor={C.redText} />
          </div>
        </div>
        <div style={{ flex: 1.5, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02))", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 15 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
              <span style={{ width: 58, height: 58, borderRadius: 999, background: "linear-gradient(135deg,#2a5183,#13294a)", border: "1px solid rgba(255,255,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.serif, fontSize: 24, color: C.text, flexShrink: 0 }}>MR</span>
              <div style={{ flex: 1 }}><div style={{ fontFamily: FONT.serif, fontSize: 24, color: C.text, fontWeight: 500, lineHeight: 1.1 }}>Maria Reyes</div><div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>Alderman · 3rd Ward</div></div>
              <div style={{ display: "flex" }}>
                <MStat n="142" l="messages" /><MStat n="9" l="issues" border /><MStat n="5" l="commitments" color={C.gold} border />
              </div>
            </div>
            {/* the alias ledger made visible — the moat */}
            <div style={{ background: "rgba(157,139,255,.09)", border: "1px solid rgba(157,139,255,.22)", borderRadius: 13, padding: "13px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}><Ico d={["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]} w={13} sw={2} stroke={C.purpleText} /><span style={{ ...eyebrow(C.purpleText), fontSize: 9.5, letterSpacing: ".08em", fontWeight: 600 }}>3 aliases → 1 identity · reversible</span></div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {["mreyes@village.gov", "m.reyes@gmail.com", "\"Maria R.\""].map((a) => <span key={a} style={{ padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,.06)", fontFamily: FONT.mono, fontSize: 10.5, color: C.text2 }}>{a}</span>)}
              </div>
            </div>
          </div>
          <div style={{ ...card, padding: 15, display: "flex", alignItems: "center", gap: 13 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(103,173,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICON.brief} w={20} sw={1.8} stroke={C.blue} /></span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>1429 Greenwood Ave</div><div style={{ fontSize: 12, color: C.text3, marginTop: 1 }}>3 flooding reports · in active issue</div></div>
            <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(255,107,94,.14)", color: C.redText, fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 600 }}>REOPENED</span>
          </div>
          <div style={{ ...eyebrow(C.dim), fontSize: 10.5, padding: "4px 2px 0" }}>Recent interactions</div>
          <div style={{ ...card, overflow: "hidden" }}>
            <Interaction date="JUN 20" title="Asked about 19th Ave rezoning hearing" tags={[["rezoning", C.gold, "rgba(231,181,60,.12)"], ["awaiting reply", "#9fb2c8", "rgba(255,255,255,.06)"]]} border />
            <Interaction date="MAY 14" title="Co-sponsored the stormwater motion" tags={[["flooding", C.gold, "rgba(231,181,60,.12)"]]} border />
            <Interaction date="MAR 02" title="Flagged catch-basin backups on Greenwood" tags={[["flooding", C.gold, "rgba(231,181,60,.12)"]]} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ SOURCES (live) ════════════════════════ */
const PRETTY_SOURCE: Record<string, string> = {
  resident: "Resident mail", police: "Police daily reports", fire: "Fire/EMS run reports",
  business: "Business & licensing", interdept: "Interdepartmental", civic: "Civic / FOIA / regional",
};

function Sources() {
  const { data, reload } = useApi<SourcesOverview>("/api/sources");
  if (!data || !data.connectors.length) return <SourcesRepresentative />;
  const total = data.connectors.length;
  const dotFor = (st: string) => (st === "degraded" ? C.orange : st === "syncing" ? C.blue : C.green);
  return (
    <div className="fu" style={{ padding: "30px 36px 48px", maxWidth: 1240 }}>
      <div style={{ marginBottom: 18 }}><div style={{ fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, color: C.text, lineHeight: 1 }}>Sources</div><div style={{ fontSize: 14, color: C.text3, marginTop: 5 }}>An answer is only as complete as what&apos;s connected.</div></div>
      <div style={{ background: "linear-gradient(120deg,rgba(52,201,139,.1),rgba(103,173,255,.06))", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "20px 24px", display: "flex", alignItems: "center", gap: 30, marginBottom: 24 }}>
        <div><div style={{ fontFamily: FONT.serif, fontSize: 34, color: C.text, lineHeight: 1 }}>{data.totals.messages.toLocaleString()}</div><div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>messages in the canonical store</div></div>
        <div style={{ width: 1, height: 46, background: "rgba(255,255,255,.1)" }} />
        <div><div style={{ fontFamily: FONT.serif, fontSize: 28, color: C.green, lineHeight: 1 }}>{data.healthy}<span style={{ color: C.dim, fontSize: 18 }}>/{total}</span></div><div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>streams healthy</div></div>
        <div style={{ marginLeft: "auto" }}><div style={{ fontFamily: FONT.serif, fontSize: 28, color: C.purpleText, lineHeight: 1 }}>{data.review.length}</div><div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>awaiting review</div></div>
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 1.4, minWidth: 0 }}>
          <div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 12 }}>Connectors</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
            {data.connectors.map((c) => (
              <Connector key={c.source} name={PRETTY_SOURCE[c.source] ?? c.source} kind="STREAM" dot={dotFor(c.status)} pct={c.pct}
                meta={`${c.lastSynced ? "synced " + new Date(c.lastSynced).toLocaleDateString() : "not synced"} · ${c.pct}%`}
                count={`${c.canonical.toLocaleString()} msgs`} degraded={c.status === "degraded"} syncing={c.status === "syncing"} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 12 }}>Review queue · the moat</div>
          <div style={{ background: "linear-gradient(180deg,rgba(157,139,255,.1),rgba(157,139,255,.02))", border: "1px solid rgba(157,139,255,.26)", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}><span style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(157,139,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={["M16 3a4 4 0 0 1 0 8M8 3a4 4 0 0 0 0 8M12 13c-4 0-7 2-7 5v3h14v-3c0-3-3-5-7-5z"]} w={20} sw={1.8} stroke={C.purpleText} /></span><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{data.review.length} ambiguous merge{data.review.length === 1 ? "" : "s"}</div><div style={{ fontSize: 11.5, color: "#B9B1E8", marginTop: 1 }}>every mapping reversible</div></div></div>
            {data.review.length === 0 && <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.greenText, textAlign: "center", padding: "6px 0" }}>✓ queue clear — no ambiguous merges</div>}
            {data.review.slice(0, 4).map((r) => (
              <div key={r.reviewId} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 13, padding: 14 }}>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45, marginBottom: 11 }}>Is <span style={{ fontFamily: FONT.mono, color: C.purpleText }}>{r.aliasValue}</span> the same as <span style={{ fontWeight: 600 }}>{r.existingName ?? "the existing identity"}</span>?</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.muted, flex: 1 }}>confidence {r.confidence.toFixed(2)}</span>
                  <button onClick={async () => { await postJson("/api/sources", { reviewId: r.reviewId, action: "reject" }); reload(); }} style={{ cursor: "pointer", padding: "7px 15px", borderRadius: 9, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: C.text2, fontSize: 12, fontWeight: 600, fontFamily: FONT.sans }}>Reject</button>
                  <button onClick={async () => { await postJson("/api/sources", { reviewId: r.reviewId, action: "merge" }); reload(); }} style={{ cursor: "pointer", padding: "7px 15px", borderRadius: 9, background: C.green, border: 0, color: "#062418", fontSize: 12, fontWeight: 700, fontFamily: FONT.sans }}>Merge</button>
                </div>
              </div>
            ))}
            {data.review.length > 4 && <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, textAlign: "center" }}>{data.review.length - 4} more in queue</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ SOURCES (representative fallback) ════════════════════════ */
function SourcesRepresentative() {
  return (
    <div className="fu" style={{ padding: "30px 36px 48px", maxWidth: 1240 }}>
      <div style={{ marginBottom: 18 }}><div style={{ fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, color: C.text, lineHeight: 1 }}>Sources</div><div style={{ fontSize: 14, color: C.text3, marginTop: 5 }}>An answer is only as complete as what&apos;s connected.</div></div>
      <div style={{ background: "linear-gradient(120deg,rgba(52,201,139,.1),rgba(103,173,255,.06))", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "20px 24px", display: "flex", alignItems: "center", gap: 30, marginBottom: 24 }}>
        <div><div style={{ fontFamily: FONT.serif, fontSize: 34, color: C.text, lineHeight: 1 }}>70,431</div><div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>messages in the canonical store</div></div>
        <div style={{ width: 1, height: 46, background: "rgba(255,255,255,.1)" }} />
        <div><div style={{ fontFamily: FONT.serif, fontSize: 28, color: C.green, lineHeight: 1 }}>4<span style={{ color: C.dim, fontSize: 18 }}>/6</span></div><div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>connectors healthy</div></div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 99, background: "rgba(240,163,60,.1)", border: "1px solid rgba(240,163,60,.24)", fontFamily: FONT.mono, fontSize: 11, color: C.orange }}><span style={{ width: 6, height: 6, borderRadius: 99, background: C.orange }} />1 degraded</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 99, background: "rgba(103,173,255,.1)", border: "1px solid rgba(103,173,255,.24)", fontFamily: FONT.mono, fontSize: 11, color: C.blue }}><span style={{ width: 6, height: 6, borderRadius: 99, background: C.blue }} />1 syncing</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 1.4, minWidth: 0 }}>
          <div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 12 }}>Connectors</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
            <Connector name="Mayor's Exchange mailbox" kind="IMAP" dot={C.green} pct={99} meta="synced 4m ago · 99%" count="61,204 msgs" />
            <Connector name="Forwarded constituent box" kind="IMAP" dot={C.green} pct={96} meta="synced 12m ago · 96%" count="6,140 msgs" />
            <Connector name="Public Works nightly CSV" kind="CSV" dot={C.orange} pct={78} meta="2 columns unmapped · 78%" count="2,890 rows" degraded />
            <Connector name="Permit & inspection PDFs" kind="PDF" dot={C.green} meta="synced 1h ago · OCR parsed" count="197 docs" />
            <Connector name="311 legacy portal scrape" kind="SCRAPE" dot={C.blue} meta="syncing… 1,204 of ~3,500" syncing />
            <div style={{ border: "1px dashed rgba(255,255,255,.16)", borderRadius: 15, padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: C.dim, flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: C.text2 }}>Clerk / Open Meetings</div><div style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.dim, marginTop: 2 }}>not connected</div></div></div>
              <button style={{ cursor: "pointer", padding: 7, borderRadius: 9, background: "rgba(103,173,255,.16)", border: "1px solid rgba(103,173,255,.32)", color: C.blue, fontSize: 12, fontWeight: 700, fontFamily: FONT.sans, marginTop: "auto" }}>Connect</button>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 12 }}>Review queue · the moat</div>
          <div style={{ background: "linear-gradient(180deg,rgba(157,139,255,.1),rgba(157,139,255,.02))", border: "1px solid rgba(157,139,255,.26)", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}><span style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(157,139,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={["M16 3a4 4 0 0 1 0 8M8 3a4 4 0 0 0 0 8M12 13c-4 0-7 2-7 5v3h14v-3c0-3-3-5-7-5z"]} w={20} sw={1.8} stroke={C.purpleText} /></span><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>12 ambiguous merges</div><div style={{ fontSize: 11.5, color: "#B9B1E8", marginTop: 1 }}>every mapping reversible</div></div></div>
            <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 13, padding: 14 }}>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45, marginBottom: 11 }}>Is <span style={{ fontFamily: FONT.mono, color: C.purpleText }}>m.reyes@gmail.com</span> the same person as <span style={{ fontWeight: 600 }}>Ald. Maria Reyes</span>?</div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.muted, flex: 1 }}>confidence 0.81</span>
                <button style={{ cursor: "pointer", padding: "7px 15px", borderRadius: 9, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: C.text2, fontSize: 12, fontWeight: 600, fontFamily: FONT.sans }}>Reject</button>
                <button style={{ cursor: "pointer", padding: "7px 15px", borderRadius: 9, background: C.green, border: 0, color: "#062418", fontSize: 12, fontWeight: 700, fontFamily: FONT.sans }}>Merge</button>
              </div>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, textAlign: "center" }}>11 more in queue</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ APPROVALS ════════════════════════ */
function Approvals() {
  const { data, reload } = useApi<{ drafts: DraftRow[] }>("/api/approvals");
  const drafts = data?.drafts ?? [];
  const act = async (draftId: string, action: "approve" | "discard") => {
    await postJson("/api/approvals", { action, draftId });
    reload();
  };
  return (
    <div className="fu" style={{ padding: "30px 36px 48px", maxWidth: 1240 }}>
      <div style={{ marginBottom: 20 }}><div style={{ fontFamily: FONT.serif, fontSize: 32, fontWeight: 500, color: C.text, lineHeight: 1 }}>Approvals</div><div style={{ fontSize: 14, color: C.text3, marginTop: 5 }}>Agents draft. You decide.</div></div>
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        <div style={{ flex: 1.5, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><span style={{ ...eyebrow(C.dim), fontSize: 10.5 }}>Awaiting you</span><Badge color={C.purpleText} bg="rgba(157,139,255,.16)">{drafts.length || 3} draft{(drafts.length || 3) === 1 ? "" : "s"}</Badge></div>
          {drafts.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {drafts.map((d) => (
                <div key={d.draftId} style={{ ...card, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(157,139,255,.16)", color: C.purpleText, fontFamily: FONT.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".05em" }}>{d.agent.toUpperCase()}</span><span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT.mono, fontSize: 9.5, color: C.muted }}><span style={{ width: 5, height: 5, borderRadius: 999, background: C.purple }} />drafted · not sent</span></div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{d.subject ?? "Draft reply"}</div>
                  <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5, fontFamily: FONT.serif, fontStyle: "italic", borderLeft: "2px solid rgba(157,139,255,.4)", paddingLeft: 12, whiteSpace: "pre-wrap" }}>{d.body.slice(0, 280)}{d.body.length > 280 ? "…" : ""}</div>
                  <div style={{ display: "flex", gap: 9 }}>
                    <button onClick={() => act(d.draftId, "discard")} style={btnGhost}>Discard</button>
                    <button onClick={() => act(d.draftId, "approve")} style={{ ...btnGreen, flex: 1.4 }}>Approve &amp; send</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <DraftCard agent="DRAFTING AGENT" agentColor={C.purpleText} agentBg="rgba(157,139,255,.16)" note="drafted · not sent" title="Reply to Ald. Reyes — rezoning hearing date" quote="&quot;Maria — the 19th Ave hearing is set for July 9 at 6:30 PM. I've asked the clerk to send you the packet…&quot;" full />
              <DraftCard agent="BOARD PREP" agentColor={C.blue} agentBg="rgba(103,173,255,.16)" note="for Jul 8 meeting" title="Briefing memo — June board packet" body="7 agenda items summarized · 4 linked to open commitments" />
              <DraftCard agent="GRANT RADAR" agentColor={C.gold} agentBg="rgba(231,181,60,.16)" note="9 days to deadline" noteColor={C.orange} title="Intent letter — IEPA stormwater grant" body="$1.4M · pre-filled from 3 prior flooding threads" />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 4 }}>Agent autonomy</div><div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>No agent gains authority without measured eval evidence. <span style={{ color: C.text2 }}>Highest-stakes actions stay locked.</span></div></div>
          <div style={{ ...card, overflow: "hidden" }}>
            <AutonomyRow name="Morning Brief" sub="· read-only" level="Auto" levelColor={C.green} />
            <AutonomyRow name="Drafting & replies" level="Draft" levelColor={C.purple} locked />
            <AutonomyRow name="Commitment Tracker" level="Draft" levelColor={C.purple} locked />
            <AutonomyRow name="Compliance Watchtower" sub="· FOIA-sensitive" level="Suggest" levelColor={C.blue} locked last />
          </div>
          <div style={{ ...card, padding: 15, display: "flex", alignItems: "center", gap: 13 }}>
            <Ico d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M9 15l2 2 4-4"]} w={19} sw={1.8} stroke={C.blue} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>Audit trail</div><div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>every retrieval, draft &amp; action logged</div></div>
          </div>
          <div style={{ textAlign: "center", fontFamily: FONT.mono, fontSize: 9.5, color: "#445", letterSpacing: ".05em" }}>VILLAGE OF BELLWOOD · INSTITUTIONAL MEMORY v1.0</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ small shared bits ════════════════════════ */
const Kbd = ({ children }: { children: ReactNode }) => <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim2, border: "1px solid rgba(255,255,255,.12)", borderRadius: 5, padding: "1px 5px" }}>{children}</span>;
const Badge = ({ children, color, bg }: { children: ReactNode; color: string; bg: string }) => <span style={{ fontFamily: FONT.mono, fontSize: 10, color, background: bg, borderRadius: 6, padding: "1px 6px", fontWeight: 600 }}>{children}</span>;
function RailHead({ label, action, onAction }: { label: string; action: string; onAction: () => void }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><span style={eyebrow(C.dim)}>{label}</span><button onClick={onAction} style={{ background: "none", border: 0, color: C.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT.sans }}>{action}</button></div>;
}
function DueRow({ dot, title, sub, onClick, border }: { dot: string; title: string; sub: string; onClick: () => void; border?: boolean }) {
  return <button onClick={onClick} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: 0, borderBottom: border ? `1px solid ${C.line2}` : 0, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{title}</div><div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{sub}</div></div></button>;
}
function Stat({ n, label, color, bg = "rgba(255,255,255,.04)", bd = C.cardBd }: { n: string; label: string; color: string; bg?: string; bd?: string }) {
  return <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: "12px 18px" }}><div style={{ fontFamily: FONT.serif, fontSize: 26, color, lineHeight: 1 }}>{n}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{label}</div></div>;
}
function MStat({ n, l, color = C.text, border }: { n: string; l: string; color?: string; border?: boolean }) {
  return <div style={{ textAlign: "center", padding: "0 16px", borderLeft: border ? "1px solid rgba(255,255,255,.08)" : 0 }}><div style={{ fontFamily: FONT.serif, fontSize: 22, color }}>{n}</div><div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{l}</div></div>;
}
function EntityRow({ initials, icon, name, sub, right, rightColor = C.gold, active }: { initials?: string; icon?: boolean; name: string; sub: string; right: string; rightColor?: string; active?: boolean }) {
  return (
    <div style={{ background: active ? "rgba(231,181,60,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${active ? "rgba(231,181,60,.3)" : "rgba(255,255,255,.07)"}`, borderRadius: 13, padding: "12px 13px", display: "flex", alignItems: "center", gap: 11 }}>
      {icon ? <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(103,173,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICON.brief} w={18} sw={1.8} stroke={C.blue} /></span>
        : <span style={{ width: 36, height: 36, borderRadius: 99, background: "linear-gradient(135deg,#1d3f6b,#0e2440)", border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.serif, fontSize: 14, color: active ? C.text : C.text2, flexShrink: 0 }}>{initials}</span>}
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: active ? 700 : 600, color: C.text }}>{name}</div><div style={{ fontSize: 11, color: C.text3 }}>{sub}</div></div>
      <span style={{ fontFamily: FONT.mono, fontSize: right === "REOPEN" ? 9 : 10, color: rightColor }}>{right}</span>
    </div>
  );
}
function Interaction({ date, title, tags, border }: { date: string; title: string; tags: [string, string, string][]; border?: boolean }) {
  return <div style={{ padding: "14px 16px", borderBottom: border ? `1px solid ${C.line2}` : 0, display: "flex", gap: 13, alignItems: "flex-start" }}><span style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.dim, width: 48, flexShrink: 0, paddingTop: 1 }}>{date}</span><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{title}</div><div style={{ display: "flex", gap: 6, marginTop: 6 }}>{tags.map((t, i) => <span key={i} style={{ padding: "2px 8px", borderRadius: 999, background: t[2], color: t[1], fontFamily: FONT.mono, fontSize: 9 }}>{t[0]}</span>)}</div></div></div>;
}
function Connector({ name, kind, dot, pct, meta, count, degraded, syncing }: { name: string; kind: string; dot: string; pct?: number; meta: string; count?: string; degraded?: boolean; syncing?: boolean }) {
  return (
    <div style={{ ...card, ...(degraded ? { background: "linear-gradient(180deg,rgba(240,163,60,.08),rgba(240,163,60,.02))", border: "1px solid rgba(240,163,60,.28)" } : syncing ? { background: "linear-gradient(180deg,rgba(103,173,255,.07),rgba(103,173,255,.01))", border: "1px solid rgba(103,173,255,.24)" } : {}), borderRadius: 15, padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0, animation: syncing ? "pulseDot 1s infinite" : degraded ? "pulseDot 1.8s infinite" : "none" }} /><span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, flex: 1 }}>{name}</span><span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,.07)", fontFamily: FONT.mono, fontSize: 9, color: "#9fb2c8" }}>{kind}</span></div>
      {pct != null && <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: dot, borderRadius: 999 }} /></div>}
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT.mono, fontSize: 9.5, color: degraded ? C.orangeText : syncing ? C.blue : C.muted, marginTop: pct == null ? "auto" : 0 }}><span>{meta}</span>{count && <span>{count}</span>}</div>
    </div>
  );
}
function DraftCard({ agent, agentColor, agentBg, note, noteColor = C.muted, title, quote, body, full }: { agent: string; agentColor: string; agentBg: string; note: string; noteColor?: string; title: string; quote?: string; body?: string; full?: boolean }) {
  return (
    <div style={{ ...card, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: full ? 12 : 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ padding: "3px 8px", borderRadius: 6, background: agentBg, color: agentColor, fontFamily: FONT.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".05em" }}>{agent}</span><span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT.mono, fontSize: 9.5, color: noteColor }}>{full && <span style={{ width: 5, height: 5, borderRadius: 999, background: C.purple }} />}{note}</span></div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{title}</div>
      {quote && <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.5, fontFamily: FONT.serif, fontStyle: "italic", borderLeft: "2px solid rgba(157,139,255,.4)", paddingLeft: 12 }}>{quote}</div>}
      {body && <div style={{ fontSize: 12.5, color: C.text3 }}>{body}</div>}
      <div style={{ display: "flex", gap: 9 }}>
        {full && <button style={btnGhost}>Discard</button>}
        <button style={btnGhost}>{full ? "Review & edit" : "Review"}</button>
        <button style={{ ...btnGreen, flex: full ? 1.4 : 1 }}>{full ? "Approve & send" : "Approve"}</button>
      </div>
    </div>
  );
}
function AutonomyRow({ name, sub, level, levelColor, locked, last }: { name: string; sub?: string; level: string; levelColor: string; locked?: boolean; last?: boolean }) {
  const levels = ["Suggest", "Draft", "Auto"];
  return (
    <div style={{ padding: "14px 16px", borderBottom: last ? 0 : `1px solid ${C.line2}` }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 9 }}>{name}{sub && <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}> {sub}</span>}</div>
      <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,.25)", borderRadius: 9, padding: 3 }}>
        {levels.map((l) => {
          const on = l === level;
          const isAuto = l === "Auto" && locked;
          return <span key={l} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "7px 0", borderRadius: 7, fontSize: 11, fontWeight: on ? 700 : 400, background: on ? levelColor : "transparent", color: on ? "#0a1322" : isAuto ? "#566" : C.muted }}>
            {isAuto && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#566677" strokeWidth="2.4"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>}{l}
          </span>;
        })}
      </div>
    </div>
  );
}

const btnGhost: CSSProperties = { flex: 1, cursor: "pointer", padding: 10, borderRadius: 10, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: C.text, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans };
const btnGreen: CSSProperties = { cursor: "pointer", padding: 10, borderRadius: 10, background: C.green, border: 0, color: "#062418", fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans };

function streamPill(stream: string): CSSProperties {
  const map: Record<string, [string, string]> = {
    Police: [C.blue, "rgba(103,173,255,.14)"], "Fire/EMS": [C.red, "rgba(255,107,94,.14)"],
    Resident: [C.gold, "rgba(231,181,60,.12)"], Business: [C.green, "rgba(52,201,139,.12)"],
    Interdepartmental: [C.purpleText, "rgba(157,139,255,.14)"], "Civic/FOIA": [C.text2, "rgba(255,255,255,.06)"],
    Regional: [C.text2, "rgba(255,255,255,.06)"],
  };
  const [c, bg] = map[stream] || [C.text2, "rgba(255,255,255,.06)"];
  return { padding: "2px 8px", borderRadius: 999, background: bg, color: c, fontFamily: FONT.mono, fontSize: 9 };
}

const KEYFRAMES = `
@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes scrnIn{from{opacity:.4;transform:translateY(8px)}to{opacity:1;transform:none}}
.fu{animation:scrnIn .34s cubic-bezier(.22,.61,.36,1)}
.scrl::-webkit-scrollbar{width:9px;height:9px}
.scrl::-webkit-scrollbar-track{background:transparent}
.scrl::-webkit-scrollbar-thumb{background:rgba(255,255,255,.09);border-radius:99px}
.scrl::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.16)}
`;
