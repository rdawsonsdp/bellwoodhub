/*
 * usage.ts — the adoption instrumentation (Phase 5). Four numbers run the
 * weekly session with the Mayor:
 *
 *   1. time-from-open-to-first-tap     (is the Wall legible in 5 seconds?)
 *   2. queue-clear duration            (does ACT take under 5 minutes?)
 *   3. fix-it uses                     (is revision trusted over rewriting?)
 *   4. digest opens per agent          (which cabinet seats earn attention?)
 *
 * DEMO: console + a localStorage ring buffer ("bw-usage"). Live: a tiny
 * events table later. Pure helpers are exported for the eval harness.
 */
export interface UsageEvent {
  t: string; // app_open | first_tap | queue_clear | fixit_used | digest_open
  ts: number;
  data?: Record<string, unknown>;
}

const KEY = "bw-usage";
export const USAGE_CAP = 300;

export function readUsage(): UsageEvent[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as UsageEvent[]) : [];
  } catch {
    return [];
  }
}

/** Pure: append with a ring-buffer cap (oldest events fall off). */
export function appendCapped(events: UsageEvent[], ev: UsageEvent, cap = USAGE_CAP): UsageEvent[] {
  const next = [...events, ev];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function logUsage(t: string, data?: Record<string, unknown>): void {
  const ev: UsageEvent = { t, ts: Date.now(), data };
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(appendCapped(readUsage(), ev)));
  } catch {
    /* ring buffer is best-effort */
  }
  // the console line is part of the instrumentation contract (demo mode)
  console.log(`[usage] ${t}`, data ?? "");
}

export function clearUsage(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

// ── the four numbers ─────────────────────────────────────────────────────────

export interface UsageSummary {
  opens: number;
  medianFirstTapMs: number | null;
  medianQueueClearMs: number | null;
  fixitUses: number;
  digestOpens: Record<string, number>; // per agentKey
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function usageSummary(events: UsageEvent[]): UsageSummary {
  const num = (e: UsageEvent, k: string) => (typeof e.data?.[k] === "number" ? (e.data[k] as number) : null);
  const firstTaps = events.filter((e) => e.t === "first_tap").map((e) => num(e, "ms")).filter((n): n is number => n !== null);
  const clears = events.filter((e) => e.t === "queue_clear").map((e) => num(e, "ms")).filter((n): n is number => n !== null);
  const digestOpens: Record<string, number> = {};
  for (const e of events.filter((e) => e.t === "digest_open")) {
    const k = String(e.data?.agentKey ?? "unknown");
    digestOpens[k] = (digestOpens[k] ?? 0) + 1;
  }
  return {
    opens: events.filter((e) => e.t === "app_open").length,
    medianFirstTapMs: median(firstTaps),
    medianQueueClearMs: median(clears),
    fixitUses: events.filter((e) => e.t === "fixit_used").length,
    digestOpens,
  };
}
