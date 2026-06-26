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
  const model = pickModel(opts.task ?? "synthesize");
  const r = await anthropic().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  });
  return r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
