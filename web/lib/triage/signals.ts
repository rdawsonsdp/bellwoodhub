/*
 * signals.ts — deterministic bucketing + signal computation. PURE functions;
 * no DB, no model. The DB layer (lib/triage/run.ts) feeds these thread facts and
 * the soft-signal flags, and gets back a bucket, score, fired signals, and the
 * inputs the reason template needs.
 *
 * Everything explainable lives here. The one model call (soft-signals.ts) only
 * supplies `explicit_deadline` and the fyi disambiguation flag — never an
 * importance opinion.
 */
import { TRIAGE_WEIGHTS, AGE_SCORE_CAP, DEADLINE_ESCALATION_HOURS } from "./weights";
import { matchImportant, type ImportantSender } from "./senders";

export type Bucket = "needs_reply" | "awaiting_others" | "fyi";
export type Direction = "inbound" | "outbound" | "internal";

/** One thread, reduced to its latest message + the facts triage needs. */
export interface ThreadFacts {
  messageId: string;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  /** direction of the LATEST message in the thread */
  direction: Direction;
  sentAt: string; // ISO of the latest message
  /** count of inbound messages in this thread with no exec reply since the last
   *  inbound — the repeat-followup detector. 1 = first ask, ≥2 = followed up. */
  inboundStreak: number;
  /** the latest message's body text (already cleaned), for language cues */
  bodyText: string | null;
}

/** Flags the one Haiku call returns. Never an opinion — dates and a boolean. */
export interface SoftSignals {
  /** ISO date string if the message states a deadline, else null */
  explicitDeadline: string | null;
  /** true if the message is purely informational (newsletter/receipt/notice) */
  informationalOnly: boolean;
}

/** Sender patterns that are FYI without needing a model — cheap first pass. */
const FYI_SENDER = /(no-?reply|do-?not-?reply|notifications?|newsletter|mailer|updates?@|noreply@|automated|postmaster|bounce|marketing@|substack\.com|mailchimp|sendgrid|@mail\.|@email\.|@e\.|@em\.|@news\.|@marketing\.|@info\.|@go\.|@try\.|@get\.|hello@|team@|demand@)/i;
/** "circling back" style follow-up language in the body. */
const FOLLOWUP_LANG = /(follow(ing)?[ -]?up|circl(e|ing) back|checking in|second (time|email|request)|as a reminder|just a reminder|any update|gentle (nudge|reminder)|bumping this)/i;

export interface TriageResult {
  bucket: Bucket;
  score: number;
  /** which named signals fired, with detail — stored as jsonb */
  signals: Record<string, unknown>;
  /** the important-sender label if one matched, for the reason template */
  importantLabel: string | null;
}

/**
 * Classify one thread. `now` is injected so the pass is deterministic/testable.
 */
export function classifyThread(
  t: ThreadFacts,
  soft: SoftSignals,
  importantList: ImportantSender[],
  now: Date = new Date(),
): TriageResult {
  const senderIsFyi = FYI_SENDER.test(t.fromEmail ?? "");

  // ── bucketing ──
  // fyi first: automated sender, or the model says purely informational.
  if (senderIsFyi || soft.informationalOnly) {
    return { bucket: "fyi", score: 0, signals: { fyi_sender: senderIsFyi, informational_only: soft.informationalOnly }, importantLabel: null };
  }
  // last message from the exec → they're waiting on someone else.
  if (t.direction === "outbound") {
    return { bucket: "awaiting_others", score: 0, signals: { awaiting_others: true }, importantLabel: null };
  }
  // internal (exec cc'd on staff mail, no direct ask) → fyi.
  if (t.direction === "internal") {
    return { bucket: "fyi", score: 0, signals: { internal_cc: true }, importantLabel: null };
  }

  // ── needs_reply: the last message is inbound. Score the signals. ──
  const signals: Record<string, unknown> = { awaiting_your_reply: true };
  let score = 0;

  // deadline (soft signal). within 48h escalates.
  if (soft.explicitDeadline) {
    const due = new Date(soft.explicitDeadline);
    const hoursOut = (due.getTime() - now.getTime()) / 3_600_000;
    if (!Number.isNaN(hoursOut) && hoursOut <= DEADLINE_ESCALATION_HOURS) {
      signals.deadline_within_48h = soft.explicitDeadline;
      score += TRIAGE_WEIGHTS.deadline_within_48h;
    } else {
      signals.explicit_deadline = soft.explicitDeadline;
      score += TRIAGE_WEIGHTS.explicit_deadline;
    }
  }

  // repeat follow-up: ≥2 inbound with no reply since, OR follow-up language.
  const hasFollowupLang = FOLLOWUP_LANG.test(t.bodyText ?? "") || FOLLOWUP_LANG.test(t.subject ?? "");
  if (t.inboundStreak >= 2 || hasFollowupLang) {
    signals.repeat_followup = t.inboundStreak >= 2 ? `${t.inboundStreak} messages, no reply` : "follow-up language";
    score += TRIAGE_WEIGHTS.repeat_followup;
  }

  // important sender.
  const imp = matchImportant(t.fromEmail, importantList);
  if (imp) {
    signals.important_sender = imp.label;
    score += TRIAGE_WEIGHTS.important_sender;
  }

  // age — tiebreaker, capped.
  const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(t.sentAt).getTime()) / 86_400_000));
  if (ageDays > 0) {
    const ageScore = Math.min(AGE_SCORE_CAP, ageDays * TRIAGE_WEIGHTS.age_days_per_day);
    signals.age_days = ageDays;
    score += ageScore;
  }

  return { bucket: "needs_reply", score, signals, importantLabel: imp?.label ?? null };
}
