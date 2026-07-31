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
import WallScreen from "./WallScreen";
import QueueScreen from "./QueueScreen";
import NeedsYouScreen from "./NeedsYouScreen";
import ThreadView from "./ThreadView";
import { loadOperatorMode, saveOperatorMode } from "@/lib/operator-mode";
import { logUsage } from "@/lib/usage";
import SyncButton from "./SyncButton";
import NoteButton from "./NoteButton";
import ReleaseTag from "./ReleaseTag";
import AnswerMd from "./AnswerMd";
import Searching from "./Searching";
import ModelPicker from "./ModelPicker";
import AskEvalPanel from "./AskEvalPanel";
import NotesScreen from "./NotesScreen";
import ActivityScreen from "./ActivityScreen";
import SyncScreen from "./SyncScreen";
import { SyncProgressCard } from "./SyncProgress";
import DraftCard from "./DraftCard";
import FeedbackButton from "./FeedbackButton";
import UploadSource from "./UploadSource";
import { applyTheme, resolveTheme, watchAutoTheme } from "@/lib/theme";
import { getRecentSearches, addRecentSearch } from "@/lib/recent-searches";
import { getEnabledTabs } from "@/lib/email-config";
import { getIngested, type IngestedRecord } from "@/lib/ingested-sources";
import { SENSITIVITY_META, getSourceType } from "@/lib/source-types";
import { MAILBOXES, PROVIDER_META, type Mailbox } from "@/lib/mailboxes";
import { IS_LIVE_BUILD } from "@/lib/live";

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
async function postJson<T>(url: string, body: unknown, timeoutMs?: number): Promise<T | null> {
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      // Unbounded fetch is how a slow Ask became "it hung": on a phone the
      // request can outlive the server's own limit, and the spinner never ends.
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Why a request failed, so the UI can say something TRUE. Collapsing 401, 500
 *  and a timeout into one "took too long" message actively misleads — a
 *  rejected request is not a slow one (RD 2026-07-31). */
type PostFail = { kind: "timeout" | "auth" | "server" | "network" | "stopped"; status?: number };
async function postJsonDetailed<T>(url: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; fail: PostFail }> {
  try {
    // Two ways to end the wait: the caller's Stop button, or the timeout.
    const combined = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: combined,
    });
    if (r.ok) return { ok: true, data: (await r.json()) as T };
    if (r.status === 401 || r.status === 403) return { ok: false, fail: { kind: "auth", status: r.status } };
    return { ok: false, fail: { kind: "server", status: r.status } };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, fail: { kind: "stopped" } };
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return { ok: false, fail: { kind: timedOut ? "timeout" : "network" } };
  }
}

const askFailMessage = (f: PostFail): string =>
  f.kind === "stopped" ? "Stopped."
  : f.kind === "auth"    ? "You're signed out — sign in again and re-run the question."
  : f.kind === "network" ? "Couldn't reach the server. Check your connection and try again."
  : f.kind === "server"  ? `The search failed (error ${f.status ?? "?"}). It's not your question — try again shortly.`
  : "That question took too long to answer. Try narrowing it — a single topic or a shorter date range usually returns quickly.";

/** Ask fans out across retrieval passes before synthesis — a cross-reference
 *  question measured 47s warm. Generous headroom, but NOT unbounded: past this
 *  the user gets an honest error instead of an endless spinner. */
const ASK_TIMEOUT_MS = 290_000;

