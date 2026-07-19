/*
 * agent-schedule.ts — when agents run, stated plainly.
 *
 * The product problem this solves is trust, not information. Today a card says
 * "updated 10h ago" and nothing else, which leaves the operator unable to
 * answer three questions that decide whether they keep using the thing:
 *
 *   1. When will it run again?           (no answer anywhere in the UI)
 *   2. Is the scheduler even alive?      (no answer)
 *   3. Did it run and find nothing, or did it not run?
 *
 * The third is the dangerous one, because a quiet desk and a broken desk look
 * IDENTICAL. A user who suspects an agent silently stopped goes back to reading
 * their own inbox — and they are right to, because they have no way to tell.
 *
 * Single source of truth for the cadence. It must match the cron in
 * vercel.json; a UI that promises a different schedule than the one that fires
 * is worse than no promise at all.
 */

/** `0 12-22 * * *` in web/vercel.json — hourly on the hour, 12:00–22:00 UTC. */
export const AGENT_CRON = { utcHours: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] } as const;

/** Central time is what the Mayor's office runs on; the cron is written in UTC. */
export const DISPLAY_TZ = "America/Chicago";

export interface AgentScheduleInfo {
  /** One line the operator can read without knowing what cron is. */
  cadence: string;
  /** Next scheduled fire, ISO. */
  nextRunAt: string;
  /** Most recent run across all agents, ISO — the liveness signal. */
  lastRunAt: string | null;
  /** The scheduler looks stopped: no run since well past the last due slot. */
  stale: boolean;
  /** Plain-language explanation when stale, else null. */
  staleReason: string | null;
}

/** Next UTC hour in the allowed set, at :00. */
export function nextRunAfter(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  for (let i = 0; i <= 48; i++) {
    if (i > 0 || next <= from) next.setUTCHours(next.getUTCHours() + 1);
    if ((AGENT_CRON.utcHours as readonly number[]).includes(next.getUTCHours())) return next;
  }
  return next;
}

/** Most recent slot that should already have fired. */
export function lastDueRun(from: Date = new Date()): Date {
  const prev = new Date(from);
  prev.setUTCMinutes(0, 0, 0);
  for (let i = 0; i <= 48; i++) {
    if ((AGENT_CRON.utcHours as readonly number[]).includes(prev.getUTCHours()) && prev <= from) return prev;
    prev.setUTCHours(prev.getUTCHours() - 1);
  }
  return prev;
}

const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-US", { timeZone: DISPLAY_TZ, hour: "numeric", minute: "2-digit" });

/** "in 12 minutes" / "in about 2 hours" — a countdown reads as alive; a
 *  timestamp reads as a log entry. */
export function untilLabel(target: Date, from: Date = new Date()): string {
  const mins = Math.round((target.getTime() - from.getTime()) / 60000);
  if (mins <= 0) return "any moment";
  if (mins === 1) return "in a minute";
  if (mins < 60) return `in ${mins} minutes`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? "in about an hour" : `in about ${hrs} hours`;
}

/**
 * The schedule as the operator should see it.
 *
 * `stale` is deliberately generous — one slot late is a slow run or a cold
 * start, not a failure. Two consecutive misses is a real signal, and crying
 * wolf about the scheduler would cost exactly the trust this is meant to build.
 */
export function agentSchedule(lastRunAt: string | null, now: Date = new Date()): AgentScheduleInfo {
  const next = nextRunAfter(now);
  const due = lastDueRun(now);
  const last = lastRunAt ? new Date(lastRunAt) : null;

  const missedBy = last ? due.getTime() - last.getTime() : Infinity;
  const stale = !last || missedBy > 2 * 60 * 60 * 1000;

  return {
    cadence: `Every hour, ${fmtTime(new Date(Date.UTC(2000, 0, 1, AGENT_CRON.utcHours[0])))}–${fmtTime(
      new Date(Date.UTC(2000, 0, 1, AGENT_CRON.utcHours[AGENT_CRON.utcHours.length - 1])),
    )} Central`,
    nextRunAt: next.toISOString(),
    lastRunAt: last ? last.toISOString() : null,
    stale,
    staleReason: !stale
      ? null
      : !last
        ? "No agent has run yet on this instance."
        : `The last run was ${fmtTime(last)} — more than one scheduled slot has passed since. The scheduler may be stopped.`,
  };
}
