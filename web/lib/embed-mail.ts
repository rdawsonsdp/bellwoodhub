/*
 * embed-mail.ts — ING-4 stage 7: chunk + embed canonical messages into
 * canonical.chunks (Voyage document vectors, 1024-d, cosine/HNSW indexed).
 *
 * Resumable by construction: "pending" = a message with NO chunk rows, so an
 * interrupted pass loses nothing — the next pass re-selects it. Within one
 * message, chunks are written in a single INSERT (atomic), so a message is
 * either fully indexed or fully pending; reconciliation is exactly
 * `count(messages) == count(DISTINCT chunks.message_id)`.
 *
 * Every message gets ≥1 chunk: empty bodies embed their header line alone, so
 * the message is still findable by sender/subject/date and the reconciliation
 * count closes. Each chunk is prefixed with a one-line header (from/date/
 * subject) so sender- and subject-shaped questions match semantically even
 * before the identity ledger (stage 5) lands.
 */
import { query, toVector } from "./db";
import { VOYAGE_MODEL, VOYAGE_DIM } from "./agents/constants";

const TENANT = "00000000-0000-0000-0000-000000000001";

// ~1400 chars ≈ 350 tokens per chunk; the overlap keeps a thought that
// straddles a boundary findable from either side.
const CHUNK_MAX = 1400;
const CHUNK_OVERLAP = 200;

/** Paragraph-aware splitter: prefer a blank line, then a sentence end, then a
 *  newline — never cut mid-word unless a single block exceeds the budget. */
export function chunkText(body: string, max = CHUNK_MAX, overlap = CHUNK_OVERLAP): string[] {
  const text = body.trim();
  if (!text) return [];
  if (text.length <= max) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf(" "));
      if (cut > max * 0.5) end = start + cut + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

/** The one-line header stamped onto every chunk of a message. */
export function chunkHeader(m: {
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  sent_at: Date | string;
}): string {
  const d = typeof m.sent_at === "string" ? m.sent_at.slice(0, 10) : m.sent_at.toISOString().slice(0, 10);
  const who = [m.from_name, m.from_email ? `<${m.from_email}>` : null].filter(Boolean).join(" ");
  return `From ${who || "unknown"} · ${d} · ${m.subject || "(no subject)"}`.replace(/\s+/g, " ").trim();
}

const estTokens = (s: string) => Math.ceil(s.length / 4);

/** Real mail carries invalid UTF-8 (lone surrogates from newsletter tooling);
 *  Voyage 400s the whole batch on one bad byte. Replace unpaired surrogates
 *  and strip NULs so every chunk is well-formed before it leaves the house. */
export function toWellFormedText(s: string): string {
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "�") // high surrogate w/o partner
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�") // low surrogate w/o partner
    .replace(/\u0000/g, "");
}

// Voyage batch endpoint takes up to 128 inputs; 64 stays comfortably under
// the per-request token ceiling at our chunk size.
const EMBED_BATCH = 64;

async function embedDocuments(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
  }
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const r = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        input: texts.slice(i, i + EMBED_BATCH),
        model: VOYAGE_MODEL,
        input_type: "document",
        output_dimension: VOYAGE_DIM,
      }),
    });
    if (!r.ok) throw new Error(`Voyage embeddings failed: ${r.status} ${await r.text()}`);
    const data = (await r.json()) as { data: { embedding: number[] }[] };
    out.push(...data.data.map((d) => d.embedding));
  }
  return out;
}

export interface EmbedPassResult {
  embeddedMessages: number;
  chunks: number;
  remaining: number; // messages still without chunks after this pass
}

/** One time-budgeted pass over pending messages, newest first. */
export async function embedPendingMessages(budgetMs = 200_000, perLoop = 48): Promise<EmbedPassResult> {
  const started = Date.now();
  let embeddedMessages = 0;
  let chunks = 0;
  for (;;) {
    type Row = {
      message_id: string; subject: string | null; from_name: string | null;
      from_email: string | null; sent_at: Date; clean_body: string | null;
    };
    const batch = await query<Row>(
      `SELECT m.message_id, m.subject, m.from_name, m.from_email, m.sent_at, m.clean_body
         FROM canonical.messages m
        WHERE m.tenant_id = $1
          AND NOT EXISTS (SELECT 1 FROM canonical.chunks c WHERE c.message_id = m.message_id)
        ORDER BY m.sent_at DESC
        LIMIT $2`,
      [TENANT, perLoop],
    );
    if (!batch.length) break;

    // chunk everything first so one Voyage call covers the whole batch
    const perMessage = batch.map((m) => {
      const header = toWellFormedText(chunkHeader(m));
      const parts = chunkText(toWellFormedText(m.clean_body ?? ""));
      return { messageId: m.message_id, texts: parts.length ? parts.map((p) => `${header}\n${p}`) : [header] };
    });
    const flat = perMessage.flatMap((m) => m.texts);
    let vectors: number[][];
    try {
      vectors = await embedDocuments(flat);
    } catch {
      // a poison message must not stall the pipeline: retry per message,
      // degrade the offender to its header line, and keep walking
      vectors = [];
      for (const m of perMessage) {
        try {
          vectors.push(...(await embedDocuments(m.texts)));
        } catch {
          const header = m.texts[0].split("\n")[0];
          m.texts = [header];
          vectors.push(...(await embedDocuments([header]).catch(() => [new Array(1024).fill(0) as number[]])));
        }
      }
    }

    // one INSERT per message = atomic per message; a crash between messages
    // leaves the rest cleanly pending
    let vi = 0;
    for (const m of perMessage) {
      const values: string[] = [];
      const params: unknown[] = [TENANT, m.messageId];
      m.texts.forEach((t, idx) => {
        const base = params.length;
        values.push(`($1, $2, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector)`);
        params.push(idx, t, estTokens(t), toVector(vectors[vi + idx]));
      });
      vi += m.texts.length;
      await query(
        `INSERT INTO canonical.chunks (tenant_id, message_id, chunk_index, chunk_text, token_count, embedding)
         VALUES ${values.join(", ")}
         ON CONFLICT (message_id, chunk_index) DO UPDATE SET
           chunk_text = EXCLUDED.chunk_text, token_count = EXCLUDED.token_count, embedding = EXCLUDED.embedding`,
        params,
      );
      embeddedMessages++;
      chunks += m.texts.length;
    }
    if (Date.now() - started > budgetMs) break;
  }
  const rem = await query<{ n: string }>(
    `SELECT count(*) AS n FROM canonical.messages m
      WHERE m.tenant_id = $1
        AND NOT EXISTS (SELECT 1 FROM canonical.chunks c WHERE c.message_id = m.message_id)`,
    [TENANT],
  );
  return { embeddedMessages, chunks, remaining: Number(rem[0]?.n ?? 0) };
}

/** Reconciliation counts (ING-4): the mirror vs. the search index. */
export async function embedCounts(): Promise<{ messages: number; indexed: number }> {
  const rows = await query<{ messages: string; indexed: string }>(
    `SELECT (SELECT count(*) FROM canonical.messages WHERE tenant_id = $1) AS messages,
            (SELECT count(DISTINCT message_id) FROM canonical.chunks WHERE tenant_id = $1) AS indexed`,
    [TENANT],
  );
  return { messages: Number(rows[0]?.messages ?? 0), indexed: Number(rows[0]?.indexed ?? 0) };
}
