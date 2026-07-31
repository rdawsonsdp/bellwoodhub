import Anthropic from "@anthropic-ai/sdk";
import { profileForModel, profileOf, TASK_MODEL, type Task } from "./constants";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export function pickModel(task: Task): string {
  return TASK_MODEL[task];
}

export interface CompleteOpts {
  task?: Task;
  /** the model the user picked in the app; falls back to the task default */
  modelId?: string | null;
  system: string;
  user: string;
  /** override the task profile's budget; the profile supplies the default */
  maxTokens?: number;
}

/**
 * One grounded completion through the router. The system prompt is sent as a
 * cached block (cache_control: ephemeral) so the stable chief-of-staff
 * instructions + tool context are billed at ~10% on the 2nd+ call; the variable
 * retrieved set rides in the user turn. Returns the concatenated text.
 */
export async function complete(opts: CompleteOpts): Promise<string> {
  return (await completeMeta(opts)).text;
}

export interface CompletionMeta {
  text: string;
  model: string;
  /** token usage as billed — part of the run's "show the work" record */
  inputTokens: number;
  outputTokens: number;
}

/** Same call as complete(), but returns the execution metadata alongside the
 *  text — the agent runner records it as run diagnostics (019).
 *
 *  Model-specific knobs come from the task profile in constants.ts, never from
 *  here, so a model generation change is a table edit (RD 2026-07-30). Fields
 *  the profile omits are omitted from the request — that matters: Haiku 4.5
 *  400s on output_config.effort, and Opus 5 400s on xhigh effort with thinking
 *  disabled. */
export async function completeMeta(opts: CompleteOpts): Promise<CompletionMeta> {
  const task = opts.task ?? "synthesize";
  const p = opts.modelId ? profileForModel(task, opts.modelId) : profileOf(task);
  const r = await anthropic().messages.create({
    model: p.model,
    max_tokens: opts.maxTokens ?? p.maxTokens,
    thinking: p.thinking === "adaptive" ? { type: "adaptive" } : { type: "disabled" },
    ...(p.effort ? { output_config: { effort: p.effort } } : {}),
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  });
  // Thinking blocks are skipped — callers parse the answer, and on the 5-series
  // the raw chain of thought is never returned anyway.
  const text = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text, model: r.model ?? p.model, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 };
}
