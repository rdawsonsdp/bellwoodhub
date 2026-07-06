"use client";
/*
 * SyncScreen — the transparency console over every mirror process (RD
 * 2026-07-06: "for transparency, we need a Sync page that shows the syncing
 * processes" — the Mayor's first sync takes hours, especially the Voyage
 * index). Three gauges — mail per account, the search index, calendar — plus
 * scheduler liveness and the recent-run ledger. The Run control strings
 * POST /api/sync passes together until every backlog is drained: each pass
 * is one server time-budget; this page keeps them coming while it's open,
 * and the 15-minute scheduler keeps things moving when it isn't.
 */
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { C, FONT, card, pill } from "@/lib/cos-design";

interface Account {
  provider: "outlook" | "gmail";
  address: string;
  mailbox: string;
  status: string;
  phase: "backfill" | "incremental" | "first-pull" | "error";
  mirrored: number;
  mailboxTotal: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}
interface Status {
  live: boolean;
  accounts: Account[];
  index: { messages: number; indexed: number; remaining: number; ratePerMin: number | null; etaMinutes: number | null };
  calendar: { events: number; lastRunAt: string | null };
  scheduler: { lastIngestAt: string | null; lastEmbedAt: string | null; cadenceMinutes: number; stale: boolean };
  recent: { at: string; action: string; summary: string }[];
}

const ago = (iso: string | null): string => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const eta = (min: number): string => (min < 90 ? `~${min} min` : `~${(min / 60).toFixed(1)} h`);
const fmtT = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const PHASE: Record<Account["phase"], { label: string; fg: string; bg: string }> = {
  backfill: { label: "Backfilling — first mirror", fg: "#E7B53C", bg: "rgba(231,181,60,.14)" },
  incremental: { label: "Up to date — incremental", fg: "#4CAF7D", bg: "rgba(76,175,125,.14)" },
  "first-pull": { label: "Queued — first pull", fg: "#6FA8DC", bg: "rgba(111,168,220,.14)" },
  error: { label: "Error", fg: "#E06C5F", bg: "rgba(224,108,95,.14)" },
};

function Bar({ num, den, tone }: { num: number; den: number | null; tone: string }) {
  const pct = den && den > 0 ? Math.min(100, Math.round((100 * num) / den)) : null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 7, borderRadius: 99, background: "rgba(var(--ink),.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct ?? 100}%`, borderRadius: 99, background: tone, opacity: pct === null ? 0.25 : 1, transition: "width .6s ease" }} />
      </div>
      <div style={{ marginTop: 5, fontFamily: FONT.mono, fontSize: 11.5, color: C.text3 }}>
        {num.toLocaleString()}{den ? ` of ${den.toLocaleString()} · ${pct}%` : " mirrored"}
      </div>
    </div>
  );
}

/** A configured provider with no connector row = a mailbox waiting to be
 *  connected. The button is a full OAuth sign-in with that provider — the
 *  grant doubles as the mail consent (lib/auth.ts vaults the refresh token),
 *  so the row appears here as soon as the redirect lands back. */
