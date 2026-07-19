/*
 * weights.ts — how triage prioritizes, in one legible object.
 *
 * These weights ARE "how I rank your mail." They must be readable by a
 * non-engineer, because for the mayor tenant the answer to "why did the AI put
 * this first" has to survive a FOIA request. No magic numbers scattered through
 * the scorer — every number that shapes the ranking lives here.
 *
 * Score = sum of the weights of the signals that fired. `rank` is descending
 * score within needs_reply. See lib/triage/signals.ts for what each signal
 * means and reason.ts for how they become the plain-English "why".
 */
export const TRIAGE_WEIGHTS = {
  /** A stated deadline within 48h. The escalation — a statutory FOIA clock or a
   *  hard date about to pass outranks everything else. */
  deadline_within_48h: 100,
  /** The message states a deadline further out than 48h. */
  explicit_deadline: 60,
  /** They've followed up — a second inbound with no reply from the exec, or
   *  "circling back" language. The single strongest "you're the holdup" signal. */
  repeat_followup: 50,
  /** From someone on the tenant's important-senders list. */
  important_sender: 30,
  /** Per day the inbound has sat unanswered. A tiebreaker, not a driver. */
  age_days_per_day: 2,
} as const;

/** Age contributes at most this much — old routine mail must never outrank a
 *  fresh deadline just by aging. */
export const AGE_SCORE_CAP = 20;

/** A deadline is an "escalation" (uses deadline_within_48h, not explicit_deadline)
 *  when it lands within this many hours of now. */
export const DEADLINE_ESCALATION_HOURS = 48;

export type SignalKey = keyof typeof TRIAGE_WEIGHTS;
