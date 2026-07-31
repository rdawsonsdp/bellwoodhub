"use client";
/*
 * panels.tsx — the three things the Dashboard exists to say:
 * what's coming up, which mail is urgent, what's waiting on you.
 *
 * Presentational only — no fetching, no effects. MobileApp and ChiefApp each
 * fetch and pass the same props, so the two platforms cannot drift again.
 *
 * HONESTY RULE (house non-negotiable): empty states name the real reason.
 * Nothing here is decorative.
 */
import type { MorningSummary, PressingItem } from "@/lib/morning";
import { useEffect, useState } from "react";
import { QUIET_HEADLINE, nextAgentRun } from "@/lib/agent-run";
import type { QueueItem } from "@/lib/queue";
import type { DemoEvent } from "@/lib/demo";
import { P, SANS, WCard, btnSolid, btnOutline } from "../DashboardHub";

function PanelHead({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>{title}</span>
      {typeof count === "number" && count > 0 && (
        <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 800, color: P.text }}>{count}</span>
      )}
      {hint && <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 10.5, color: P.text3 }}>{hint}</span>}
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 15, borderRadius: 6, background: "rgba(20,51,92,.07)", animation: "dashSkeleton 1.4s ease-in-out infinite", animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.text3, lineHeight: 1.55 }}>{children}</div>;
}

/* ── 0. The brief — what your desks concluded overnight ─────────────────────
   First thing read in the morning (RD 2026-07-30), so it leads the screen.
   This is the desks' SYNTHESIS, not a mail count: the narrative is written by
   the Chief of Staff agent over every desk's latest run. Each desk that filed
   something is named beneath it, so the summary is attributable. ─────────── */
