"use client";
/*
 * MobileApp — the dedicated mobile UI for the Mayor's Chief of Staff (≤768px).
 * Mobile-first: a thumb-zone bottom tab bar (Brief · Commitments · Ask(center) ·
 * Memory · More), full-screen Ask sheet with voice, and stacked single-column
 * screens. Shares the same /api/* endpoints, demo data, and theme tokens as the
 * desktop app — the desktop ChiefApp is untouched.
 */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { C, FONT } from "@/lib/cos-design";
import AdminPanel from "./AdminPanel";
import AgentsPage from "./AgentsPage";
import { getRecentSearches, addRecentSearch } from "@/lib/recent-searches";
import { getEnabledTabs } from "@/lib/email-config";

const CAT_META: Record<string, [string, string]> = {
  urgent: [C.red, "Urgent"], important: [C.gold, "Important"], social: [C.green, "Social"], spam: [C.dim, "Spam"], general: [C.muted, "General"],
};
import type { AskResponse, Source, EmailDetail } from "@/lib/types";

/** Open the actual source email from anywhere an email is referenced. */
const EmailCtx = createContext<(mid: string) => void>(() => {});
const useOpenEmail = () => useContext(EmailCtx);
import type { NeedsYouToday } from "@/lib/capabilities";
import type { EntityListItem, MemoryDetail, SourcesOverview, DraftRow } from "@/lib/screens";

/* ── data ── */
function useApi<T>(url: string | null): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) { setLoading(false); return; }
    let live = true; setLoading(true);
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => live && setData(d))
      .catch(() => live && setData(null)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [url, tick]);
  return { data, loading, reload: () => setTick((t) => t + 1) };
}
async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.ok ? await r.json() : null; } catch { return null; }
}

/* ── icons ── */
const I = {
  emails: "M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  events: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  history: "M12 7v5l3.5 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z",
  source: "M4 5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  brief: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5",
  commit: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  memory: "M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3",
  sources: "M4 5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  approvals: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  admin: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  back: "M19 12H5M12 19l-7-7 7-7",
  close: "M18 6 6 18M6 6l12 12",
  mic: "M9 2h6v12a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3",
};
function Svg({ d, w = 22, sw = 1.9, fill = "none" }: { d: string; w?: number; sw?: number; fill?: string }) {
  return <svg width={w} height={w} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d.split("M").filter(Boolean).map((p, i) => <path key={i} d={"M" + p} />)}</svg>;
}

type Screen = "emails" | "events" | "history" | "source";
type MoreView = null | "admin" | "agents";
const THEME_CYCLE = ["midnight", "dim", "daylight", "contrast"];

const streamColor: Record<string, string> = {
  Police: C.blue, "Fire/EMS": C.red, Business: C.purpleText, Interdepartmental: C.gold,
  "Civic/FOIA": C.orange, Regional: C.greenText, Resident: C.green,
};
const chip = (label: string, color: string): CSSProperties => ({
  display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 700,
  fontFamily: FONT.sans, color, background: "rgba(var(--ink),.1)", border: `1px solid rgba(var(--ink),.1)`, letterSpacing: ".01em",
});
const cardS: CSSProperties = { background: "linear-gradient(180deg,rgba(var(--ink),.05),rgba(var(--ink),.018))", border: "1px solid var(--c-cardbd)", borderRadius: 16, padding: 16 };

export default function MobileApp() {
  const [screen, setScreen] = useState<Screen>("emails");
  const [moreView, setMoreView] = useState<MoreView>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [emailMid, setEmailMid] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Swipe-down to refresh: remount the active screen so its useApi hooks refetch.
  async function doRefresh() {
    setRefreshKey((k) => k + 1);
    await new Promise((r) => setTimeout(r, 700));
  }

  return (
    <EmailCtx.Provider value={setEmailMid}>
      <div style={{ minHeight: "100dvh", background: "var(--c-appbg)", color: C.text, fontFamily: FONT.sans, paddingBottom: "calc(74px + env(safe-area-inset-bottom))" }}>
        <Header />
        <PullToRefresh onRefresh={doRefresh}>
          <div key={refreshKey} style={{ padding: "8px 0 20px" }}>
            {screen === "emails" && <EmailsScreen onAsk={() => setAskOpen(true)} />}
            {screen === "events" && <EventsScreen />}
            {screen === "history" && <HistoryScreen />}
            {screen === "source" && <SourceScreen view={moreView} setView={setMoreView} />}
          </div>
        </PullToRefresh>

        <BottomNav screen={screen} go={(s) => { setScreen(s); setMoreView(null); }} onAsk={() => setAskOpen(true)} />
        {askOpen && <AskSheet onClose={() => setAskOpen(false)} />}
        {emailMid && <EmailSheet mid={emailMid} onClose={() => setEmailMid(null)} />}
      </div>
    </EmailCtx.Provider>
  );
}

