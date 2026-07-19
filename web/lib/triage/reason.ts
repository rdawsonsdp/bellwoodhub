/*
 * reason.ts — the plain-English "why", TEMPLATED from fired signals.
 *
 * THE DEFENSIBILITY GUARANTEE: no model writes this. Each fired signal maps to a
 * phrase fragment; the reason is the top 1–2 fragments composed. That is how
 * "why did the AI rank this first" survives a FOIA request — the answer is a
 * fixed sentence built from named rules, not generated prose.
 *
 * Every needs_reply item has ≥1 fired signal, so the reason is never blank; if
 * only awaiting_your_reply fired, it's "Waiting on your reply."
 */
import type { TriageResult } from "./signals";

/** Priority order for which signals lead the sentence — strongest first. */
const ORDER = [
  "deadline_within_48h",
  "explicit_deadline",
  "repeat_followup",
  "important_sender",
  "age_days",
] as const;

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
};

/** One fragment per signal. Kept short — the sentence is 1–2 of these joined. */
function fragment(key: string, signals: Record<string, unknown>): string | null {
  switch (key) {
    case "deadline_within_48h":
      return `deadline ${fmtDate(String(signals.deadline_within_48h))}`;
    case "explicit_deadline":
      return `states a deadline of ${fmtDate(String(signals.explicit_deadline))}`;
    case "repeat_followup":
      // If it's a count, say it; if it's language, say "followed up".
      return String(signals.repeat_followup).includes("messages")
        ? "they've followed up more than once"
        : "they've followed up";
    case "important_sender":
      return `${signals.important_sender} is waiting on you`;
    case "age_days": {
      const d = Number(signals.age_days);
      return d >= 1 ? `no reply in ${d} day${d === 1 ? "" : "s"}` : null;
    }
    default:
      return null;
  }
}

/** Compose the reason from the top 1–2 fired signals. */
export function buildReason(result: TriageResult): string {
  if (result.bucket !== "needs_reply") return "";
  const fired = ORDER.filter((k) => k in result.signals);
  const frags = fired.map((k) => fragment(k, result.signals)).filter((f): f is string => !!f);

  if (frags.length === 0) return "Waiting on your reply.";

  // Lead with the strongest; add one supporting fragment if it's distinct.
  const lead = frags[0];
  const support = frags[1];

  // Capitalize the lead; the sentence reads "X; Y." or just "X."
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (support && support !== lead) {
    return `${cap(lead)}; ${support}.`;
  }
  return `${cap(lead)}.`;
}