/* ── icons ── */
const I = {
  warn: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  today: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M5.6 18.4l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
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

type Screen = "today" | "needsyou" | "queue" | "ask" | "notes" | "emails" | "events" | "history" | "agents" | "sources" | "sync" | "activity" | "admin";
/** Mayor mode = exactly these three destinations (Phase 4 nav collapse). */
const MAYOR_SCREENS: Screen[] = ["today", "needsyou", "queue", "ask", "agents"];
const THEME_CYCLE = ["auto", "midnight", "dim", "daylight", "contrast"];

const streamColor: Record<string, string> = {
  Police: C.blue, "Fire/EMS": C.red, Business: C.purpleText, Interdepartmental: C.gold,
  "Civic/FOIA": C.orange, Regional: C.greenText, Resident: C.green,
};
const chip = (label: string, color: string): CSSProperties => ({
  display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 700,
  fontFamily: FONT.sans, color, background: "rgba(var(--ink),.1)", border: `1px solid rgba(var(--ink),.1)`, letterSpacing: ".01em",
});
const cardS: CSSProperties = { background: "linear-gradient(180deg,rgba(var(--ink),.05),rgba(var(--ink),.018))", border: "1px solid var(--c-cardbd)", borderRadius: 16, padding: 16 };

/** Filename extension for a recorded audio blob — OpenAI infers format from it,
 *  so it MUST match the real MIME (iOS Safari records audio/mp4, not webm). */
function audioExt(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mpga")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export default function MobileApp() {
  const [screen, setScreen] = useState<Screen>("today");
  // the cabinet gear deep-links Staff Agents to one agent's detail
  const [agentFocus, setAgentFocus] = useState<string | null>(null);
  const [agentSection, setAgentSection] = useState<string | null>(null); // nav sub-menu target
  // Ask tab = the mic (RD 2026-07-05): one tap starts voice immediately;
  // a second tap within 450ms switches to the text interface.
  const [askMode, setAskMode] = useState<"voice" | "text" | null>(null);
  // Set when "save to notes" is tapped on an Ask result — the Notes screen
  // opens with the question pre-filled, still confirm-first (RD 2026-07-31).
  const [noteSeed, setNoteSeed] = useState<string | null>(null);
  const saveToNotes = (text: string) => { setNoteSeed(text); setScreen("notes"); };
  const [askSeq, setAskSeq] = useState(0);
  const askTapAt = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [operator, setOperator] = useState(false);
  const [emailMid, setEmailMid] = useState<string | null>(null);
  const [historyValue, setHistoryValue] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => watchAutoTheme(), []); // keep "auto" theme shifting through the day
  useEffect(() => { setOperator(loadOperatorMode()); }, []);
  // adoption metric #1: cold open → first tap (is the Hub legible in 5s?)
  useEffect(() => {
    logUsage("app_open");
    const t0 = Date.now();
    const onFirst = () => logUsage("first_tap", { ms: Date.now() - t0 });
    window.addEventListener("pointerdown", onFirst, { once: true });
    return () => window.removeEventListener("pointerdown", onFirst);
  }, []);
  // leaving Operator mode never strands the Mayor on an operator screen
  useEffect(() => {
    if (!operator && !MAYOR_SCREENS.includes(screen)) setScreen("today");
  }, [operator, screen]);

  // Swipe-down to refresh: remount the active screen so its useApi hooks refetch.
  async function doRefresh() {
    setRefreshKey((k) => k + 1);
    await new Promise((r) => setTimeout(r, 700));
  }

  return (
    <EmailCtx.Provider value={setEmailMid}>
      <div style={{ minHeight: "100dvh", background: "var(--c-appbg)", color: C.text, fontFamily: FONT.sans, paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
        <Header operator={operator} onMenu={() => setMenuOpen(true)} onProfile={() => setProfileOpen(true)} />
        <PullToRefresh onRefresh={doRefresh}>
          <div key={refreshKey} style={{ padding: "8px 0 20px" }}>
            {screen === "today" && <WallScreen variant="mobile" onOpenEmail={setEmailMid} onGoApprovals={() => setScreen("queue")} onOpenAgent={(k) => { setAgentFocus(k); setScreen("agents"); }} onGoNeedsYou={() => setScreen("needsyou")} />}
            {screen === "needsyou" && <NeedsYouScreen variant="mobile" onOpenEmail={setEmailMid} />}
            {screen === "queue" && <QueueScreen variant="mobile" onOpenEmail={setEmailMid} />}
            {screen === "ask" && <AskScreen key={`${askMode ?? "plain"}:${askSeq}`} textFocus={askMode === "text"} onSaveNote={saveToNotes} />}
            {screen === "notes" && <><ScreenHead title="Notes" sub="Anything you want kept — type it or hold to talk." /><NotesScreen key={noteSeed ?? "plain"} seed={noteSeed ?? undefined} /></>}
            {screen === "emails" && <EmailsScreen onAsk={() => setScreen("ask")} />}
            {screen === "events" && <EventsScreen />}
            {screen === "history" && <HistoryScreen />}
            {screen === "agents" && <AgentsPage key={`${agentFocus ?? "all"}:${agentSection ?? ""}`} initialAgentKey={agentFocus ?? undefined} initialSection={agentSection ?? undefined} />}
            {screen === "sources" && <div><ScreenHead title="Sources" sub="Connectors, mailboxes, and document upload." /><SourcesView /></div>}
            {screen === "sync" && <SyncScreen />}
            {screen === "activity" && <ActivityScreen />}
            {screen === "admin" && <AdminPanel />}
          </div>
        </PullToRefresh>

        {/* Mayor mode nav: three thumb-zone tabs. The Ask FAB is gone — Ask is
            a destination, and scroll containers keep bottom padding clear. */}
        <TabBar current={screen} go={(s) => {
          if (s === "ask") {
            // PUSH TO LISTEN (RD 2026-07-31). Ask NEVER opens the microphone on
            // its own. Arriving here used to start recording immediately, which
            // is startling, drains battery, and is wrong for the common case —
            // most questions get typed. The only way to record is to physically
            // hold the "Hold to talk" button. A double-tap shortcut was tried and
            // removed too: an accidental double-tap is exactly the surprise this
            // is meant to prevent.
            setAskMode("text");
            askTapAt.current = Date.now();
            setAskSeq((x) => x + 1);
          }
          setScreen(s);
        }} />
        <FeedbackButton raised />
        {menuOpen && (
          <NavMenu
            current={screen}
            operator={operator}
            onToggleOperator={(on) => { saveOperatorMode(on); setOperator(on); }}
            go={(s) => { setScreen(s); setMenuOpen(false); }}
            goAgentSection={(sec) => { setAgentFocus(null); setAgentSection(sec); setScreen("agents"); setMenuOpen(false); }}
            agentSection={agentSection}
            onClose={() => setMenuOpen(false)}
          />
        )}
        {profileOpen && (
          <ProfileSheet
            operator={operator}
            onToggle={(on) => { saveOperatorMode(on); setOperator(on); }}
            onClose={() => setProfileOpen(false)}
          />
        )}
        {emailMid && (
          <EmailSheet
            mid={emailMid}
            onClose={() => setEmailMid(null)}
            onOpenHistory={(name) => setHistoryValue(name)}
            onGoQueue={() => { setEmailMid(null); setScreen("queue"); }}
          />
        )}
        {historyValue && <MemoryDetailSheet value={historyValue} onClose={() => setHistoryValue(null)} />}
      </div>
    </EmailCtx.Provider>
  );
}

/* Mayor-mode bottom tabs — Hub · Needs You · [ASK] · Queue. Ask is the hero:
 * a big raised gold circle dead-center in the bar (RD 2026-07-20). */
function TabBar({ current, go }: { current: Screen; go: (s: Screen) => void }) {
  const Tab = ({ s, d, label }: { s: Screen; d: string; label: string }) => {
    const on = current === s;
    return (
      <button onClick={() => go(s)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 8px", background: "none", border: 0, cursor: "pointer", color: on ? C.gold : C.muted }}>
        <Svg d={d} w={22} sw={on ? 2.2 : 1.8} />
        <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, fontFamily: FONT.sans }}>{label}</span>
      </button>
    );
  };
  const askOn = current === "ask";
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, display: "flex", alignItems: "flex-end", background: "var(--c-sidebar, rgba(255,253,246,.88))", backdropFilter: "blur(16px)", borderTop: "1px solid var(--c-cardbd)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* left group */}
      <div style={{ flex: 1, display: "flex" }}>
        <Tab s="today" d={I.today} label="Dashboard" />
        <Tab s="needsyou" d={I.emails} label="Email Actions" />
      </div>
      {/* center gap the raised Ask FAB sits over — keeps the flex halves even
          so the button lands dead-center */}
      <div style={{ width: 78, flexShrink: 0 }} />
      {/* right group */}
      <div style={{ flex: 1, display: "flex" }}>
        <Tab s="queue" d={I.approvals} label="Queue" />
        <Tab s="notes" d={I.brief} label="Notes" />
      </div>
      {/* the hero Ask button */}
      <button onClick={() => go("ask")} aria-label="Ask" style={{
        position: "absolute", left: "50%", bottom: "calc(env(safe-area-inset-bottom) + 8px)", transform: "translateX(-50%)",
        width: 64, height: 64, borderRadius: 99, border: "4px solid var(--c-appbg)", cursor: "pointer",
        background: "linear-gradient(135deg,#F4CB63,#D7991C)",
        boxShadow: askOn ? "0 0 0 3px rgba(231,181,60,.45), 0 10px 22px rgba(231,181,60,.5)" : "0 10px 22px rgba(231,181,60,.45)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, color: "#0a1322",
      }}>
        <Svg d={I.mic} w={23} sw={2.3} />
        <span style={{ fontSize: 9.5, fontWeight: 900, fontFamily: FONT.sans }}>Ask</span>
      </button>
    </div>
  );
}