function ConnectButtons({ providers, haveOutlook, haveGmail }: { providers: Record<string, unknown>; haveOutlook: boolean; haveGmail: boolean }) {
  const wanted: [string, boolean, string][] = [
    ["microsoft-entra-id", haveOutlook, "Connect Outlook — sign in with Microsoft"],
    ["google", haveGmail, "Connect Gmail — sign in with Google"],
  ];
  const missing = wanted.filter(([id, have]) => providers[id] && !have);
  if (!missing.length) return null;
  return (
    <div style={{ paddingTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      {missing.map(([id, , label]) => (
        <button
          key={id}
          onClick={() => void signIn(id, { callbackUrl: "/chief" })}
          style={{
            cursor: "pointer", border: `1px solid ${C.blue}`, background: "rgba(111,168,220,.12)",
            color: C.blue, borderRadius: 99, padding: "9px 16px",
            fontFamily: FONT.sans, fontWeight: 700, fontSize: 13,
          }}
        >
          + {label}
        </button>
      ))}
      <span style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
        Connecting is a sign-in: the same grant carries the read-mail consent, then the mailbox mirrors on the {"15"}-minute loop.
      </span>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ ...card, padding: "16px 18px", marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 17, fontWeight: 600, color: C.text }}>{title}</span>
        {sub && <span style={{ fontSize: 12, color: C.text3 }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export default function SyncScreen() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [passes, setPasses] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // configured Auth.js providers — a provider with no connector row yet gets
  // a Connect button (the second sign-in IS the mail consent; nothing else
  // in the app ever triggers it)
  const [providers, setProviders] = useState<Record<string, unknown>>({});
  const stopRef = useRef(false);

  const load = (withTotals: boolean) =>
    fetch(`/api/sync/status${withTotals ? "" : "?totals=0"}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status failed"))))
      .then((d: Status) => setStatus(d))
      .catch(() => { /* keep the last snapshot */ });

  useEffect(() => { void load(true); }, []);
  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, unknown>) => setProviders(d ?? {}))
      .catch(() => { /* no auth configured (demo) — no connect buttons */ });
  }, []);
  useEffect(() => {
    if (running) return; // pass loop refreshes between passes
    const t = window.setInterval(() => void load(false), 20_000);
    return () => window.clearInterval(t);
  }, [running]);
  useEffect(() => () => { stopRef.current = true; }, []); // leaving the page stops the loop

  async function runUntilDone() {
    if (running) return;
    setRunning(true);
    setErr(null);
    setPasses([]);
    stopRef.current = false;
    try {
      // each pass = one server time-budget (~5 min max); a fresh mailbox takes
      // many — keep going until both backlogs (mirror + index) read zero
      for (let pass = 1; pass <= 240 && !stopRef.current; pass++) {
        const r = await fetch("/api/sync", { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "sync failed");
        const mail = ((d.email?.results ?? []) as { landed?: number }[]).reduce((n, x) => n + (x.landed ?? 0), 0);
        const idx = Number(d.embed?.embeddedMessages ?? 0);
        setPasses((p) => [`pass ${pass} — landed ${mail} mail · indexed ${idx}`, ...p].slice(0, 10));
        await load(false);
        if (!d.backfillRemaining && !d.embedRemaining) break;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "sync failed");
    }
    setRunning(false);
    void load(true);
  }

  const s = status;
  return (
    <div className="fu" style={{ padding: "24px 20px 56px", maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 28, fontWeight: 500, color: C.text }}>Sync</div>
        <span style={{ fontSize: 12.5, color: C.text3 }}>Every mirror process, live — what&apos;s syncing, how far along, what&apos;s left.</span>
        {s && !s.live && <span style={{ ...pill(C.text2, "rgba(var(--ink),.08)"), fontSize: 11 }}>Demo data</span>}
      </div>

      {/* Run control — the "keep it going" loop (attended; the scheduler covers unattended) */}
      {s?.live !== false && (
        <div style={{ ...card, padding: "14px 18px", marginTop: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button
            onClick={running ? () => { stopRef.current = true; } : runUntilDone}
            style={{
              cursor: "pointer", border: `1px solid ${running ? C.orangeText : C.gold}`,
              background: running ? "rgba(224,140,80,.12)" : "rgba(231,181,60,.14)",
              color: running ? C.orangeText : C.goldHi, borderRadius: 99, padding: "9px 18px",
              fontFamily: FONT.sans, fontWeight: 700, fontSize: 13.5,
            }}
          >
            {running ? "■ Stop after this pass" : "▶ Run sync until caught up"}
          </button>
          <span style={{ fontSize: 12, color: C.text3, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
            Passes run while this page stays open; the {s?.scheduler.cadenceMinutes ?? 15}-minute scheduler keeps
            things moving in the background either way.
          </span>
          {err && <span style={{ fontSize: 12, color: C.redText }}>{err}</span>}
        </div>
      )}
      {passes.length > 0 && (
        <div style={{ ...card, padding: "10px 16px", marginTop: 8 }}>
          {passes.map((p, i) => (
            <div key={i} style={{ fontFamily: FONT.mono, fontSize: 11.5, color: i === 0 ? C.text2 : C.dim, padding: "3px 0" }}>{p}</div>
          ))}
        </div>
      )}

      {!s && <div style={{ ...card, padding: 22, marginTop: 12, textAlign: "center", color: C.dim, fontSize: 13 }}>Reading sync state…</div>}

      {s && (
        <>
          <Section title="Mail mirror" sub="one row per connected account — the wall stays per-mailbox">
            {s.accounts.length === 0 && <div style={{ marginTop: 10, fontSize: 13, color: C.dim }}>No connected accounts yet — sign-in connects the first one.</div>}
            {s.accounts.map((a) => {
              const ph = PHASE[a.phase];
              return (
                <div key={a.address} style={{ padding: "12px 0", borderBottom: `1px solid ${C.line2}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                      {a.provider === "outlook" ? "Outlook" : "Gmail"} · {a.address}
                    </span>
                    <span style={{ ...pill(ph.fg, ph.bg), fontSize: 10.5 }}>{ph.label}</span>
                    <span style={{ ...pill(C.text3, "rgba(var(--ink),.07)"), fontSize: 10.5 }}>
                      {a.mailbox === "biz" ? "Business · walled" : "Government · public record"}
                    </span>
                    {a.status !== "active" && a.phase !== "error" && (
                      <span style={{ ...pill(C.orangeText, "rgba(224,140,80,.12)"), fontSize: 10.5 }}>{a.status}</span>
                    )}
                    <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 11, color: C.muted }}>synced {ago(a.lastSyncedAt)}</span>
                  </div>
                  <Bar num={a.mirrored} den={a.mailboxTotal} tone={a.phase === "error" ? C.red : "linear-gradient(90deg,#D7991C,#F4CB63)"} />
                  {a.lastError && <div style={{ marginTop: 6, fontSize: 12, color: C.redText, overflowWrap: "anywhere" }}>{a.lastError}</div>}
                  {a.phase === "error" && s.live && (
                    // a dead token (invalid_grant) is fixed by consenting again —
                    // the re-consent rotates the vault secret and re-activates the row
                    <button
                      onClick={() => void signIn(a.provider === "outlook" ? "microsoft-entra-id" : "google", { callbackUrl: "/chief" })}
                      style={{
                        marginTop: 8, cursor: "pointer", border: `1px solid ${C.red}`, background: "rgba(224,108,95,.10)",
                        color: C.redText, borderRadius: 99, padding: "7px 14px", fontFamily: FONT.sans, fontWeight: 700, fontSize: 12.5,
                      }}
                    >
                      ↻ Reconnect — sign in with {a.provider === "outlook" ? "Microsoft" : "Google"} again
                    </button>
                  )}
                </div>
              );
            })}
            {s.live && (
              <ConnectButtons
                providers={providers}
                haveOutlook={s.accounts.some((a) => a.provider === "outlook")}
                haveGmail={s.accounts.some((a) => a.provider === "gmail")}
              />
            )}
          </Section>

          <Section title="Search index" sub="Voyage embeddings — mail becomes searchable here (the long pole)">
            <Bar num={s.index.indexed} den={s.index.messages} tone="linear-gradient(90deg,#3E7CB1,#6FA8DC)" />
            <div style={{ marginTop: 6, fontSize: 12.5, color: C.text3 }}>
              {s.index.remaining > 0
                ? <>
                    <b style={{ color: C.text2 }}>{s.index.remaining.toLocaleString()}</b> messages still to index
                    {s.index.ratePerMin ? <> · ~{s.index.ratePerMin.toLocaleString()}/min</> : null}
                    {s.index.etaMinutes ? <> · <b style={{ color: C.text2 }}>{eta(s.index.etaMinutes)}</b> at the current rate</> : null}
                  </>
                : "Fully indexed — every mirrored message is searchable."}
            </div>
          </Section>

          <Section title="Calendar mirror">
            <div style={{ marginTop: 8, fontSize: 13, color: C.text2 }}>
              <b>{s.calendar.events.toLocaleString()}</b> events mirrored · last pass {ago(s.calendar.lastRunAt)}
            </div>
          </Section>

          <Section title="Scheduler" sub={`automatic passes every ${s.scheduler.cadenceMinutes} min`}>
            <div style={{ marginTop: 8, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: C.text3 }}>
              <span>mail pull <b style={{ color: C.text2 }}>{ago(s.scheduler.lastIngestAt)}</b></span>
              <span>index pass <b style={{ color: C.text2 }}>{ago(s.scheduler.lastEmbedAt)}</b></span>
            </div>
            {s.scheduler.stale && s.live && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: C.orangeText }}>
                No automatic run in over {2 * s.scheduler.cadenceMinutes + 5} minutes — the scheduler may be stalled.
                Passes still run from this page.
              </div>
            )}
          </Section>

          <Section title="Recent runs" sub="from the audit ledger — the full feed lives on Activity">
            {s.recent.length === 0 && <div style={{ marginTop: 10, fontSize: 13, color: C.dim }}>Nothing logged yet.</div>}
            {s.recent.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "7px 0", borderBottom: i < s.recent.length - 1 ? `1px solid ${C.line2}` : undefined }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 11.5, fontWeight: 700, color: C.text2, whiteSpace: "nowrap" }}>{r.action}</span>
                <span style={{ fontSize: 12.5, color: C.text3, flex: 1, minWidth: 0 }}>{r.summary}</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{fmtT(r.at)}</span>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
