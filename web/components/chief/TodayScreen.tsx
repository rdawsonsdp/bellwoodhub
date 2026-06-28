"use client";
/*
 * TodayScreen — the Mayor's landing screen: "see and act" in one place.
 *
 * The Chief of Staff greets the Mayor, tells him what happened / what's new /
 * what's important, shows what's on his calendar, and hands him the drafts to
 * sign (approve agent actions) — all before he ever opens the inbox. He only
 * leaves for the other screens when he wants to dig in.
 *
 * Shared by mobile (MobileApp) and desktop (ChiefApp); themed via cos-design
 * tokens so it renders correctly in both. Briefing comes from
 * /api/morning-summary (hybrid: deterministic baseline + persona voice).
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { C, FONT, card, eyebrow } from "@/lib/cos-design";
import { getCosPersona, type MorningSummary } from "@/lib/morning";
import { bandForHour, type Band } from "@/lib/theme";
import type { DraftRow } from "@/lib/screens";
import DraftCard from "./DraftCard";

interface InboxItem { messageId: string; fromName: string | null; subject: string | null; snippet: string; date: string; stream: string; cat: string; }

// The hero "lives with the day": sunrise gold morning → bright midday → warm dusk
// evening → deep calm night. Picked by the local hour, independent of theme mode.
const BANNER: Record<Band, { grad: string; ink: string; sub: string; eye: string; shadow: string; dark: boolean }> = {
  am: { grad: "linear-gradient(125deg,#FFD86B 0%,#FFAE57 46%,#FF7E61 100%)", ink: "#3a1404", sub: "#5a2a12", eye: "#8a3c12", shadow: "rgba(255,140,84,.42)", dark: false },
  midday: { grad: "linear-gradient(125deg,#8fd0ff 0%,#bfe0ff 50%,#ffe7ad 100%)", ink: "#11314f", sub: "#284a66", eye: "#1d5a86", shadow: "rgba(90,150,210,.40)", dark: false },
  evening: { grad: "linear-gradient(125deg,#ffc06b 0%,#ff8f7e 52%,#ff6f9c 100%)", ink: "#4a1726", sub: "#6a2436", eye: "#8a2c44", shadow: "rgba(220,110,120,.42)", dark: false },
  night: { grad: "linear-gradient(125deg,#2a3a66 0%,#1a2547 55%,#0f1730 100%)", ink: "#eaf1fb", sub: "#b9c8e6", eye: "#9ab0d6", shadow: "rgba(10,20,45,.50)", dark: true },
};

type GoDest = "emails" | "calendar" | "approvals";
interface Props { onOpenEmail?: (mid: string) => void; onGo: (dest: GoDest) => void; }

/* ── tiny self-contained fetch helpers (no dependency on either app shell) ── */
function useGet<T>(url: string): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [url, tick]);
  return { data, reload: () => setTick((t) => t + 1) };
}
async function post<T>(url: string, body: unknown): Promise<T | null> {
  try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.ok ? await r.json() : null; } catch { return null; }
}

// Fixed (theme-independent) colours so tags stay legible on the bright banner.
const tagColor: Record<string, string> = { sensitive: "#c0341d", "needs reply": "#1d5fb8", "open issue": "#9a5b00" };
const srcMeta: Record<string, { label: string; color: string }> = { gov: { label: "Outlook", color: C.blue }, gmail: { label: "Gmail", color: C.purpleText } };

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 11, gap: 12 }}>
        <div style={{ ...eyebrow(C.dim), fontSize: 11.5, letterSpacing: ".13em" }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function GoLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ cursor: "pointer", background: "none", border: 0, color: C.blue, fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans }}>{label} →</button>;
}

