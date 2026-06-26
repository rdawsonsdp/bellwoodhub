// Model lineup for the AI Chief of Staff (verified June 2026). 70/20/10
// Haiku/Sonnet/Opus blended — Opus is gated behind eval evidence.
export const MODEL_HAIKU = process.env.HAIKU_MODEL || "claude-haiku-4-5";
export const MODEL_SONNET = process.env.SONNET_MODEL || "claude-sonnet-4-6";
export const MODEL_OPUS = process.env.OPUS_MODEL || "claude-opus-4-8";

// Voyage embeddings — voyage-4-large @ 1024 (parameterized in ONE place).
// Its OWN env vars so it never collides with the poc OpenAI EMBED_MODEL path.
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-4-large";
export const VOYAGE_DIM = Number(process.env.VOYAGE_DIM || 1024);

// Task → model routing. Haiku for cheap/structured work, Sonnet for reasoning &
// drafting, Opus only behind eval evidence.
export const TASK_MODEL = {
  classify: MODEL_HAIKU,
  resolve: MODEL_HAIKU,
  topic: MODEL_HAIKU,
  triage: MODEL_HAIKU,
  summarize: MODEL_HAIKU,
  synthesize: MODEL_SONNET,
  draft: MODEL_SONNET,
  flagship: MODEL_OPUS,
} as const;

export type Task = keyof typeof TASK_MODEL;
