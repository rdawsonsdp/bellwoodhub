/*
 * soft-signals.ts — the ONE model call in triage, and it returns FLAGS, not an
 * opinion. Haiku (cheap), structured output: a deadline date if the message
 * states one, and whether the message is purely informational.
 *
 * House rule the spec is emphatic about: the model never ranks or judges
 * importance. It reads two facts a regex can't reliably read — "is there a
 * deadline, and what date" and "is this a newsletter/receipt/notice" — and the
 * deterministic scorer (signals.ts) does everything else.
 *
 * Batched: one call classifies up to BATCH messages, so a full pass is a
 * handful of calls, not thousands. Fails soft — a model outage degrades every
 * item to {no deadline, not informational}, so nothing is wrongly dropped from
 * needs_reply.
 */
import { complete } from "../agents/claude";
import type { SoftSignals } from "./signals";

export const SOFT_BATCH = 20;

interface SoftInput {
  id: string;
  subject: string | null;
  from: string | null;
  snippet: string; // first ~400 chars of clean body
}

const SYSTEM = `You extract two facts from emails so an assistant can decide what genuinely
needs its boss's reply. You do NOT judge importance or rank — only these two
facts, per message. The hard part is telling a real person waiting on a reply
from mass mail that only looks urgent. Be strict.

1. informational: TRUE if this is mass, promotional, transactional, or
   cold-outreach mail where no real ongoing correspondence is waiting on THIS
   reader. Includes: newsletters, digests, receipts, shipping/order updates,
   marketing and sales blasts ("last chance", "sale ends", "$X off",
   "ICYMI"), webinar and event invites, product announcements, and unsolicited
   cold outreach from recruiters/vendors the reader has no relationship with —
   even when it says "urgent" or asks you to reply/apply/book.
   FALSE only when a specific human is actually waiting on a reply from this
   reader: a real back-and-forth thread, a direct question or request from a
   named correspondent, a constituent or customer with an issue. When unsure
   whether real correspondence exists, lean TRUE (informational).

2. deadline: return an ISO date (YYYY-MM-DD) ONLY for a deadline the READER is
   genuinely obligated to meet — a statutory clock (FOIA response due), an RSVP
   the reader agreed to, "I need your answer by Friday" from a real
   correspondent. A marketing deadline is NOT the reader's deadline: "sale ends
   Sunday", "last day to save", "offer expires", "webinar is Tuesday",
   "trial ends" all return null. If in doubt, null. Never invent a date.

Return ONLY a JSON array, one object per input, same order:
[{"id": string, "deadline": "YYYY-MM-DD"|null, "informational": boolean}]`;

/** Classify a batch. Today is passed in so "Friday"-style relative dates resolve
 *  deterministically at the call site if ever needed; the model is told to
 *  return only concrete dates. */
export async function softSignalsBatch(
  items: SoftInput[],
  todayISO: string,
): Promise<Map<string, SoftSignals>> {
  const out = new Map<string, SoftSignals>();
  // default-safe: everything degrades to "no deadline, not informational".
  for (const it of items) out.set(it.id, { explicitDeadline: null, informationalOnly: false });
  if (!items.length) return out;

  const user =
    `Today is ${todayISO}.\n\nMessages:\n` +
    items
      .map((it) => `id ${it.id} · from ${it.from ?? "?"} · "${it.subject ?? "(no subject)"}"\n${it.snippet}`)
      .join("\n\n");

  try {
    const raw = await complete({ task: "classify", system: SYSTEM, user, maxTokens: 1200 });
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")) as {
      id: string;
      deadline: string | null;
      informational: boolean;
    }[];
    for (const r of parsed) {
      if (!out.has(r.id)) continue;
      out.set(r.id, {
        explicitDeadline: typeof r.deadline === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.deadline) ? r.deadline : null,
        informationalOnly: r.informational === true,
      });
    }
  } catch {
    // keep the default-safe map — a bad batch must not wrongly bucket mail.
  }
  return out;
}
