// Model lineup for the AI Chief of Staff (verified against the live API
// 2026-07-30). 70/20/10 Haiku/Sonnet/Opus blended — Opus is gated behind eval
// evidence.
export const MODEL_HAIKU = process.env.HAIKU_MODEL || "claude-haiku-4-5";
export const MODEL_SONNET = process.env.SONNET_MODEL || "claude-sonnet-5";
export const MODEL_OPUS = process.env.OPUS_MODEL || "claude-opus-5";

// Voyage embeddings — voyage-4-large @ 1024 (parameterized in ONE place).
// Its OWN env vars so it never collides with the poc OpenAI EMBED_MODEL path.
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-4-large";
export const VOYAGE_DIM = Number(process.env.VOYAGE_DIM || 1024);

/* ── task profiles ──────────────────────────────────────────────────────────
   Every per-model knob lives HERE, not in the call site, so moving to a new
   model generation is a table edit rather than a code change (RD 2026-07-30).
   completeMeta() reads a profile and sends only the fields it carries.

   Verified against the live API — do not "tidy" these into uniformity:
     • Haiku 4.5 REJECTS output_config.effort ("This model does not support the
       effort parameter"), so cheap tasks omit `effort` entirely.
     • Opus 5 / Sonnet 5 reject temperature/top_p/top_k outright.
     • Opus 5 rejects effort xhigh|max combined with thinking:"disabled".
     • Thinking shares the max_tokens budget with the answer, so any profile
       with thinking:"adaptive" carries real headroom — a tight cap truncates
       the structured digest validateRunOutput() parses.
   ────────────────────────────────────────────────────────────────────────── */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ThinkingMode = "adaptive" | "disabled";

export interface TaskProfile {
  model: string;
  /** output_config.effort — omitted on models that reject it (Haiku 4.5). */
  effort?: Effort;
  thinking: ThinkingMode;
  /** covers thinking + answer together */
  maxTokens: number;
}

export const TASK_PROFILE = {
  // Cheap, structured, high-volume work — Haiku, no thinking, no effort knob.
  classify:   { model: MODEL_HAIKU,  thinking: "disabled", maxTokens: 1024 },
  resolve:    { model: MODEL_HAIKU,  thinking: "disabled", maxTokens: 1024 },
  topic:      { model: MODEL_HAIKU,  thinking: "disabled", maxTokens: 1024 },
  triage:     { model: MODEL_HAIKU,  thinking: "disabled", maxTokens: 1024 },
  summarize:  { model: MODEL_HAIKU,  thinking: "disabled", maxTokens: 2048 },
  // Reasoning + drafting — Sonnet 5 with adaptive thinking at modest effort.
  // Ask synthesis and the agentic research loop. Raised to Opus 5 at xhigh
  // effort 2026-07-30: at Sonnet/low the answers were shallow on exactly the
  // multi-step questions the product is for ("break down my Google spend by
  // month"), and xhigh is the documented setting for agentic/tool-using work.
  synthesize: { model: MODEL_OPUS,   effort: "xhigh",  thinking: "adaptive", maxTokens: 16000 },
  draft:      { model: MODEL_SONNET, effort: "medium", thinking: "adaptive", maxTokens: 8192 },
  // The Ask agent's tool loop — many turns, so it needs real headroom.
  research:   { model: MODEL_OPUS,   effort: "xhigh",  thinking: "adaptive", maxTokens: 32000 },
  // Gated behind eval evidence (AGENT_RUN_TASK=flagship).
  flagship:   { model: MODEL_OPUS,   effort: "high",   thinking: "adaptive", maxTokens: 16000 },
} as const satisfies Record<string, TaskProfile>;

export type Task = keyof typeof TASK_PROFILE;

export const profileOf = (task: Task): TaskProfile => TASK_PROFILE[task];

/** Back-compat: task → model id, for callers that only need the model name. */
export const TASK_MODEL = Object.fromEntries(
  Object.entries(TASK_PROFILE).map(([k, p]) => [k, p.model]),
) as Record<Task, string>;


/* ── model tiers — what the USER picks in the app (RD 2026-07-31) ────────────
   One choice shifts the whole router rather than making anyone reason about
   per-task routing. Opus 5 is the default because the agentic Ask needs it: at
   Sonnet/low the "break down my Google spend by month" answer was shallow, and
   at Opus 5/xhigh it reproduced the Claude.ai figures exactly.

   Prices are USD per 1M tokens, verified 2026-07-31 — the old Admin console had
   Opus at $15/$75, which was never Opus 5's rate. */
export interface ModelTier {
  id: string;
  label: string;
  blurb: string;
  /** the model each non-Haiku task routes to under this tier */
  reasoning: string;
  inPer1M: number;
  outPer1M: number;
}

export const MODEL_TIERS: ModelTier[] = [
  { id: "opus-5",   label: "Opus 5",   blurb: "Most capable — best for research and multi-step questions", reasoning: MODEL_OPUS,   inPer1M: 5, outPer1M: 25 },
  { id: "sonnet-5", label: "Sonnet 5", blurb: "Faster and cheaper, near-Opus on most work",                reasoning: MODEL_SONNET, inPer1M: 3, outPer1M: 15 },
  { id: "haiku-4.5",label: "Haiku 4.5",blurb: "Fastest and cheapest — simple lookups only",                reasoning: MODEL_HAIKU,  inPer1M: 1, outPer1M: 5 },
];

export const DEFAULT_TIER = "opus-5";
export const tierById = (id: string | null | undefined): ModelTier =>
  MODEL_TIERS.find((t) => t.id === id) ?? MODEL_TIERS[0];

/** Apply the user's tier to a task profile. Cheap Haiku tasks stay on Haiku at
 *  every tier — routing classification to Opus would burn money for no gain —
 *  so a tier only moves the reasoning work. Haiku rejects `effort`, so the knob
 *  is dropped when a tier lands a task there. */
export function profileForTier(task: Task, tierId?: string | null): TaskProfile {
  const base = TASK_PROFILE[task];
  if (base.model === MODEL_HAIKU) return base;
  const tier = tierById(tierId);
  if (tier.reasoning === base.model) return base;
  const next: TaskProfile = { ...base, model: tier.reasoning };
  if (tier.reasoning === MODEL_HAIKU) { delete next.effort; next.thinking = "disabled"; }
  return next;
}
