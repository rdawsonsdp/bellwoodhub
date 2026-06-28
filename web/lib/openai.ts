import OpenAI from "openai";

let _client: OpenAI | null = null;

export function openai(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

export const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
export const ANSWER_MODEL = process.env.ANSWER_MODEL || "gpt-4o-mini";

/** Embed a single string with text-embedding-3-small (1536 dims). */
export async function embed(text: string): Promise<number[]> {
  const r = await openai().embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });
  return r.data[0].embedding as number[];
}

/** One-shot grounded completion. */
export async function chat(system: string, user: string, opts?: { temperature?: number }): Promise<string> {
  const r = await openai().chat.completions.create({
    model: ANSWER_MODEL,
    temperature: opts?.temperature ?? 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return r.choices[0]?.message?.content?.trim() || "";
}