/* ── pull / swipe-down to refresh ──
 * Native-feeling: only engages when the page is scrolled to the very top, applies
 * rubber-band resistance, and shows a spinner that fills in as you pull past the
 * threshold. Releasing past the threshold triggers onRefresh. */
function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  const THRESHOLD = 72;
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  function start(e: React.TouchEvent) {
    startY.current = (typeof window !== "undefined" && window.scrollY <= 0 && !refreshing) ? e.touches[0].clientY : null;
  }
  function move(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && window.scrollY <= 0) {
      setPull(Math.min(dy * 0.5, 96)); // rubber-band resistance + cap
    } else if (dy <= 0) {
      setPull(0);
    }
  }
  async function end() {
    if (startY.current === null) return;
    const trigger = pull >= THRESHOLD;
    startY.current = null;
    if (trigger && !refreshing) {
      setRefreshing(true);
      setPull(52);
      try { await onRefresh(); } finally { setRefreshing(false); setPull(0); }
    } else {
      setPull(0);
    }
  }

  const armed = pull >= THRESHOLD;
  const progress = Math.min(pull / THRESHOLD, 1);
  return (
    <div onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end} style={{ position: "relative", overscrollBehaviorY: "contain" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(pull, 0), display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, pointerEvents: "none", overflow: "hidden" }}>
        <span style={{
          width: 30, height: 30, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(var(--ink),.06)", border: "1px solid var(--c-cardbd)", opacity: Math.min(progress + 0.15, 1),
          color: armed || refreshing ? C.gold : C.dim,
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: refreshing ? "cosSpin .8s linear infinite" : undefined, transform: refreshing ? undefined : `rotate(${armed ? 180 : 0}deg)`, transition: "transform .18s" }}>
            {refreshing
              ? <path d="M21 12a9 9 0 1 1-6.2-8.5" />
              : <path d="M12 5v14M6 13l6 6 6-6" />}
          </svg>
        </span>
      </div>
      <div style={{ transform: `translateY(${pull}px)`, transition: startY.current === null ? "transform .24s cubic-bezier(.2,.8,.2,1)" : "none" }}>
        {children}
      </div>
    </div>
  );
}

/** The lowest level: the actual source email body. Opened from any reference. */
function EmailSheet({ mid, onClose }: { mid: string; onClose: () => void }) {
  const { data } = useApi<EmailDetail>(`/api/email?mid=${encodeURIComponent(mid)}`);
  return (
    <Sheet title={data?.subject || "Source email"} onClose={onClose}>
      {!data ? <Loading label="Opening the source document…" /> : (
        <div style={{ padding: "0 16px 32px" }}>
          <div style={{ ...cardS, padding: 14, marginBottom: 14 }}>
            <Row k="From" v={`${data.fromName ?? ""}${data.fromEmail ? ` · ${data.fromEmail}` : ""}`} />
            <Row k="To" v={data.toEmail} />
            {data.cc && <Row k="Cc" v={data.cc} />}
            <Row k="Date" v={new Date(data.date).toLocaleString()} />
            <Row k="Stream" v={`${data.stream}${data.topic ? ` · ${data.topic}` : ""}`} />
          </div>
          <div style={{ fontFamily: FONT.serif, fontSize: 20, fontWeight: 500, lineHeight: 1.3, marginBottom: 14 }}>{data.subject || "(no subject)"}</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: C.text2, whiteSpace: "pre-wrap" }}>{data.bodyRaw || data.bodyClean}</div>
        </div>
      )}
    </Sheet>
  );
}
function Row({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 13 }}>
      <span style={{ flex: "0 0 48px", fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, textTransform: "uppercase", paddingTop: 2 }}>{k}</span>
      <span style={{ flex: 1, color: C.text2, minWidth: 0 }}>{v}</span>
    </div>
  );
}

