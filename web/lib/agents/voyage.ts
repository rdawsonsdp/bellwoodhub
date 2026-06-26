import { VOYAGE_MODEL, VOYAGE_DIM } from "./constants";

/**
 * Voyage embeddings (voyage-4-large @ 1024) via REST. The input_type asymmetry
 * matters: questions embed as "query", chunks as "document". The Python pipeline
 * embeds documents; the web planner embeds queries here.
 */
async function embedVoyage(text: string, inputType: "query" | "document"): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  const r = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      input: [text],
      model: VOYAGE_MODEL,
      input_type: inputType,
      output_dimension: VOYAGE_DIM,
    }),
  });
  if (!r.ok) {
    throw new Error(`Voyage embeddings failed: ${r.status} ${await r.text()}`);
  }
  const data = (await r.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

export const embedQuery = (text: string) => embedVoyage(text, "query");
export const embedDocument = (text: string) => embedVoyage(text, "document");