export function BriefPanel({ sum, loading, onRefreshed }: {
  sum: MorningSummary | null;
  loading: boolean;
  /** re-fetch the brief after an on-demand pass finishes */
  onRefreshed?: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  // Rendered client-side only: the next-run clock and "ago" both depend on the
  // viewer's timezone, and computing them during SSR desyncs on hydration.
  const [nextRun, setNextRun] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNextRun(nextAgentRun(new Date()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const runNow = async () => {
    setRunning(true); setRunErr(null);
    try {
      const r = await fetch("/api/agents/run-now", { method: "POST" });
      if (!r.ok) throw new Error(r.status === 401 ? "Sign in to run your desks." : `Run failed (${r.status})`);
      onRefreshed?.();
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  // Desks that ran and found nothing say so with a fixed sentinel. Listing
  // each one buries the desks that DID file something, so they collapse into a
  // single count — the "it ran" signal survives without the repetition.
  const all = sum?.agents ?? [];
  const notes = all.filter((n) => n.note !== QUIET_HEADLINE);
  const quiet = all.length - notes.length;
  return (
    <WCard>
      <PanelHead
        title="Your brief"
        hint={sum?.generatedAt ? `updated ${new Date(sum.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : undefined}
      />
      {loading ? <Skeleton rows={3} /> : !sum?.narrative ? (
        <Empty>No brief yet — it is written after your desks run.</Empty>
      ) : (
        <>
          <div style={{ fontFamily: SANS, fontSize: 15, color: P.text, lineHeight: 1.65, overflowWrap: "anywhere" }}>
            {sum.narrative}
          </div>
          {notes.length > 0 && (
            <div style={{ display: "grid", gap: 7, marginTop: 13, borderTop: `1px solid ${P.border}`, paddingTop: 11 }}>
              {notes.slice(0, 6).map((n, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: P.text3, flexShrink: 0, minWidth: 86 }}>{n.name}</span>
                  <span style={{ fontFamily: SANS, fontSize: 12.5, color: P.text2, lineHeight: 1.5, overflowWrap: "anywhere" }}>{n.note}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={runNow} disabled={running}
              style={{ ...btnOutline, opacity: running ? 0.6 : 1, cursor: running ? "default" : "pointer" }}>
              {running ? "Running desks…" : "Run now"}
            </button>
            <span style={{ fontFamily: SANS, fontSize: 10.5, color: P.text3 }}>
              {all.length > 0 && <>{all.length} desk{all.length === 1 ? "" : "s"} checked{quiet > 0 ? ` · ${quiet} had nothing new` : ""}</>}
              {nextRun && <> · next run {nextRun}</>}
            </span>
          </div>
          {runErr && (
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: P.red, marginTop: 7 }}>{runErr}</div>
          )}
        </>
      )}
    </WCard>
  );
}

/* ── 1. Today & coming up ───────────────────────────────────────────────── */
export function UpcomingPanel({ events, loading, onGoCalendar }: {
  events: DemoEvent[];
  loading: boolean;
  onGoCalendar?: () => void;
}) {
  const upcoming = events.slice(0, 6);
  return (
    <WCard>
      <PanelHead title="Today & coming up" hint="next 7 days" />
      {loading ? <Skeleton rows={3} /> : upcoming.length === 0 ? (
        <Empty>No calendar is connected yet, so there is nothing to show. Events appear here the moment it syncs.</Empty>
      ) : (
        <div style={{ display: "grid", gap: 11 }}>
          {upcoming.map((e) => {
            const conflicts = e.conflictsWith?.length ?? 0;
            return (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: conflicts ? P.red : P.amber, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 800, color: P.text }}>{e.dueLabel}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: P.text2, overflowWrap: "anywhere" }}>{e.title}</div>
                  {conflicts > 0 && (
                    <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: P.red, marginTop: 3 }}>
                      Conflicts with {conflicts} other event{conflicts === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {onGoCalendar && (
        <button onClick={onGoCalendar} style={{ ...btnOutline, alignSelf: "flex-start", marginTop: 13 }}>Full calendar ›</button>
      )}
    </WCard>
  );
}

/* ── 2. Urgent email ────────────────────────────────────────────────────── */
export function UrgentEmailPanel({ items, loading, onOpenEmail }: {
  items: PressingItem[];
  loading: boolean;
  onOpenEmail?: (mid: string) => void;
}) {
  return (
    <WCard>
      <PanelHead title="Urgent email" count={items.length} />
      {loading ? <Skeleton rows={4} /> : items.length === 0 ? (
        <Empty>Nothing urgent in the mail right now.</Empty>
      ) : (
        <div className="scrl" style={{ overflowY: "auto", maxHeight: 520, margin: "0 -18px" }}>
          {items.map((a, i) => (
            <div key={i} style={{ padding: "13px 18px", borderTop: i ? `1px solid ${P.border}` : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: i === 0 ? P.red : i < 3 ? P.amber : "#A8A29A", flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 800, color: P.text, lineHeight: 1.3, overflowWrap: "anywhere" }}>{a.title}</span>
              </div>
              {a.why && (
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.text2, lineHeight: 1.5, marginTop: 5, overflowWrap: "anywhere" }}>{a.why}</div>
              )}
              {a.messageId && onOpenEmail && (
                <button onClick={() => onOpenEmail(a.messageId!)} style={{ ...btnSolid, marginTop: 10 }}>Open email ↗</button>
              )}
            </div>
          ))}
        </div>
      )}
    </WCard>
  );
}

/* ── 3. Waiting on you ──────────────────────────────────────────────────── */
export function WaitingOnYouPanel({ items, loading, onGoQueue }: {
  items: QueueItem[];
  loading: boolean;
  onGoQueue?: () => void;
}) {
  return (
    <WCard>
      <PanelHead title="Waiting on you" count={items.length} />
      {loading ? <Skeleton rows={2} /> : items.length === 0 ? (
        <Empty>Nothing waiting on you — the queue is clear.</Empty>
      ) : (
        <div style={{ display: "grid", gap: 11 }}>
          {items.slice(0, 5).map((q) => (
            <div key={q.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: P.amber, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 800, color: P.text, overflowWrap: "anywhere" }}>{q.subject}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: P.text3, overflowWrap: "anywhere" }}>to {q.to}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {onGoQueue && items.length > 0 && (
        <button onClick={onGoQueue} style={{ ...btnSolid, alignSelf: "flex-start", marginTop: 13 }}>Review &amp; approve ›</button>
      )}
    </WCard>
  );
}