/* ── header ── */
function Header() {
  const [theme, setTheme] = useState("midnight");
  useEffect(() => { try { setTheme(localStorage.getItem("bw-theme") || "midnight"); } catch { /* */ } }, []);
  function cycle() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    try { localStorage.setItem("bw-theme", next); } catch { /* */ }
    document.documentElement.setAttribute("data-theme", next); setTheme(next);
  }
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 11, padding: "calc(env(safe-area-inset-top) + 12px) 18px 12px", background: "rgba(var(--ink),.04)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--c-cardbd)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,var(--c-goldhi),var(--c-goldlo))", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a1322" }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z" /></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 16, fontWeight: 600, lineHeight: 1 }}>Chief of Staff</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: ".12em", color: C.dim, marginTop: 2 }}>INSTITUTIONAL MEMORY</div>
      </div>
      <button onClick={cycle} aria-label="Theme" style={{ width: 36, height: 36, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {theme === "daylight"
          ? <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2l1.8 1.8M19 5l-1.8 1.8M6.8 17.2 5 19" /></svg>
          : <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
      </button>
    </div>
  );
}

/* ── BRIEF ── */
interface InboxItem { messageId: string; fromName: string | null; subject: string | null; snippet: string; date: string; stream: string; topic: string | null; cat: string; }
const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return iso.slice(5, 10); } };

/* A dense, traditional inbox row — scales to hundreds of messages. */
function InboxRow({ from, time, subject, snippet, dot, tag, tagColor, onClick }: {
  from: string; time: string; subject: string; snippet: string; dot?: string; tag?: string; tagColor?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{ display: "flex", gap: 11, width: "100%", textAlign: "left", padding: "11px 16px", borderBottom: "1px solid var(--c-cardbd)", background: "transparent", alignItems: "flex-start", color: C.text }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: dot || "transparent", flexShrink: 0, marginTop: 6 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ flex: 1, minWidth: 0, fontWeight: dot ? 700 : 600, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{from || "—"}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, flexShrink: 0 }}>{time}</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.text2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subject || "(no subject)"}</div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 3 }}>
          {tag && <span style={{ ...chip(tag, tagColor || C.muted), flexShrink: 0 }}>{tag}</span>}
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{snippet}</span>
        </div>
      </div>
    </button>
  );
}