/* Profile / persona sheet — holds the persisted Operator toggle. */
function ProfileSheet({ operator, onToggle, onClose }: { operator: boolean; onToggle: (on: boolean) => void; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "var(--c-appbg)", borderRadius: "18px 18px 0 0", borderTop: "1px solid var(--c-cardbd)", padding: "18px 18px calc(env(safe-area-inset-bottom) + 20px)", animation: "sheetUp .2s ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ width: 42, height: 42, borderRadius: 99, border: `2px solid ${C.gold}`, background: "linear-gradient(135deg,#1d3f6b,#0e2440)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.serif, fontSize: 18, color: C.gold }}>M</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{operator ? "Operator view" : "Mayor's view"}</div>
            <div style={{ fontSize: 11.5, color: C.muted }}>Village of Bellwood</div>
          </div>
        </div>
        <button onClick={() => onToggle(!operator)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", cursor: "pointer", background: "rgba(var(--ink),.04)", border: "1px solid var(--c-cardbd)", borderRadius: 13, padding: "13px 14px", textAlign: "left" }}>
          <span style={{ width: 38, height: 22, borderRadius: 99, background: operator ? C.gold : "rgba(var(--ink),.18)", position: "relative", flexShrink: 0, transition: "background .15s" }}>
            <span style={{ position: "absolute", top: 2, left: operator ? 18 : 2, width: 18, height: 18, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .15s" }} />
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.text }}>Operator mode</span>
            <span style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>Reveals Emails, Calendar, History, Sources, Staff Agents, and Admin behind the menu button.</span>
          </span>
        </button>
        {process.env.NEXT_PUBLIC_AUTH_ENABLED === "1" && (
          <button onClick={() => { window.location.href = "/api/auth/signout"; }} style={{ display: "block", width: "100%", marginTop: 10, padding: "12px 14px", borderRadius: 13, cursor: "pointer", background: "rgba(var(--ink),.04)", border: "1px solid var(--c-cardbd)", color: C.text2, fontWeight: 700, fontSize: 13.5, fontFamily: FONT.sans }}>Sign out</button>
        )}
        <button onClick={onClose} style={{ display: "block", width: "100%", marginTop: 12, padding: "13px 14px", borderRadius: 13, border: 0, cursor: "pointer", background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322", fontWeight: 800, fontSize: 14.5, fontFamily: FONT.sans }}>Done</button>
      </div>
    </div>
  );
}

const NAV_STAR = "M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z";
// Operator-mode menu — everything that existed before, relocated (never deleted).
const NAV_ITEMS: [Screen, string, string][] = [
  ["today", I.today, "Dashboard"],
  ["needsyou", I.emails, "Email Actions"],
  ["queue", I.approvals, "Queue"],
  ["notes", I.brief, "Notes"],
  ["ask", I.search, "Ask"],
  ["emails", I.emails, "Emails"],
  ["events", I.events, "Calendar"],
  ["history", I.history, "History"],
  ["agents", NAV_STAR, "Agents"],
  ["sources", I.sources, "Sources"],
  ["sync", "M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6", "Sync"],
  ["activity", I.history, "Activity"],
  ["admin", I.admin, "Admin"],
];

/* Slide-in menu — always reachable (RD 2026-07-02). Mayor mode lists the three
 * destinations; the Operator switch in the footer reveals every desk. */
function NavMenu({ current, operator, onToggleOperator, go, goAgentSection, agentSection, onClose }: { current: Screen; operator: boolean; onToggleOperator: (on: boolean) => void; go: (s: Screen) => void; goAgentSection?: (sec: string) => void; agentSection?: string | null; onClose: () => void }) {
  const items = NAV_ITEMS.filter(([s]) => operator || MAYOR_SCREENS.includes(s));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", animation: "sheetUp .18s ease-out" }}>
      <div style={{ width: "78%", maxWidth: 320, background: "var(--c-appbg)", borderRight: "1px solid var(--c-cardbd)", display: "flex", flexDirection: "column", boxShadow: "2px 0 24px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "calc(env(safe-area-inset-top) + 16px) 18px 16px", borderBottom: "1px solid var(--c-cardbd)" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,var(--c-goldhi),var(--c-goldlo))", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a1322" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Public Sans','Inter',system-ui,sans-serif", fontSize: 16, fontWeight: 800, lineHeight: 1 }}>Chief of Staff</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: ".12em", color: C.dim, marginTop: 2 }}>INSTITUTIONAL MEMORY</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}><Svg d={I.close} w={17} /></button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
          {items.map(([s, d, label]) => {
            const on = current === s;
            return (
              <div key={s}>
                <button onClick={() => go(s)} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", padding: "14px 14px", borderRadius: 12, marginBottom: 2, border: 0, cursor: "pointer", background: on ? "rgba(231,181,60,.12)" : "transparent", color: on ? C.gold : C.text2 }}>
                  <Svg d={d} w={21} sw={on ? 2.1 : 1.8} />
                  <span style={{ flex: 1, fontSize: 15.5, fontWeight: on ? 700 : 600, fontFamily: FONT.sans }}>{label}</span>
                  {on && <span style={{ width: 7, height: 7, borderRadius: 99, background: C.gold }} />}
                </button>
                {/* the staff taxonomy sub-menu (RD 2026-07-05): Agents ·
                    Capabilities · Connectors jump to that section, open */}
                {s === "agents" && goAgentSection && (
                  <div style={{ display: "flex", flexDirection: "column", margin: "0 0 6px 46px" }}>
                    {[["agents", "Agents"], ["capabilities", "Capabilities"], ["connectors", "Connectors"]].map(([id, l]) => (
                      <button key={id} onClick={() => goAgentSection(id)} style={{ textAlign: "left", background: "none", border: 0, cursor: "pointer", padding: "7px 10px", borderRadius: 9, color: on && agentSection === id ? C.gold : C.text3, fontSize: 13.5, fontWeight: 600, fontFamily: FONT.sans }}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "13px 18px calc(env(safe-area-inset-bottom) + 14px)", borderTop: "1px solid var(--c-cardbd)" }}>
          <button onClick={() => onToggleOperator(!operator)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 36, height: 21, borderRadius: 99, background: operator ? C.gold : "rgba(var(--ink),.18)", position: "relative", flexShrink: 0, transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 2, left: operator ? 17 : 2, width: 17, height: 17, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .15s" }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: C.text }}>Operator mode</span>
              <span style={{ display: "block", fontSize: 10.5, color: C.muted, marginTop: 1, lineHeight: 1.4 }}>
                {operator ? "Showing every desk" : "Show Emails, Calendar, History, Sources, Agents, Admin"}
              </span>
            </span>
          </button>
        </div>
      </div>
      <div onClick={onClose} style={{ flex: 1, background: "rgba(0,0,0,.45)" }} />
    </div>
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
      {/* transform ONLY while pulling — at rest it must be `none`, or the
          translateY(0) still creates a containing block + stacking context that
          traps every position:fixed modal (agent sheet, thread view) below the
          nav bar (bug: agent card opened off-screen, 2026-07-20). */}
      <div style={{ transform: pull > 0 ? `translateY(${pull}px)` : "none", transition: startY.current === null ? "transform .24s cubic-bezier(.2,.8,.2,1)" : "none" }}>
        {children}
      </div>
    </div>
  );
}

/** The lowest level: the actual source email body. Opened from any reference. */
/** Uploaded docs live only in the client store — synthesize their detail locally. */
function ingestedDetail(mid: string): EmailDetail | null {
  const r = getIngested().find((x) => x.id === mid);
  if (!r) return null;
  const body = `${r.summary}\n\n` + Object.entries(r.fields).map(([k, v]) => `${k}: ${v}`).join("\n");
  return { subject: r.title, fromName: r.author, fromEmail: null, toEmail: null, cc: null,
    direction: "inbound", topic: r.topic, stream: r.stream as EmailDetail["stream"], date: r.ingestedAt,
    bodyRaw: body, bodyClean: body } as unknown as EmailDetail;
}
function EmailSheet({ mid, onClose, onOpenHistory, onGoQueue }: { mid: string; onClose: () => void; onOpenHistory?: (name: string) => void; onGoQueue?: () => void }) {
  const local = mid.startsWith("ing-") ? ingestedDetail(mid) : null;
  if (local) {
    // session uploads live only in the client store — render locally
    return (
      <Sheet title={local.subject || "Uploaded document"} onClose={onClose}>
        <div style={{ padding: "0 16px 32px" }}>
          <div style={{ ...cardS, padding: 14, marginBottom: 14 }}>
            <Row k="From" v={local.fromName} />
            <Row k="Date" v={new Date(local.date).toLocaleString()} />
            <Row k="Stream" v={`${local.stream}${local.topic ? ` · ${local.topic}` : ""}`} />
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: C.text2, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{local.bodyRaw || local.bodyClean}</div>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Source document" onClose={onClose}>
      <div style={{ padding: "0 16px 32px" }}>
        <ThreadView mid={mid} onOpenHistory={onOpenHistory} onGoQueue={onGoQueue} />
      </div>
    </Sheet>
  );
}
function Row({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 13 }}>
      <span style={{ flex: "0 0 48px", fontFamily: FONT.mono, fontSize: 10.5, color: C.dim, textTransform: "uppercase", paddingTop: 2 }}>{k}</span>
      <span style={{ flex: 1, color: C.text2, minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );
}

/* live date + time in the header (RD 2026-07-21) — ticks every 30s */
function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  return (
    <>
      <div style={{ fontFamily: FONT.serif, fontSize: 14.5, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap" }}>
        {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, whiteSpace: "nowrap", overflow: "hidden" }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 8.5, letterSpacing: ".1em", color: C.dim }}>{now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        <ReleaseTag size={7.5} />
      </div>
    </>
  );
}

/* ── header ── */
function Header({ operator, onMenu, onProfile }: { operator: boolean; onMenu: () => void; onProfile: () => void }) {
  const [theme, setTheme] = useState("auto");
  useEffect(() => { try { setTheme(localStorage.getItem("bw-theme") || "auto"); } catch { /* */ } }, []);
  function cycle() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    try { localStorage.setItem("bw-theme", next); } catch { /* */ }
    applyTheme(next); setTheme(next); // resolves "auto" to the current time-of-day palette
  }
  const light = ["daylight", "am", "midday"].includes(resolveTheme(theme, new Date().getHours()));
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 9, padding: "calc(env(safe-area-inset-top) + 7px) 12px 7px", background: "rgba(var(--ink),.04)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--c-cardbd)" }}>
      {/* the menu is ALWAYS reachable (RD 2026-07-02) — Mayor mode lists its
          three destinations; the Operator switch inside reveals the rest */}
      <button onClick={onMenu} aria-label="Menu" style={{ width: 33, height: 33, borderRadius: 11, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <div style={{ width: 25, height: 25, borderRadius: 8, background: "linear-gradient(135deg,var(--c-goldhi),var(--c-goldlo))", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a1322", flexShrink: 0 }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z" /></svg>
      </div>
      {/* the top shows the DAY, not the app's name (RD 2026-07-21) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <HeaderClock />
      </div>
      {/* the pencil — leave the CoS a note (RD 2026-07-21) */}
      <NoteButton variant="mobile" />
      <button onClick={cycle} aria-label="Theme" style={{ width: 31, height: 31, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {light
          ? <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2l1.8 1.8M19 5l-1.8 1.8M6.8 17.2 5 19" /></svg>
          : <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
      </button>
      <SyncButton compact />
      <button onClick={onProfile} aria-label="Profile & workspace mode" style={{ width: 31, height: 31, borderRadius: 99, border: `1.5px solid ${C.gold}`, background: "linear-gradient(135deg,#1d3f6b,#0e2440)", color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.serif, fontSize: 15, flexShrink: 0 }}>M</button>
    </div>
  );
}

/* ── BRIEF ── */
interface InboxItem { messageId: string; fromName: string | null; subject: string | null; snippet: string; date: string; stream: string; topic: string | null; cat: string; mailbox?: string; }
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

/* Connected mailboxes via /api/mailboxes. Demo builds keep the static registry
   as the instant first paint and never fetch (behavior unchanged); the LIVE
   build starts empty and shows only what pipeline.connector_accounts actually
   holds — real mailboxes or an honest none-connected state, never fictional. */
function useMailboxes(): Mailbox[] {
  const [boxes, setBoxes] = useState<Mailbox[]>(IS_LIVE_BUILD ? [] : MAILBOXES);
  useEffect(() => {
    if (!IS_LIVE_BUILD) return; // demo: the registry is the data — no fetch
    let live = true;
    fetch("/api/mailboxes").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (live && Array.isArray(d)) setBoxes(d); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return boxes;
}

/* EMAILS — agent-sorted inbox: Urgent / Important / Social / Spam / Inbox / Agent Answered. */
function EmailsScreen({ onAsk }: { onAsk: () => void }) {
  const mailboxes = useMailboxes();
  const [mailboxId, setMailboxId] = useState("gov");
  // Resolve against the connected list; undefined only on the LIVE build with nothing connected.
  const mailbox = mailboxes.find((m) => m.id === mailboxId) ?? mailboxes.find((m) => m.isDefault) ?? mailboxes[0];
  const isPrivate = mailbox?.isPrivate ?? false;
  const { data: appr, reload } = useApi<{ drafts: DraftRow[] }>("/api/approvals");
  const [limit, setLimit] = useState(80); // pagination: Load more bumps the window
  const { data: inbox } = useApi<{ count: number; emails: InboxItem[]; counts: Record<string, number> }>(`/api/inbox?mailbox=${mailbox?.id ?? mailboxId}&limit=${limit}`);
  const openEmail = useOpenEmail();
  const enabledCats = getEnabledTabs();
  const [tab, setTab] = useState<string>(enabledCats[0] ?? "all");

  const queued = isPrivate ? [] : appr?.drafts ?? []; // agent drafting is gov-only in the demo
  const emails = inbox?.emails ?? [];
  const counts = inbox?.counts ?? {};
  const empty = (t: string) => <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>{t}</div>;
  const tabs: [string, string, number][] = [
    ...enabledCats.map((c) => [c, CAT_META[c]?.[1] ?? c, counts[c] ?? 0] as [string, string, number]),
    ["all", "Inbox", inbox?.count ?? 0],
    ...(isPrivate ? [] : [["queued", "Agent Answered", queued.length] as [string, string, number]]),
  ];
  const shown = tab === "all" ? emails : tab === "queued" ? [] : emails.filter((e) => e.cat === tab);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 0" }}>
        <div style={{ fontFamily: "'Public Sans','Inter',system-ui,sans-serif", fontSize: 26, fontWeight: 800, lineHeight: 1 }}>Emails</div>
        <button onClick={onAsk} aria-label="Search" style={{ marginLeft: "auto", width: 38, height: 38, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}><Svg d={I.search} w={18} /></button>
      </div>

      {/* mailbox (source system) switcher — hidden when there's nothing to switch */}
      <SyncProgressCard compact />
      <MailboxSwitcher boxes={mailboxes} current={mailbox?.id ?? mailboxId} onChange={(id) => { setMailboxId(id); setTab(getEnabledTabs()[0] ?? "all"); }} />
      {mailboxes.length === 0 && (
        <div style={{ margin: "12px 16px 2px", padding: "10px 13px", borderRadius: 12, border: "1px dashed var(--c-cardbd)", color: C.dim, fontSize: 12.5, textAlign: "center" }}>No mailboxes connected yet — sign in to connect one.</div>
      )}
      {mailbox?.isPrivate && (
        <div style={{ margin: "0 16px 4px", padding: "9px 12px", borderRadius: 11, border: `1px solid ${mailbox.color}55`, background: `${mailbox.color}14`, display: "flex", gap: 9, alignItems: "flex-start" }}>
          <span style={{ color: mailbox.color, marginTop: 1 }}><Svg d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5zM12 14v3" w={15} /></span>
          <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.5 }}><b style={{ color: C.text2 }}>Private business account.</b> Walled off from the public record — not FOIA-indexed and excluded from village Ask.</div>
        </div>
      )}

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
        {inbox && emails.length < inbox.count && (
          <div style={{ padding: "10px 16px 4px", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <button onClick={() => setLimit((l) => Math.min(l + 200, 1000))} style={{ cursor: "pointer", padding: "11px 22px", borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, fontWeight: 700, fontSize: 13, fontFamily: FONT.sans }}>
              Load more
            </button>
            <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{emails.length.toLocaleString()} of {inbox.count.toLocaleString()}</span>
          </div>
        )}
      </div>)}

      {tab === "queued" && (<div>
        {appr && queued.length === 0 && empty("Nothing queued to send.")}
        {queued.map((d) => <div key={d.draftId} style={{ padding: "8px 16px" }}><DraftCard draft={d} onReload={reload} /></div>)}
      </div>)}
    </div>
  );
}

/* Mailbox (source-system) switcher — e.g. Government (Outlook) vs the walled
   Business (Gmail). Hidden entirely when zero/one mailbox: nothing to switch. */
function MailboxSwitcher({ boxes, current, onChange }: { boxes: Mailbox[]; current: string; onChange: (id: string) => void }) {
  if (boxes.length < 2) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 16px 2px" }}>
      {boxes.map((m: Mailbox) => {
        const on = current === m.id;
        return (
          <button key={m.id} onClick={() => onChange(m.id)} style={{
            flex: 1, cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start",
            padding: "9px 13px", borderRadius: 12, textAlign: "left",
            border: `1.5px solid ${on ? m.color : "var(--c-cardbd)"}`,
            background: on ? `${m.color}1c` : "rgba(var(--ink),.03)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, width: "100%" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: m.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? C.text : C.text3 }}>{m.short}</span>
              {m.isPrivate && <span style={{ marginLeft: "auto" }}><Svg d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5z" w={12} /></span>}
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.dim, letterSpacing: ".02em" }}>{PROVIDER_META[m.provider].badge}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── CALENDAR (agenda: dates with their events) ── */
interface EventItem {
  id: string; title: string; who: string | null; role: string; dueLabel: string;
  status: "open" | "late" | "done"; stream: string; messageId: string; date: string; source?: "gov" | "gmail";
}
const evDot: Record<string, string> = { open: C.blue, late: C.orange, done: C.greenText };
const SRC_META: Record<string, { label: string; color: string }> = {
  gov: { label: "Outlook", color: C.blue },
  gmail: { label: "Gmail", color: C.purpleText },
};
function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00"); const e = new Date(end + "T00:00:00");
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d).toISOString().slice(0, 10));
  return out;
}
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function EventsScreen() {
  const { data } = useApi<{ events: EventItem[]; stats: { open: number; late: number; done: number } }>("/api/events");
  const openEmail = useOpenEmail();
  const [view, setView] = useState<"calendar" | "meetings">("calendar");
  const [src, setSrc] = useState<"all" | "gov" | "gmail">("all");
  const today = new Date().toISOString().slice(0, 10);

  const evs = (data?.events ?? []).filter((e) => src === "all" || (e.source ?? "gov") === src);
  const byDay = new Map<string, EventItem[]>();
  for (const e of evs) { const d = e.date.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(e); }
  const eventDays = [...byDay.keys()].sort();
  const lastDay = eventDays.length ? eventDays[eventDays.length - 1] : today;
  // forward agenda: a few days of context before today → through the last event
  const strip = dayRange(addDays(today, -3), lastDay > addDays(today, 13) ? lastDay : addDays(today, 13));
  const [sel, setSel] = useState(today);
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSel(today); }, [today]);
  useEffect(() => { const i = strip.indexOf(sel); if (stripRef.current && i >= 0) stripRef.current.scrollLeft = Math.max(0, i * 58 - 80); }, [strip.length, sel]);
  const dayEvents = (byDay.get(sel) ?? []).sort((a, b) => a.date.localeCompare(b.date));

  const srcTab = (k: "all" | "gov" | "gmail", label: string, color?: string) => {
    const on = src === k;
    return <button key={k} onClick={() => setSrc(k)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, fontFamily: FONT.sans, background: on ? "rgba(var(--ink),.08)" : "transparent", color: on ? C.text : C.text3, border: `1px solid ${on ? "rgba(var(--ink),.2)" : "var(--c-cardbd)"}` }}>{color && <span style={{ width: 7, height: 7, borderRadius: 99, background: color }} />}{label}</button>;
  };

  return (
    <div>
      <ScreenHead title="Calendar" sub="Your whole day — Government (Outlook) + Business (Gmail), consolidated." stats={[[String(data?.stats.open ?? "—"), "open"], [String(data?.stats.late ?? "—"), "overdue"], [String(data?.stats.done ?? "—"), "done"]]} />
      <div style={{ display: "flex", gap: 8, padding: "2px 16px 10px" }}>
        {(["calendar", "meetings"] as const).map((v) => {
          const on = view === v;
          return <button key={v} onClick={() => setView(v)} style={{ cursor: "pointer", padding: "7px 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans, background: on ? C.gold : "transparent", color: on ? "#081627" : C.text3, border: `1px solid ${on ? C.gold : "var(--c-cardbd)"}` }}>{v === "calendar" ? "Calendar" : "Events & Meetings"}</button>;
        })}
      </div>
      {/* source filter — consolidated by default */}
      <div style={{ display: "flex", gap: 7, padding: "0 16px 12px", overflowX: "auto" }}>
        {srcTab("all", "All")}{srcTab("gov", "Government", C.blue)}{srcTab("gmail", "Business", C.purpleText)}
      </div>

      {view === "calendar" && (<>
        <div ref={stripRef} style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 16px 14px", WebkitOverflowScrolling: "touch" as never }}>
          {strip.map((d) => {
            const on = d === sel; const isToday = d === today; const dt = new Date(d + "T00:00:00"); const dayEvs = byDay.get(d) ?? [];
            const hasGov = dayEvs.some((e) => (e.source ?? "gov") === "gov"); const hasGmail = dayEvs.some((e) => e.source === "gmail");
            return (
              <button key={d} onClick={() => setSel(d)} style={{ flexShrink: 0, width: 50, padding: "8px 0 6px", borderRadius: 13, border: `1px solid ${on ? C.gold : isToday ? "rgba(231,181,60,.5)" : "var(--c-cardbd)"}`, background: on ? C.gold : "rgba(var(--ink),.04)", color: on ? "#081627" : C.text2, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer" }}>
                <span style={{ fontSize: 9.5, fontFamily: FONT.mono, opacity: 0.85 }}>{dt.toLocaleDateString("en-US", { weekday: "short" })}</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{dt.getDate()}</span>
                <span style={{ display: "flex", gap: 2, height: 5 }}>
                  {hasGov && <span style={{ width: 5, height: 5, borderRadius: 99, background: on ? "#081627" : C.blue }} />}
                  {hasGmail && <span style={{ width: 5, height: 5, borderRadius: 99, background: on ? "#081627" : C.purpleText }} />}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: "0 18px 8px", fontFamily: FONT.mono, fontSize: 11, letterSpacing: ".05em", color: C.dim, textTransform: "uppercase" }}>{new Date(sel + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}{sel === today ? " · today" : ""} · {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}</div>
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
      <span style={{ width: 9, height: 9, borderRadius: 99, background: SRC_META[e.source ?? "gov"].color, flexShrink: 0, marginTop: 5 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
          <span style={{ fontSize: 11, color: e.status === "late" ? C.orange : C.dim, fontFamily: FONT.mono, flexShrink: 0 }}>{day || e.dueLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 3 }}>
          <span style={{ ...chip(SRC_META[e.source ?? "gov"].label, SRC_META[e.source ?? "gov"].color), flexShrink: 0 }}>{SRC_META[e.source ?? "gov"].label}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.role} · {e.who}</span>
        </div>
      </div>
    </button>
  );
}

/* ── MEMORY ── */
function HistoryScreen() {
  const { data } = useApi<{ entities: EntityListItem[] }>("/api/memory");
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kindF, setKindF] = useState("all");
  const kinds = [...new Set((data?.entities || []).map((e) => e.kind))];
  const list = (data?.entities || []).filter(
    (e) => (kindF === "all" || e.kind === kindF) && e.name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div>
      <ScreenHead title="History" sub="The full record on every person and property." />
      <div style={{ padding: "0 16px 8px" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people & places…"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text, fontSize: 15, outline: "none", fontFamily: FONT.sans }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
          {["all", ...kinds].map((k) => {
            const on = kindF === k;
            return (
              <button key={k} onClick={() => setKindF(k)} style={{ cursor: "pointer", padding: "5px 12px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, fontFamily: FONT.sans, background: on ? C.gold : "transparent", color: on ? "#081627" : C.text3, border: `1px solid ${on ? C.gold : "rgba(var(--ink),.14)"}` }}>
                {k === "all" ? "All" : k}
              </button>
            );
          })}
        </div>
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

/* ── Sources (connectors · mailboxes · upload) ── */
function SourcesView() {
  const { data } = useApi<SourcesOverview>("/api/sources");
  const dot: Record<string, string> = { healthy: C.green, syncing: C.blue, degraded: C.orange };
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ingested, setIngested] = useState<IngestedRecord[]>([]);
  useEffect(() => { setIngested(getIngested()); }, []);
  if (!data) return <Loading />;
  return (
    <div style={{ padding: "0 16px 24px" }}>
      <button onClick={() => setUploadOpen(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", padding: "13px", borderRadius: 13, border: "1px solid rgba(231,181,60,.4)", background: "rgba(231,181,60,.08)", color: C.gold, fontSize: 14, fontWeight: 700, fontFamily: FONT.sans, marginBottom: 14, cursor: "pointer" }}>
        <Svg d="M12 5v14M5 12h14" w={18} sw={2.2} /> Upload source — agent ingest
      </button>

      {ingested.length > 0 && <IngestedSection records={ingested} />}

      <MailboxesBlock />

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
      {uploadOpen && <UploadSource onClose={() => setUploadOpen(false)} onCommitted={() => setIngested(getIngested())} />}
    </div>
  );
}

/* Connected mailboxes (the source systems) — /api/mailboxes; live shows only
   what's really connected, and an empty pipeline is an honest empty state. */
function MailboxesBlock() {
  const mailboxes = useMailboxes();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", marginBottom: 9 }}>Mailboxes · source systems</div>
      <div style={{ display: "grid", gap: 9 }}>
        {mailboxes.length === 0 && (
          <div style={{ ...cardS, padding: 13, textAlign: "center", color: C.dim, fontSize: 12.5 }}>No mailboxes connected yet — sign in to connect one.</div>
        )}
        {mailboxes.map((m: Mailbox) => (
          <div key={m.id} style={{ ...cardS, padding: 13, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: m.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span>
                {m.isPrivate ? <span style={chip("Private", m.color)}>Private</span> : <span style={chip("Public record", C.greenText)}>Public record</span>}
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.dim, marginTop: 2 }}>{PROVIDER_META[m.provider].badge} · {m.address}</div>
            </div>
            <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.greenText }}>synced</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px", borderRadius: 12, border: "1px dashed var(--c-cardbd)", color: C.text3, fontSize: 13, fontWeight: 600 }}>
          <Svg d="M12 5v14M5 12h14" w={16} sw={2.2} /> Add mailbox
        </div>
        <div style={{ fontSize: 11, color: C.dim, fontFamily: FONT.mono, textAlign: "center" }}>New mailboxes connect via Microsoft / Google OAuth (read-only) — set up by the technical team.</div>
      </div>
    </div>
  );
}

/* Freshly ingested uploads (agent-confirmed) — surfaced as a live activity block. */
function IngestedSection({ records }: { records: IngestedRecord[] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.gold, textTransform: "uppercase", marginBottom: 9 }}>Agent-ingested · this session ({records.length})</div>
      <div style={{ display: "grid", gap: 9 }}>
        {records.map((r) => {
          const t = getSourceType(r.typeKey); const sm = SENSITIVITY_META[r.sensitivity];
          return (
            <div key={r.id} style={{ ...cardS, padding: 13 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                <span style={chip(sm.label, sm.color)}>{sm.label}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5, maxHeight: 36, overflow: "hidden" }}>{r.summary}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={chip(t?.label ?? r.typeKey, C.gold)}>{t?.label ?? r.typeKey}</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>{r.entities.length} linked · {r.stream}</span>
                <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{r.storageLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* ── ASK — the KNOW tab (voice-first: hold-to-talk primary) ── */
function AskScreen({ textFocus, onSaveNote }: { textFocus?: boolean; onSaveNote?: (t: string) => void } = {}) {
  const [q, setQ] = useState("");
  // Lets the Stop button cancel an in-flight search (RD 2026-07-31): a 12-40s
  // wait with no way out is a trap, especially on a phone.
  const abortRef = useRef<AbortController | null>(null);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [rec, setRec] = useState<"idle" | "rec" | "busy">("idle");
  const [err, setErr] = useState<string | null>(null);
  // the one smart button (FEAT-36): a spoken utterance routes to note-vs-question.
  // pendingNote = the confirm-first card; savedNote = the "it's in the briefing" chip.
  const [routing, setRouting] = useState(false);
  const [pendingNote, setPendingNote] = useState<{ title: string; body: string; transcript: string } | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  /** Voice transcripts pass through the classifier; notes wait for Keep. A
   *  classifier failure falls straight through to Ask — never a dead end. */
  async function route(text: string) {
    setSavedNote(null); setRouting(true);
    try {
      const p = await postJson<{ kind: "note" | "question"; title: string; body: string }>("/api/cos-notes", { transcript: text });
      if (p?.kind === "note") { setPendingNote({ title: p.title, body: p.body, transcript: text }); setQ(""); return; }
    } catch { /* fall through to Ask */ }
    finally { setRouting(false); }
    run(text);
  }
  async function keepNote() {
    const n = pendingNote; if (!n) return;
    setPendingNote(null);
    const r = await postJson<{ ok?: boolean }>("/api/cos-notes", { title: n.title, body: n.body, source: "voice" });
    setSavedNote(r?.ok ? n.title : null);
    if (!r?.ok) setErr("Couldn't save the note — try again.");
  }
  function askInstead() {
    const n = pendingNote; if (!n) return;
    setPendingNote(null); setQ(n.transcript); run(n.transcript);
  }

  async function run(question?: string) {
    const Q = (question ?? q).trim(); if (!Q) return;
    setQ(Q); setErr(null); addRecentSearch(Q); setLoading(true); setRes(null);
    // include freshly-ingested uploads so the broad search spans them too
    const uploads = getIngested().map((r) => ({
      id: r.id, title: r.title, summary: r.summary, author: r.author, date: r.date,
      topic: r.topic, stream: r.stream, docKind: getSourceType(r.typeKey)?.label ?? "Uploaded document",
      fields: r.fields, entities: r.entities,
    }));
    const ctl = new AbortController();
    abortRef.current = ctl;
    const out = await postJsonDetailed<AskResponse>("/api/ask", { question: Q, uploads }, ASK_TIMEOUT_MS, ctl.signal);
    abortRef.current = null;
    setLoading(false);
    if (!out.ok) {
      // "Stopped." is the user's own doing — show it quietly, not as a failure.
      setErr(out.fail.kind === "stopped" ? null : askFailMessage(out.fail));
      return;
    }
    setRes(out.data);
  }
  async function mic() {
    if (rec === "rec") { recRef.current?.stop(); return; }
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRec("busy");
        try {
          const type = mr.mimeType || "audio/webm"; // iOS Safari → audio/mp4, Chrome → audio/webm
          const blob = new Blob(chunks.current, { type });
          if (blob.size < 1600) { setErr("Didn't catch any speech — tap the mic, speak, then tap again to stop."); return; }
          const fd = new FormData();
          fd.append("audio", blob, `speech.${audioExt(type)}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          const d = await r.json().catch(() => ({} as { text?: string; error?: string; empty?: boolean }));
          if (r.ok && d.text) { setRec("idle"); setQ(d.text); void route(d.text); return; }
          setErr(d.empty ? "Didn't catch any speech — speak clearly, then tap the mic to stop." : d.error || "Couldn't hear that — try again.");
        } catch { setErr("Voice search failed — check your connection."); }
        finally { setRec((s) => (s === "busy" ? "idle" : s)); }
      };
      mr.start(); recRef.current = mr; setRec("rec");
    } catch { setErr("Microphone access was blocked."); setRec("idle"); }
  }
  const recent = getRecentSearches();
  const status = rec === "rec" ? "Listening… release to search" : rec === "busy" ? "Transcribing your voice…" : routing ? "One moment…" : loading ? "Searching the record…" : null;

  // hold-to-talk ONLY: press starts recording, release stops → transcribe →
  // search. Nothing auto-starts the microphone. The cleanup still releases the
  // mic on unmount so navigating away can never leave it hot.
  useEffect(() => {
    return () => { try { if (recRef.current?.state === "recording") recRef.current.stop(); } catch { /* released */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const holdStart = () => { if (rec === "idle") mic(); };
  const holdStop = () => { if (rec === "rec") mic(); };

  return (
    <div style={{ padding: "4px 0 20px" }}>
      <ScreenHead title="Ask" sub="The whole village record — email and documents. Every answer cites its sources." />
      <div style={{ padding: "0 16px" }}>
        {/* the floating pill (design ref 2026-07-02) */}
        <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ display: "flex", gap: 9, alignItems: "center", background: "var(--c-sidebar, rgba(var(--ink),.05))", border: "1px solid var(--c-cardbd)", borderRadius: 999, padding: "6px 6px 6px 18px", boxShadow: "0 6px 22px rgba(20,20,10,.08)" }}>
          <input autoFocus={!!textFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", fontSize: 16, color: C.text, fontFamily: FONT.sans }} />
          {q && !loading && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear the question"
              /* 32px hit target — thumb-sized, per the mobile-first posture */
              style={{ width: 32, height: 32, borderRadius: 999, border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "rgba(var(--ink),.10)", color: C.text3, padding: 0 }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
          {/* reset / new question — inside the one box (RD 2026-07-20) */}
          {res && !loading && (
            <button type="button" onClick={() => { setRes(null); setQ(""); setErr(null); }} aria-label="New question" title="New question"
              style={{ flexShrink: 0, background: "rgba(var(--ink),.07)", border: 0, borderRadius: 999, padding: "9px 14px", cursor: "pointer", color: C.text3, fontSize: 13, fontWeight: 700, fontFamily: FONT.sans }}>
              ✦ New
            </button>
          )}
          {loading ? (
            <button type="button" onClick={() => { abortRef.current?.abort(); }} aria-label="Stop the search"
              style={{ padding: "10px 18px", borderRadius: 999, border: `1.5px solid ${C.line}`, background: "rgba(var(--ink),.06)", color: C.text2, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: C.text3, display: "inline-block" }} />
              Stop
            </button>
          ) : (
            <button type="submit" disabled={rec !== "idle"} style={{ padding: "10px 18px", borderRadius: 999, border: 0, background: C.gold, color: "#081627", fontWeight: 700, fontSize: 14 }}>Ask</button>
          )}
        </form>

        {/* lower-right of the Ask box, like the Claude composer: which model is
            answering, and a way to change it (RD 2026-07-31). */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <ModelPicker />
        </div>

        {/* voice-first: the primary control is hold-to-talk */}
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); holdStart(); }}
          onPointerUp={holdStop}
          onPointerCancel={holdStop}
          onPointerLeave={holdStop}
          onContextMenu={(e) => e.preventDefault()}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", marginTop: 10, padding: "16px 14px", borderRadius: 14, border: 0, cursor: "pointer", touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none", fontFamily: FONT.sans, fontWeight: 800, fontSize: 15.5, color: rec === "rec" ? "#fff" : "#0a1322", background: rec === "rec" ? "linear-gradient(135deg,#e8574a,#c23a2e)" : "linear-gradient(135deg,#F4CB63,#D7991C)", boxShadow: rec === "rec" ? "0 8px 22px rgba(210,58,45,.4)" : "0 8px 22px rgba(231,181,60,.35)", animation: rec === "rec" ? "cosPulse 1.1s infinite" : undefined }}
        >
          {rec === "busy"
            ? <span style={{ display: "inline-flex", animation: "cosSpin .8s linear infinite" }}><Svg d="M21 12a9 9 0 0 0-9-9" w={18} /></span>
            : <Svg d={I.mic} w={19} sw={2.2} />}
          {rec === "rec" ? "Listening — release to search" : rec === "busy" ? "Transcribing…" : "Hold to talk"}
        </button>

        {/* live progress — pulsing status while listening / transcribing / searching */}
        {status && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 16px", borderRadius: 12, fontSize: 13.5, fontWeight: 700, fontFamily: FONT.sans,
            background: rec === "rec" ? "rgba(255,107,94,.12)" : "rgba(231,181,60,.12)",
            color: rec === "rec" ? C.red : C.gold,
            border: `1px solid ${rec === "rec" ? "rgba(255,107,94,.4)" : "rgba(231,181,60,.4)"}`,
            animation: "bwPulse 1.2s ease-in-out infinite" }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: "currentColor" }} />
            {status}
          </div>
        )}
        {err && <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: 11, background: "rgba(255,107,94,.1)", border: "1px solid rgba(255,107,94,.35)", color: C.red, fontSize: 13, fontWeight: 600 }}>{err}</div>}

        {/* confirm-first note card — nothing is saved until Keep */}
        {pendingNote && (
          <div style={{ marginTop: 14, ...cardS, padding: 15, border: "1px solid rgba(231,181,60,.5)" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>📝 Heard as a note</div>
            <div style={{ fontFamily: FONT.serif, fontSize: 16.5, fontWeight: 700, lineHeight: 1.25 }}>{pendingNote.title}</div>
            {pendingNote.body !== pendingNote.title && <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.5, marginTop: 4 }}>{pendingNote.body}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
              <button onClick={() => void keepNote()} style={{ flex: 1.6, cursor: "pointer", border: 0, borderRadius: 11, padding: "13px 14px", fontWeight: 800, fontSize: 14.5, fontFamily: FONT.sans, background: "linear-gradient(135deg,#F4CB63,#D7991C)", color: "#0a1322" }}>✓ Keep it</button>
              <button onClick={askInstead} style={{ flex: 1, cursor: "pointer", borderRadius: 11, padding: "13px 12px", fontWeight: 700, fontSize: 13, fontFamily: FONT.sans, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2 }}>Ask instead</button>
              <button onClick={() => setPendingNote(null)} aria-label="Discard" style={{ cursor: "pointer", borderRadius: 11, padding: "13px 14px", fontWeight: 700, fontSize: 13, fontFamily: FONT.sans, border: "1px solid var(--c-cardbd)", background: "transparent", color: C.muted }}>✕</button>
            </div>
          </div>
        )}
        {savedNote && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderRadius: 11, background: "rgba(52,201,139,.1)", border: "1px solid rgba(52,201,139,.3)", color: C.greenText, fontSize: 13, fontWeight: 600 }}>
            ✓ Noted — &ldquo;{savedNote}&rdquo; will be in your briefing.
          </div>
        )}

        {loading && <div style={{ padding: "0 16px", marginTop: 18 }}><Searching size={15} /></div>}
        {!res && !loading && (
          <div style={{ marginTop: 22 }}>
            {/* only recent questions here (RD 2026-07-20) — no seed suggestions */}
            <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", marginBottom: 10 }}>Recent questions</div>
            {recent.length ? (
              <div style={{ display: "grid" }}>
                {recent.map((s) => (
                  // Font scales with the viewport, and the row is allowed TWO
                  // lines before clamping: at a fixed 14px a long question was
                  // both oversized on a small phone and cut mid-word, so you
                  // could not tell your saved questions apart (RD 2026-07-31).
                  <button key={s} onClick={() => run(s)} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 2px", textAlign: "left", background: "transparent", border: 0, borderBottom: "1px solid var(--c-cardbd)", color: C.text2, fontSize: "clamp(12.5px, 3.5vw, 14px)", lineHeight: 1.4, width: "100%", minWidth: 0, overflow: "hidden" }}>
                    <span style={{ color: C.dim, flexShrink: 0, marginTop: 1 }}><Svg d={I.search} w={15} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{s}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.dim }}>Your recent questions will appear here — ask anything using the box above.</div>
            )}
          </div>
        )}
        {res && <AskResult res={res} onSaveNote={onSaveNote} />}
      </div>
    </div>
  );
}
function AskResult({ res, onSaveNote }: { res: AskResponse; onSaveNote?: (t: string) => void }) {
  const openEmail = useOpenEmail();
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <AskEvalPanel data={res.eval} />
        {onSaveNote && (
          <button
            onClick={() => onSaveNote(res.question)}
            aria-label="Save this question to notes"
            title="Save to notes"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "none", border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 11px 4px 8px", color: C.dim, fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, marginBottom: 10 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Save to notes
          </button>
        )}
      </div>
      {res.answer && <div style={{ marginBottom: 18 }}><AnswerMd text={res.answer} size={15.5} /></div>}
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
          {/* minWidth:0 on the track — a grid item defaults to min-content
              width, so an unbreakable token inside still blows the track out
              even with width:100% on the child (BUG-7 class, recurred in Ask). */}
          <div style={{ display: "grid", gap: 9, minWidth: 0 }}>
            {res.sources.map((s: Source) => (
              <button key={s.index} onClick={() => openEmail(s.messageId)} style={{ ...cardS, padding: 13, textAlign: "left", color: C.text, display: "block", width: "100%", minWidth: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                  <span style={chip(`[${s.index}]`, C.gold)}>[{s.index}]</span>
                  {s.docKind
                    ? <span style={chip(s.docKind, C.blue)}>{s.docKind}</span>
                    : <span style={chip("Email", C.muted)}>Email</span>}
                  <span style={chip(s.stream, streamColor[s.stream] || C.muted)}>{s.stream}</span>
                  <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>{s.date.slice(0, 10)}</span>
                  <Svg d="M7 17L17 7M9 7h8v8" w={12} />
                </div>
                {/* Snippets are raw email bodies — quoted ">" chains and
                    bracketed addresses are unbreakable tokens. Without this the
                    card widens past the viewport, the layout viewport grows with
                    it, and every 100%-width element above renders at a fraction
                    of the screen (seen on iPhone, RD 2026-07-30). */}
                <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>{s.subject || "(no subject)"}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{s.snippet}</div>
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
      <div style={{ fontFamily: "'Public Sans','Inter',system-ui,sans-serif", fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{title}</div>
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
      <div style={{ fontFamily: "'Public Sans','Inter',system-ui,sans-serif", fontSize: 21, fontWeight: 800, color: C.text }}>{n}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Loading({ label = "Loading…" }: { label?: string }) {
  return <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>{label}</div>;
}
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--c-appbg)", display: "flex", flexDirection: "column", animation: "sheetUp .22s ease-out" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top) + 12px) 16px 12px", borderBottom: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.04)", backdropFilter: "blur(12px)" }}>
        <button onClick={onClose} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 99, border: "1px solid var(--c-cardbd)", background: "rgba(var(--ink),.05)", color: C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}><Svg d={I.back} w={18} /></button>
        <span style={{ fontFamily: "'Public Sans','Inter',system-ui,sans-serif", fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      </div>
      {/* z-50 clears the feedback FAB (z-45); safe-area bottom keeps the last
          line off the home indicator on notched phones */}
      <div style={{ flex: 1, overflow: "auto", paddingTop: 14, paddingBottom: "env(safe-area-inset-bottom)" }}>{children}</div>
    </div>
  );
}

