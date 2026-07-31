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
  synthesize: { model: MODEL_SONNET, effort: "low",    thinking: "adaptive", maxTokens: 8192 },
  draft:      { model: MODEL_SONNET, effort: "medium", thinking: "adaptive", maxTokens: 8192 },
  // Gated behind eval evidence (AGENT_RUN_TASK=flagship).
  flagship:   { model: MODEL_OPUS,   effort: "high",   thinking: "adaptive", maxTokens: 16000 },
} as const satisfies Record<string, TaskProfile>;

export type Task = keyof typeof TASK_PROFILE;

export const profileOf = (task: Task): TaskProfile => TASK_PROFILE[task];

/** Back-compat: task → model id, for callers that only need the model name. */
export const TASK_MODEL = Object.fromEntries(
  Object.entries(TASK_PROFILE).map(([k, p]) => [k, p.model]),
) as Record<Task, string>;