/* EMAILS — agent-sorted inbox: Urgent / Important / Social / Spam / Inbox / Agent Answered. */
function EmailsScreen({ onAsk }: { onAsk: () => void }) {
  const { data: appr, reload } = useApi<{ drafts: DraftRow[] }>("/api/approvals");
  const { data: inbox } = useApi<{ count: number; emails: InboxItem[]; counts: Record<string, number> }>("/api/inbox");
  const openEmail = useOpenEmail();
  const enabledCats = getEnabledTabs();
  const [tab, setTab] = useState<string>(enabledCats[0] ?? "all");

  const queued = appr?.drafts ?? [];
  const emails = inbox?.emails ?? [];
  const counts = inbox?.counts ?? {};
  const empty = (t: string) => <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>{t}</div>;
  const tabs: [string, string, number][] = [
    ...enabledCats.map((c) => [c, CAT_META[c]?.[1] ?? c, counts[c] ?? 0] as [string, string, number]),
    ["all", "Inbox", inbox?.count ?? 0],
    ["queued", "Agent Answered", queued.length],
  ];
  const shown = tab === "all" ? emails : tab === "queued" ? [] : emails.filter((e) => e.cat === tab);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 0" }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 27, fontWeight: 500, lineHeight: 1 }}>Emails</div>
        <button onClick={onAsk} aria-label="Search" style={{ marginLeft: "auto", width: 38, height: 38, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}><Svg d={I.search} w={18} /></button>
      </div>
      <div style={{ display: "flex", gap: 7, padding: "12px 16px 6px", overflowX: "auto" }}>
        {tabs.map(([k, label, n]) => {
          const on = tab === k;
          return <button key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, cursor: "pointer", padding: "7px 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, background: on ? C.gold : "transparent", color: on ? "#081627" : C.text3, border: `1px solid ${on ? C.gold : "var(--c-cardbd)"}` }}>{label}{n > 0 ? ` ${n}` : ""}</button>;
        })}
      </div>

      {tab !== "queued" && (<div>
        {!inbox && <Loading label="Loading inbox…" />}
        {shown.map((e) => <InboxRow key={e.messageId} from={e.fromName || "—"} time={fmtTime(e.date)} subject={e.subject || ""} snippet={e.snippet}
          dot={e.cat === "urgent" ? C.red : undefined} tag={CAT_META[e.cat]?.[1] ?? e.stream} tagColor={CAT_META[e.cat]?.[0] ?? C.muted} onClick={() => openEmail(e.messageId)} />)}
        {inbox && shown.length === 0 && empty("Nothing here.")}
      </div>)}

      {tab === "queued" && (<div>
        {appr && queued.length === 0 && empty("Nothing queued to send.")}
        {queued.map((d) => (
          <div key={d.draftId} style={{ borderBottom: "1px solid var(--c-cardbd)", padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>To · {d.recipients}</span>
              <span style={chip("draft", C.purpleText)}>draft</span>
            </div>
            <div style={{ fontSize: 13.5, color: C.text2, marginTop: 2 }}>{d.subject}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.5, maxHeight: 54, overflow: "hidden" }}>{d.body}</div>
            <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
              <button onClick={async () => { await postJson("/api/approvals", { action: "discard", draftId: d.draftId }); reload(); }} style={{ flex: 1, padding: 9, borderRadius: 9, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, fontSize: 12.5, fontWeight: 600 }}>Discard</button>
              <button onClick={async () => { await postJson("/api/approvals", { action: "approve", draftId: d.draftId }); reload(); }} style={{ flex: 1, padding: 9, borderRadius: 9, border: 0, background: C.green, color: "#062418", fontSize: 12.5, fontWeight: 700 }}>Approve &amp; send</button>
            </div>
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 8, fontFamily: FONT.mono }}>drafted by the Drafting Agent · R3 · never auto-sent</div>
          </div>
        ))}
      </div>)}
    </div>
  );
}

