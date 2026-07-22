import Anthropic from "@anthropic-ai/sdk";
import { TASK_MODEL, type Task } from "./constants";

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
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
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
 *  text — the agent runner records it as run diagnostics (019). */
export async function completeMeta(opts: CompleteOpts): Promise<CompletionMeta> {
  const model = pickModel(opts.task ?? "synthesize");
  const r = await anthropic().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  });
  const text = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text, model: r.model ?? model, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 };
}
