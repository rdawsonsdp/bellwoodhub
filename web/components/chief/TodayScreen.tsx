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
import type { DraftRow } from "@/lib/screens";

interface InboxItem { messageId: string; fromName: string | null; subject: string | null; snippet: string; date: string; stream: string; cat: string; }

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

const tagColor: Record<string, string> = { sensitive: C.red, "needs reply": C.blue, "open issue": C.orange };
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
  const [busy, setBusy] = useState(true);

  const load = useCallback(() => {
    setBusy(true);
    post<MorningSummary>("/api/morning-summary", { persona: getCosPersona() }).then((s) => { setSummary(s); setBusy(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const { data: appr, reload: reloadAppr } = useGet<{ drafts: DraftRow[] }>("/api/approvals");
  const { data: inbox } = useGet<{ count: number; emails: InboxItem[] }>("/api/inbox?mailbox=gov");
  const drafts = appr?.drafts ?? [];

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 28px" }}>
      {/* ── HERO: greeting + what happened / new / important ── */}
      <div style={{ ...card, position: "relative", overflow: "hidden", padding: "22px 22px 20px", marginTop: 16, borderColor: "rgba(231,181,60,.3)" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 0% 0%, rgba(231,181,60,.10), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...eyebrow(C.gold) }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: C.gold }} />
            Your Chief of Staff · {today}
          </div>
          <div style={{ fontFamily: FONT.serif, fontSize: 28, fontWeight: 600, color: C.text, lineHeight: 1.15, margin: "10px 0 4px" }}>
            {busy && !summary ? "Good morning." : summary?.greeting ?? "Good morning."}
          </div>
          <div style={{ fontSize: 15, color: C.text2, lineHeight: 1.62, marginTop: 8, minHeight: 24 }}>
            {summary ? summary.narrative : <span style={{ color: C.dim }}>Pulling together your morning briefing…</span>}
          </div>

          {summary && summary.pressing.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...eyebrow(C.dim), fontSize: 10.5, marginBottom: 8 }}>Most important today</div>
              <div style={{ display: "grid", gap: 7 }}>
                {summary.pressing.map((p, i) => (
                  <button key={p.messageId ?? i} onClick={() => p.messageId && onOpenEmail?.(p.messageId)} style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%", cursor: p.messageId ? "pointer" : "default",
                    padding: "9px 11px", borderRadius: 11, border: `1px solid ${C.cardBd}`, background: "rgba(var(--ink),.03)", color: C.text,
                  }}>
                    <span style={{ ...miniTag(tagColor[p.tag] ?? C.muted) }}>{p.tag}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
                    {p.messageId && <span style={{ color: C.dim, fontSize: 16, lineHeight: 1 }}>›</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.dim }}>
              {summary ? (summary.live ? "voiced by your Chief of Staff" : "briefing") : ""}
              {summary && ` · ${summary.counts.needYou} need you · ${summary.counts.eventsToday} on calendar · ${drafts.length} to sign`}
            </span>
            <button onClick={load} style={{ marginLeft: "auto", cursor: "pointer", background: "none", border: `1px solid ${C.cardBd}`, borderRadius: 8, color: C.text3, fontSize: 11.5, fontWeight: 600, padding: "5px 11px", fontFamily: FONT.sans }}>↻ Refresh</button>
          </div>
        </div>
      </div>

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
          {drafts.map((d) => (
            <div key={d.draftId} style={{ ...card, padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>To · {d.recipients}</span>
                <span style={{ ...miniTag(C.purpleText) }}>draft</span>
              </div>
              <div style={{ fontSize: 13.5, color: C.text2, marginTop: 3 }}>{d.subject}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5, maxHeight: 54, overflow: "hidden" }}>{d.body}</div>
              <div style={{ display: "flex", gap: 9, marginTop: 11 }}>
                <button onClick={async () => { await post("/api/approvals", { action: "discard", draftId: d.draftId }); reloadAppr(); }} style={{ flex: 1, cursor: "pointer", padding: 9, borderRadius: 9, border: `1px solid ${C.cardBd}`, background: "rgba(var(--ink),.05)", color: C.text2, fontSize: 12.5, fontWeight: 600, fontFamily: FONT.sans }}>Discard</button>
                <button onClick={async () => { await post("/api/approvals", { action: "approve", draftId: d.draftId }); reloadAppr(); }} style={{ flex: 1, cursor: "pointer", padding: 9, borderRadius: 9, border: 0, background: C.green, color: "#062418", fontSize: 12.5, fontWeight: 700, fontFamily: FONT.sans }}>Approve &amp; send</button>
              </div>
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 8, fontFamily: FONT.mono }}>drafted by the Drafting Agent · R3 · never auto-sent</div>
            </div>
          ))}
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