/* ── CALENDAR (agenda: dates with their events) ── */
interface EventItem {
  id: string; title: string; who: string | null; role: string; dueLabel: string;
  status: "open" | "late" | "done"; stream: string; messageId: string; date: string;
}
const evDot: Record<string, string> = { open: C.blue, late: C.orange, done: C.greenText };
function dayLabel(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
  catch { return iso.slice(0, 10); }
}
function dayStrip(maxDay: string, n = 30): string[] {
  const out: string[] = [];
  const end = new Date(maxDay + "T00:00:00");
  const start = new Date(end); start.setDate(start.getDate() - (n - 1));
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d).toISOString().slice(0, 10));
  return out;
}
function EventsScreen() {
  const { data } = useApi<{ events: EventItem[]; stats: { open: number; late: number; done: number } }>("/api/events");
  const openEmail = useOpenEmail();
  const evs = data?.events ?? [];
  const byDay = new Map<string, EventItem[]>();
  for (const e of evs) { const d = e.date.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(e); }
  const eventDays = [...byDay.keys()].sort();
  const maxDay = eventDays.length ? eventDays[eventDays.length - 1] : new Date().toISOString().slice(0, 10);
  const strip = dayStrip(maxDay, 30);
  const [sel, setSel] = useState(maxDay);
  const [view, setView] = useState<"calendar" | "meetings">("calendar");
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSel(maxDay); }, [maxDay]);
  useEffect(() => { if (stripRef.current) stripRef.current.scrollLeft = stripRef.current.scrollWidth; }, [strip.length]);
  const dayEvents = byDay.get(sel) ?? [];

  return (
    <div>
      <ScreenHead title="Calendar" sub="Your days and what's on them — synced from Outlook." stats={[[String(data?.stats.open ?? "—"), "open"], [String(data?.stats.late ?? "—"), "overdue"], [String(data?.stats.done ?? "—"), "done"]]} />
      <div style={{ display: "flex", gap: 8, padding: "2px 16px 12px" }}>
        {(["calendar", "meetings"] as const).map((v) => {
          const on = view === v;
          return <button key={v} onClick={() => setView(v)} style={{ cursor: "pointer", padding: "7px 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, background: on ? C.gold : "transparent", color: on ? "#081627" : C.text3, border: `1px solid ${on ? C.gold : "var(--c-cardbd)"}` }}>{v === "calendar" ? "Calendar" : "Events & Meetings"}</button>;
        })}
      </div>

      {view === "calendar" && (<>
        <div ref={stripRef} style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 16px 14px", WebkitOverflowScrolling: "touch" as never }}>
          {strip.map((d) => {
            const on = d === sel; const dt = new Date(d + "T00:00:00"); const count = byDay.get(d)?.length ?? 0;
            return (
              <button key={d} onClick={() => setSel(d)} style={{ flexShrink: 0, width: 50, padding: "8px 0 6px", borderRadius: 13, border: `1px solid ${on ? C.gold : "var(--c-cardbd)"}`, background: on ? C.gold : "rgba(var(--ink),.04)", color: on ? "#081627" : C.text2, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer" }}>
                <span style={{ fontSize: 9.5, fontFamily: FONT.mono, opacity: 0.85 }}>{dt.toLocaleDateString("en-US", { weekday: "short" })}</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{dt.getDate()}</span>
                <span style={{ width: 5, height: 5, borderRadius: 99, background: count ? (on ? "#081627" : C.gold) : "transparent" }} />
              </button>
            );
          })}
        </div>
        <div style={{ padding: "0 18px 8px", fontFamily: FONT.mono, fontSize: 11, letterSpacing: ".05em", color: C.dim, textTransform: "uppercase" }}>{new Date(sel + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}</div>
        {!data && <Loading />}
        {data && dayEvents.length === 0 && <div style={{ padding: "30px 16px", textAlign: "center", color: C.dim, fontSize: 13 }}>Nothing on this day.</div>}
        {dayEvents.map((e) => <EventRow key={e.id} e={e} onClick={() => openEmail(e.messageId)} />)}
      </>)}

      {view === "meetings" && (<>
        {!data && <Loading />}
        {data && evs.length === 0 && <div style={{ padding: "30px 16px", textAlign: "center", color: C.dim, fontSize: 13 }}>No events or meetings.</div>}
        {[...evs].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
          <EventRow key={e.id} e={e} day={fmtTime(e.date)} onClick={() => openEmail(e.messageId)} />
        ))}
      </>)}
    </div>
  );
}
function EventRow({ e, day, onClick }: { e: EventItem; day?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", gap: 12, width: "100%", textAlign: "left", padding: "12px 16px", borderBottom: "1px solid var(--c-cardbd)", background: "transparent", color: C.text, alignItems: "flex-start" }}>
      <span style={{ width: 9, height: 9, borderRadius: 99, background: evDot[e.status] || C.muted, flexShrink: 0, marginTop: 5 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
          <span style={{ fontSize: 11, color: e.status === "late" ? C.orange : C.dim, fontFamily: FONT.mono, flexShrink: 0 }}>{day || e.dueLabel}</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>{e.role} · {e.who}</div>
      </div>
    </button>
  );
}

/* ── MEMORY ── */
function HistoryScreen() {
  const { data } = useApi<{ entities: EntityListItem[] }>("/api/memory");
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const list = (data?.entities || []).filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <ScreenHead title="History" sub="The full record on every person and property." />
      <div style={{ padding: "0 16px 8px" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people & places…"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text, fontSize: 15, outline: "none", fontFamily: FONT.sans }} />
      </div>
      <div style={{ display: "grid", gap: 8, padding: "0 16px" }}>
        {list.map((e) => (
          <button key={e.entityId} onClick={() => setSel(e.name)} style={{ ...cardS, padding: 13, display: "flex", alignItems: "center", gap: 12, textAlign: "left", color: C.text }}>
            <div style={{ width: 38, height: 38, borderRadius: 99, background: "rgba(var(--ink),.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: FONT.serif, fontSize: 16, color: C.gold }}>{e.name[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{e.kind} · {e.count} messages</div>
            </div>
            <Svg d="M9 6l6 6-6 6" w={16} />
          </button>
        ))}
        {!data && <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 13 }}>Loading…</div>}
      </div>
      {sel && <MemoryDetailSheet value={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
function MemoryDetailSheet({ value, onClose }: { value: string; onClose: () => void }) {
  const { data } = useApi<MemoryDetail>(`/api/memory?value=${encodeURIComponent(value)}`);
  const openEmail = useOpenEmail();
  return (
    <Sheet title={value} onClose={onClose}>
      {!data ? <Loading /> : (
        <div style={{ padding: "0 16px 24px" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat n={String(data.stats.count)} label="messages" />
            <Stat n={String(data.stats.issues)} label="issues" />
            <Stat n={String(data.stats.commitments)} label="commitments" />
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", marginBottom: 10 }}>Timeline</div>
          <div style={{ display: "grid", gap: 10 }}>
            {data.timeline.map((m) => (
              <button key={m.id} onClick={() => openEmail(m.messageId)} style={{ ...cardS, textAlign: "left", color: C.text, display: "block", width: "100%" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <span style={chip(m.direction === "inbound" ? "inbound" : "outbound", m.direction === "inbound" ? C.blue : C.green)}>{m.direction}</span>
                  <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>{m.date.slice(0, 10)}</span>
                  <Svg d="M7 17L17 7M9 7h8v8" w={12} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{m.subject || "(no subject)"}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{m.snippet}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ── MORE → Sources / Approvals / Admin ── */
function SourceScreen({ view, setView }: { view: MoreView; setView: (v: MoreView) => void }) {
  if (view === "admin") return <Sheet title="Admin" onClose={() => setView(null)}><div style={{ fontSize: 13 }}><AdminPanel /></div></Sheet>;
  if (view === "agents") return <Sheet title="Staff Agents" onClose={() => setView(null)}><AgentsPage /></Sheet>;
  const links: [MoreView, string, string][] = [
    ["agents", "M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z", "Staff Agents — track their work"],
    ["admin", I.admin, "Admin — models, cost, rules, themes"],
  ];
  return (
    <div>
      <ScreenHead title="Source" sub="Where the record comes from — every connector and source document." />
      <SourcesView />
      <div style={{ padding: "4px 16px 0", display: "grid", gap: 10 }}>
        {links.map(([v, d, label]) => (
          <button key={v} onClick={() => setView(v)} style={{ ...cardS, display: "flex", alignItems: "center", gap: 14, textAlign: "left", color: C.text, width: "100%" }}>
            <span style={{ color: C.gold }}><Svg d={d} w={20} /></span>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{label}</span>
            <Svg d="M9 6l6 6-6 6" w={16} />
          </button>
        ))}
      </div>
    </div>
  );
}
function SourcesView() {
  const { data } = useApi<SourcesOverview>("/api/sources");
  const dot: Record<string, string> = { healthy: C.green, syncing: C.blue, degraded: C.orange };
  if (!data) return <Loading />;
  return (
    <div style={{ padding: "0 16px 24px" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <Stat n={data.totals.messages.toLocaleString()} label="messages" />
        <Stat n={String(data.connectors.length)} label="connectors" />
        <Stat n={`${data.healthy}/${data.connectors.length}`} label="healthy" />
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {data.connectors.map((c) => (
          <div key={c.source} style={{ ...cardS, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: dot[c.status] || C.dim, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.source}</div>
                <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.dim, marginTop: 2 }}>{c.kind ? c.kind + " · " : ""}{c.total.toLocaleString()} msgs · {c.status}</div>
              </div>
            </div>
            {c.activity && c.activity.length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", listStyle: "none", padding: "9px 14px", borderTop: "1px solid var(--c-cardbd)", fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".05em", color: C.gold, textTransform: "uppercase" }}>Activity log ({c.activity.length}) ▾</summary>
                <div style={{ borderTop: "1px solid var(--c-cardbd)" }}>
                  {c.activity.map((a, i) => {
                    const [text, time] = a.split(" · ");
                    return (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "9px 14px", borderTop: i ? "1px solid var(--c-cardbd)" : undefined, alignItems: "flex-start" }}>
                        <span style={{ width: 5, height: 5, borderRadius: 99, background: /fail|⚠/i.test(text) ? C.red : C.green, flexShrink: 0, marginTop: 6 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.45 }}>{text}</div>
                          {time && <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, marginTop: 1 }}>{time}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
/* ── ASK sheet (full screen + voice) ── */
function AskSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [rec, setRec] = useState<"idle" | "rec" | "busy">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function run(question?: string) {
    const Q = (question ?? q).trim(); if (!Q) return;
    setQ(Q); addRecentSearch(Q); setLoading(true); setRes(null);
    const r = await postJson<AskResponse>("/api/ask", { question: Q });
    setRes(r); setLoading(false);
  }
  async function mic() {
    if (rec === "rec") { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRec("busy");
        const fd = new FormData(); fd.append("audio", new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }), "s.webm");
        try { const r = await fetch("/api/transcribe", { method: "POST", body: fd }); const d = await r.json().catch(() => ({})); if (d.text) { setQ(d.text); run(d.text); } } finally { setRec("idle"); }
      };
      mr.start(); recRef.current = mr; setRec("rec");
    } catch { setRec("idle"); }
  }
  const recent = getRecentSearches();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--c-appbg)", display: "flex", flexDirection: "column", animation: "sheetUp .22s ease-out" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top) + 12px) 16px 12px", borderBottom: "1px solid var(--c-cardbd)" }}>
        <button onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}><Svg d={I.close} w={18} /></button>
        <span style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 600 }}>AI Search</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ display: "flex", gap: 9, alignItems: "center", background: "rgba(var(--ink),.05)", border: "1.5px solid rgba(231,181,60,.4)", borderRadius: 14, padding: "6px 6px 6px 14px" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Ask anything…" style={{ flex: 1, background: "transparent", border: 0, outline: "none", fontSize: 16, color: C.text, fontFamily: FONT.sans }} />
          <button type="button" onClick={mic} aria-label="Voice" style={{ width: 38, height: 38, borderRadius: 99, border: 0, background: rec === "rec" ? "rgba(255,107,94,.18)" : "rgba(var(--ink),.06)", color: rec === "rec" ? C.red : C.muted, display: "flex", alignItems: "center", justifyContent: "center", animation: rec === "rec" ? "cosPulse 1.1s infinite" : undefined }}>
            {rec === "busy" ? <Svg d="M21 12a9 9 0 0 0-9-9" w={17} /> : <Svg d={I.mic} w={17} />}
          </button>
          <button type="submit" style={{ padding: "9px 16px", borderRadius: 10, border: 0, background: C.gold, color: "#081627", fontWeight: 700, fontSize: 14 }}>Ask</button>
        </form>

        {!res && !loading && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", marginBottom: 10 }}>Recent searches</div>
            {recent.length ? (
              <div style={{ display: "grid" }}>
                {recent.map((s) => (
                  <button key={s} onClick={() => run(s)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 2px", textAlign: "left", background: "transparent", border: 0, borderBottom: "1px solid var(--c-cardbd)", color: C.text2, fontSize: 14, width: "100%" }}>
                    <span style={{ color: C.dim }}><Svg d={I.search} w={15} /></span>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.dim }}>Your recent searches will appear here.</div>
            )}
          </div>
        )}
        {loading && <Loading label="Searching the archive…" />}
        {res && <AskResult res={res} />}
      </div>
    </div>
  );
}
function AskResult({ res }: { res: AskResponse }) {
  const openEmail = useOpenEmail();
  return (
    <div style={{ marginTop: 18 }}>
      {res.answer && <div style={{ fontFamily: FONT.serif, fontSize: 19, lineHeight: 1.5, color: C.text, whiteSpace: "pre-wrap", marginBottom: 18 }}>{res.answer}</div>}
      {res.who && (
        <div style={{ display: "grid", gap: 8 }}>
          {res.who.constituents.slice(0, 6).map((w, i) => (
            <div key={i} style={{ ...cardS, padding: 13, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: FONT.serif, fontSize: 18, color: C.gold }}>{w.count}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{w.name}</span>
            </div>
          ))}
        </div>
      )}
      {res.openItems && (
        <div style={{ display: "grid", gap: 9 }}>
          {res.openItems.map((o, i) => (
            <div key={i} style={cardS}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{o.subject}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 5 }}>{o.fromName} · {o.date.slice(0, 10)}</div>
            </div>
          ))}
        </div>
      )}
      {res.sources && res.sources.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", margin: "8px 0 10px" }}>Sources · {res.sources.length}</div>
          <div style={{ display: "grid", gap: 9 }}>
            {res.sources.map((s: Source) => (
              <button key={s.index} onClick={() => openEmail(s.messageId)} style={{ ...cardS, padding: 13, textAlign: "left", color: C.text, display: "block", width: "100%" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <span style={chip(`[${s.index}]`, C.gold)}>[{s.index}]</span>
                  <span style={chip(s.stream, streamColor[s.stream] || C.muted)}>{s.stream}</span>
                  <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{s.date.slice(0, 10)}</span>
                  <Svg d="M7 17L17 7M9 7h8v8" w={12} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.subject || "(no subject)"}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 5, lineHeight: 1.5 }}>{s.snippet}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── shared bits ── */
function ScreenHead({ title, sub, stats }: { title: string; sub?: string; stats?: [string, string][] }) {
  return (
    <div style={{ padding: "16px 18px 12px" }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 27, fontWeight: 500, lineHeight: 1 }}>{title}</div>
      {sub && <div style={{ fontSize: 13.5, color: C.text3, marginTop: 6 }}>{sub}</div>}
      {stats && (
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {stats.map(([n, l]) => <Stat key={l} n={n} label={l} />)}
        </div>
      )}
    </div>
  );
}
function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ flex: 1, ...cardS, padding: "11px 12px", textAlign: "center" }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 21, fontWeight: 600, color: C.text }}>{n}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Loading({ label = "Loading…" }: { label?: string }) {
  return <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>{label}</div>;
}
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--c-appbg)", display: "flex", flexDirection: "column", animation: "sheetUp .22s ease-out" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top) + 12px) 16px 12px", borderBottom: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.04)", backdropFilter: "blur(12px)" }}>
        <button onClick={onClose} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}><Svg d={I.back} w={18} /></button>
        <span style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", paddingTop: 14 }}>{children}</div>
    </div>
  );
}

/* ── bottom nav with center Ask FAB ── */
function BottomNav({ screen, go, onAsk }: { screen: Screen; go: (s: Screen) => void; onAsk: () => void }) {
  const Tab = ({ s, d, label }: { s: Screen; d: string; label: string }) => {
    const on = screen === s;
    return (
      <button onClick={() => go(s)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 0", border: 0, background: "transparent", color: on ? C.gold : C.dim }}>
        <Svg d={d} w={21} sw={on ? 2.1 : 1.8} />
        <span style={{ fontSize: 10, fontWeight: on ? 700 : 500, fontFamily: FONT.sans }}>{label}</span>
      </button>
    );
  };
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", alignItems: "flex-start", padding: "6px 8px calc(env(safe-area-inset-bottom) + 6px)", background: "rgba(var(--ink),.05)", backdropFilter: "blur(18px)", borderTop: "1px solid var(--c-cardbd)" }}>
      <Tab s="emails" d={I.emails} label="Emails" />
      <Tab s="events" d={I.events} label="Calendar" />
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <button onClick={onAsk} aria-label="Search" style={{ width: 58, height: 58, marginTop: -20, borderRadius: 99, border: "3px solid var(--c-appbg)", background: "linear-gradient(135deg,var(--c-goldhi),var(--c-goldlo))", color: "#0a1322", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(231,181,60,.4)" }}>
          <Svg d={I.search} w={24} sw={2.2} />
        </button>
      </div>
      <Tab s="history" d={I.history} label="History" />
      <Tab s="source" d={I.source} label="Source" />
    </div>
  );
}