export default function TodayScreen({ onOpenEmail, onGo }: Props) {
  const [summary, setSummary] = useState<MorningSummary | null>(null);

  const load = useCallback(() => {
    post<MorningSummary>("/api/morning-summary", { persona: getCosPersona(), hour: new Date().getHours() }).then((s) => setSummary(s));
  }, []);
  useEffect(() => { load(); }, [load]);

  const { data: appr, reload: reloadAppr } = useGet<{ drafts: DraftRow[] }>("/api/approvals");
  const { data: inbox } = useGet<{ count: number; emails: InboxItem[] }>("/api/inbox?mailbox=gov");
  const drafts = appr?.drafts ?? [];

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const bn = BANNER[bandForHour(new Date().getHours())];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 28px" }}>
      {/* ── HERO ── plain neutral banner while the briefing loads; the time-of-day
          "good morning" banner reveals only once it resolves (no greeting flash / swap) ── */}
      {!summary ? (
        <div style={{ ...card, borderRadius: 20, padding: "26px 24px 24px", marginTop: 16 }}>
          <div style={{ ...eyebrow(C.dim), display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: C.dim2 }} /> Your Chief of Staff · {today}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 11, color: C.text3, fontSize: 15, fontFamily: FONT.serif }}>
            <span style={{ display: "inline-flex", animation: "cosSpin .9s linear infinite", color: C.gold }}><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 12a9 9 0 0 0-9-9" /></svg></span>
            Preparing your briefing…
          </div>
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            <div style={{ height: 11, width: "86%", borderRadius: 6, background: "rgba(var(--ink),.07)", animation: "bwPulse 1.3s ease-in-out infinite" }} />
            <div style={{ height: 11, width: "68%", borderRadius: 6, background: "rgba(var(--ink),.07)", animation: "bwPulse 1.3s ease-in-out infinite" }} />
          </div>
        </div>
      ) : (
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 20, padding: "26px 24px 22px", marginTop: 16,
        background: bn.grad,
        boxShadow: `0 16px 40px ${bn.shadow}`,
      }}>
        {/* rising sun + sky glow */}
        <div style={{ position: "absolute", top: -78, right: -28, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.65), rgba(255,255,255,0) 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(130% 120% at 100% -10%, rgba(255,255,255,.28), transparent 55%)", pointerEvents: "none" }} />
        {/* Village of Bellwood seal — subtle watermark behind the briefing */}
        <div style={{ position: "absolute", right: -38, top: -20, opacity: 0.14, pointerEvents: "none" }}>
          <svg width={250} height={250} viewBox="0 0 120 120" fill="none" stroke="#ffffff">
            <circle cx={60} cy={60} r={55} strokeWidth={1.4} />
            <circle cx={60} cy={60} r={47} strokeWidth={0.7} />
            <path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z" fill="#ffffff" stroke="none" transform="translate(36 24) scale(2)" />
            <text x={60} y={87} textAnchor="middle" fontFamily="Newsreader, serif" fontSize={12} letterSpacing={3} fontWeight={700} fill="#ffffff" stroke="none">BELLWOOD</text>
            <text x={60} y={100} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={5.2} letterSpacing={2.4} fill="#ffffff" stroke="none">EST. 1900</text>
            <text x={60} y={21} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={5.2} letterSpacing={2} fill="#ffffff" stroke="none">★ VILLAGE OF ★</text>
          </svg>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, fontFamily: FONT.mono, fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: bn.eye, fontWeight: 700 }}>
            <span style={{ fontSize: 13 }}>☀</span> Your Chief of Staff · {today}
            {summary?.weather && <span>· {summary.weather.icon} {summary.weather.tempF}° {summary.weather.label}</span>}
          </div>
          <div style={{ fontFamily: FONT.serif, fontSize: "clamp(20px, 5.2vw, 28px)", fontWeight: 700, color: bn.ink, lineHeight: 1.12, margin: "10px 0 4px", letterSpacing: "-.01em" }}>
            {summary?.greeting ?? "Good morning."}
          </div>
          <div style={{ fontSize: "clamp(12.5px, 3.2vw, 14px)", color: bn.sub, lineHeight: 1.5, marginTop: 8, minHeight: 22, fontWeight: 500 }}>
            {summary ? summary.narrative : <span style={{ opacity: .7 }}>Pulling together your morning briefing…</span>}
          </div>
          {summary?.onThisDay && (
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 10, fontSize: 12.5, color: bn.sub, fontStyle: "italic" }}>
              <span style={{ fontFamily: FONT.mono, fontStyle: "normal", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, flexShrink: 0 }}>On this day</span>
              <span>{summary.onThisDay}</span>
            </div>
          )}

          {summary && summary.pressing.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: bn.eye, fontWeight: 700, marginBottom: 8 }}>Most important today</div>
              <div style={{ display: "grid", gap: 7 }}>
                {summary.pressing.map((p, i) => (
                  <button key={p.messageId ?? i} onClick={() => p.messageId && onOpenEmail?.(p.messageId)} style={{
                    display: "flex", alignItems: "flex-start", gap: 9, textAlign: "left", width: "100%", minWidth: 0, cursor: p.messageId ? "pointer" : "default",
                    padding: "8px 11px", borderRadius: 11, border: "1px solid rgba(255,255,255,.55)", background: "rgba(255,255,255,.74)", color: "#3a1404",
                  }}>
                    <span style={{ ...miniTagLight(tagColor[p.tag] ?? bn.eye), marginTop: 1 }}>{p.tag}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.32, overflowWrap: "anywhere" }}>{p.title}</span>
                    {p.messageId && <span style={{ color: bn.eye, fontSize: 15, lineHeight: 1.2, flexShrink: 0 }}>›</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 15, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: bn.eye, fontWeight: 600 }}>
              {summary ? (summary.live ? "voiced by your Chief of Staff" : "briefing") : ""}
              {summary && ` · ${summary.counts.needYou} need you · ${summary.counts.eventsToday} on calendar · ${drafts.length} to sign`}
            </span>
            <button onClick={load} style={{ marginLeft: "auto", cursor: "pointer", background: bn.dark ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.6)", border: `1px solid ${bn.dark ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.7)"}`, borderRadius: 8, color: bn.eye, fontSize: 11.5, fontWeight: 700, padding: "5px 11px", fontFamily: FONT.sans }}>↻ Refresh</button>
          </div>
        </div>
      </div>
      )}

      {/* ── ON YOUR CALENDAR ── */}
      <Section title="On your calendar today" action={<GoLink label="Open calendar" onClick={() => onGo("calendar")} />}>
        <div style={{ ...card, padding: 6 }}>
          {!summary && <Placeholder text="Loading your day…" />}
          {summary && summary.calendar.length === 0 && <Placeholder text="Nothing scheduled today." />}
          {summary?.calendar.map((e) => {
            const sm = srcMeta[e.source ?? "gov"] ?? srcMeta.gov;
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderTop: `1px solid ${C.line2}` }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: sm.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{e.when}</span>
                <span style={{ ...miniTag(sm.color) }}>{sm.label}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── TO SIGN: approve the agents' drafts (the "checks") ── */}
      <Section title={`To sign · ${drafts.length} draft${drafts.length === 1 ? "" : "s"} from your agents`} action={<GoLink label="Open approvals" onClick={() => onGo("approvals")} />}>
        <div style={{ display: "grid", gap: 10 }}>
          {!appr && <div style={{ ...card, padding: 14 }}><Placeholder text="Loading drafts…" /></div>}
          {appr && drafts.length === 0 && <div style={{ ...card, padding: 18, textAlign: "center", color: C.dim, fontSize: 13 }}>Nothing waiting on your signature. ✓</div>}
          {drafts.map((d) => <DraftCard key={d.draftId} draft={d} onReload={reloadAppr} />)}
        </div>
      </Section>

      {/* ── INBOX preview (then he can dig in) ── */}
      <Section title="Your inbox" action={<GoLink label="Open inbox" onClick={() => onGo("emails")} />}>
        <div style={{ ...card, padding: 6 }}>
          {!inbox && <Placeholder text="Loading inbox…" />}
          {(inbox?.emails ?? []).slice(0, 5).map((e) => (
            <button key={e.messageId} onClick={() => onOpenEmail?.(e.messageId)} style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left", width: "100%", cursor: "pointer", padding: "10px 12px", borderTop: `1px solid ${C.line2}`, background: "none", border: 0, borderRadius: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", width: "100%" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{e.fromName || "—"}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.dim }}>{new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>{e.subject}</div>
            </button>
          ))}
          {inbox && (inbox.emails ?? []).length === 0 && <Placeholder text="Inbox is clear." />}
        </div>
      </Section>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div style={{ padding: 22, textAlign: "center", color: C.dim, fontSize: 13 }}>{text}</div>;
}
function miniTag(color: string): CSSProperties {
  return { display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, fontFamily: FONT.mono, color, background: "rgba(var(--ink),.08)", whiteSpace: "nowrap", flexShrink: 0 };
}
// Same chip, but for the bright sunrise banner (solid light bg so it stays legible).
function miniTagLight(color: string): CSSProperties {
  return { display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 800, fontFamily: FONT.mono, color, background: "rgba(255,255,255,.9)", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${color}33` };
}
