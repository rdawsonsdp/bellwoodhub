/*
 * agent-instruction.ts — one box.
 *
 * Configuring an agent used to mean four fields (charter, goals, urgency rules,
 * focus) and knowing which text belonged in which. That is a taxonomy to learn,
 * and nobody prompting Claude learns one. RD 2026-07-18: "I think you should be
 * able to prompt the agent like you would prompt Claude normally."
 *
 * So: one instruction, written the way you'd tell a person. It does two jobs
 * that pull in opposite directions —
 *
 *   INSTRUCTING wants detail. "Watch for red-light citations. Tell me daily how
 *   many and where, flag repeat locations, and draft a reply if a resident
 *   complains." Every clause earns its place in the prompt.
 *
 *   RETRIEVING wants a short, concrete phrase. Embedding that whole paragraph
 *   as a query vector averages "citations" with "daily", "draft" and "resident"
 *   until it points at nothing — an essay embeds to mush. Measured on a live
 *   mailbox: concrete nouns retrieved precisely, abstract intent returned
 *   marketing copy.
 *
 * Rather than make the user maintain two fields, we DERIVE the retrieval query
 * from the instruction with one cheap Haiku call, cache it beside the text, and
 * SHOW it in the preview. Derivation is invisible until it's wrong, and then
 * it's inspectable — the operator sees exactly what is being searched for and
 * can override it in Advanced.
 *
 * The cache key is the instruction itself: same text, no model call.
 */
import { complete } from "./agents/claude";

/** Shape stored in app.agent_configs.overrides. Every field optional — an
 *  untouched agent has no row at all and runs on its registry defaults. */
export interface AgentOverrides {
  /** The one box. Plain English, the way you'd brief a person. */
  instruction?: string;
  /** Derived from `instruction` — what we actually embed. Cached; regenerated
   *  only when the instruction text changes. */
  focusQuery?: string;
  /** The instruction text this focusQuery was derived from, so a stale cache
   *  is detectable without hashing. */
  focusQueryFor?: string;
  // ── Advanced (optional, unchanged) ──
  charter?: string;
  goals?: string[];
  urgencyRules?: string;
  /** Explicit override for the derived query. Set = we never derive. */
  focus?: string;
}

const DERIVE_SYSTEM = `You turn an instruction given to an assistant into a SEARCH QUERY for a
semantic index of someone's email archive.

Return ONLY the query text. No quotes, no explanation, no prefix.

Rules:
- Name the THING to find, not the task around it. "Summarize red-light tickets
  daily and flag repeats" → "red light camera citations and traffic tickets".
- Use the words the mail itself would use, not the user's shorthand.
- Concrete nouns retrieve; abstract intent does not. If the instruction is
  purely abstract ("anything important", "things I should know"), return the
  single word NONE — a query that matches everything matches nothing.
- Keep it under 12 words.
- Drop cadence, formatting, and action verbs (daily, summarize, draft, flag,
  tell me) — those instruct the agent, they do not find records.`;

/** Sentinel meaning "this instruction has nothing searchable in it". */
export const NO_QUERY = "NONE";

/**
 * Derive the retrieval query for an instruction.
 *
 * Returns null when the instruction is too abstract to search for — the agent
 * then runs on its time window alone, which is the honest outcome. Failing soft
 * matters here: a Haiku outage must degrade the agent, not break saving.
 */
export async function deriveFocusQuery(instruction: string): Promise<string | null> {
  const text = instruction.trim();
  if (!text) return null;
  try {
    const raw = await complete({
      task: "classify", // Haiku — cheap, and this is a rewrite, not judgment
      system: DERIVE_SYSTEM,
      user: text.slice(0, 2000),
      maxTokens: 40,
    });
    const q = raw.trim().replace(/^["'`]|["'`]$/g, "").split("\n")[0].trim();
    if (!q || q.toUpperCase() === NO_QUERY) return null;
    return q.slice(0, 200);
  } catch {
    return null;
  }
}

/** The query to embed for this agent: explicit override, else the cached
 *  derivation, else nothing. Never derives inline — the runner must not make a
 *  model call just to read config. */
export function effectiveFocusQuery(ov: AgentOverrides | null | undefined): string | null {
  if (!ov) return null;
  if (typeof ov.focus === "string" && ov.focus.trim()) return ov.focus.trim();
  const cachedFor = ov.focusQueryFor?.trim();
  const current = ov.instruction?.trim();
  // A stale cache (instruction edited without re-deriving) is ignored rather
  // than used: searching for the previous instruction is worse than not searching.
  if (cachedFor && current && cachedFor !== current) return null;
  return typeof ov.focusQuery === "string" && ov.focusQuery.trim() ? ov.focusQuery.trim() : null;
}
