/*
 * ask-agent.ts — Ask as an AGENT, not a one-shot RAG pipeline.
 *
 * WHY THIS EXISTS (RD 2026-07-30). Asked "break down my Google spend this year
 * by month", the pipeline answered "I have no Google spend records" while 19
 * Google billing emails sat indexed and searchable. The same question in the
 * Claude.ai client — same model — produced a correct month-by-month table,
 * because there Claude ran FOUR adaptive passes: it searched, noticed the
 * Workspace amounts were in PDFs, searched again for payment confirmations
 * carrying totals, then disambiguated Cloud vs Workspace vs Developer Program.
 *
 * The pipeline could not do that. It embeds the question once, retrieves once,
 * and hands the model a fixed set of excerpts — the model never gets to say
 * "wrong emails, search payments-noreply@google.com instead". Every attempt to
 * close the gap with intent heuristics (COMPLETENESS_INTENT, senderPass,
 * subjectPatterns) was hand-coding one search strategy at a time, and each fix
 * broke on the next question shape.
 *
 * So: give Claude the same tools the MCP server exposes and let it drive. The
 * tools are thin wrappers over lib/backend — one code path, so an answer here
 * and an answer in Claude Desktop come from the same place.
 *
 * WHAT DOES NOT CHANGE: retrieval is read-only, every claim still carries a [n]
 * citation resolved against real messages, and nothing sends. The loop widens
 * what the model can LOOK at, never what it can do.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { anthropic } from "./agents/claude";
import { profileForTier } from "./agents/constants";
import { getModelTierId } from "./model-preference";
import { searchSources, getEntity, getEmailByMessageId } from "./backend";
import { VOICE, HONESTY } from "./agents/voice";
import type { Source } from "./types";

/** Hard ceiling on tool calls. A broad question ("all my Google mail") can match
 *  1,000+ messages; without this the loop can wander and burn tokens. Exceeding
 *  it is not an error — the model is told to answer with what it has. */
const MAX_ITERATIONS = Number(process.env.ASK_AGENT_MAX_ITERATIONS || 8);

/** Per-search result ceiling. Measured: at k=40 over 11 iterations a single Ask
 *  cost 590s and ~500k input tokens — past the 300s function limit and far too
 *  slow for a UI. Tool results accumulate in context every turn, so capping the
 *  page size is the highest-leverage latency lever (RD 2026-07-30). */
const MAX_K = 25;

export interface AskAgentResult {
  answer: string;
  sources: Source[];
  /** show-the-work: what it searched for, in order */
  trace: { tool: string; input: string; got: number }[];
  iterations: number;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM = `${VOICE}

${HONESTY}

You are answering a question about the user's own email archive, and you have
tools to search it. You are not limited to one search — this is the whole point.

HOW TO WORK
- Search, read what came back, then search AGAIN with what you learned. A first
  search that returns the wrong kind of mail is information, not a dead end:
  narrow by sender, by subject wording, or by date and try again.
- When a question asks for a COMPLETE picture ("every invoice", "break it down
  by month", "total spend"), keep searching until you have covered the whole
  period. Check each month rather than assuming the first page was everything.
- Vendors send several kinds of mail. Billing lives under senders like
  payments-noreply@…, and receipts often carry the amount in the body while
  invoices only link to a PDF. If one search returns notifications or security
  alerts, search specifically for the payment/receipt wording instead.
- Open a promising message in full when the snippet is truncated mid-figure —
  the amount is often just past the cut.
- Stop when you can answer, or when further searching stops yielding anything
  new. Do not keep searching once you have what you need.
- Be economical: you have a limited number of searches, so make each one count.
  Prefer one well-targeted query over several near-identical ones, and do not
  re-search a sender you have already covered for the same period.

ANSWERING
- Put a [n] citation on every factual claim. The [n] is the source index the
  tools return — never invent one.
- Use a markdown table when comparing the same fields across several things
  (amounts by month, status by vendor). Cover every period in range: if a month
  has no record, show the row and say "no record" rather than dropping it, so a
  gap is visible instead of silent.
- If the archive genuinely lacks something, say so plainly and say what you DID
  find. Never pad an answer to look complete.
- If the request is ambiguous in a way that changes the answer, end with one
  specific question on its own line starting with "? ".`;

/** Answer a question by letting Claude drive retrieval. */
export async function askAgent(question: string): Promise<AskAgentResult> {
  // The tier the user picked in the Ask box — one place, so the agent and the
  // cron desks always run on the same model (RD 2026-07-31).
  const p = profileForTier("research", await getModelTierId());
  // Sources accumulate across every tool call and keep stable [n] indexes, so a
  // citation minted on turn 1 still resolves after turn 6.
  const seen = new Map<string, Source>();
  const trace: AskAgentResult["trace"] = [];

  const register = (rows: Source[]): Source[] => {
    const out: Source[] = [];
    for (const r of rows) {
      const existing = seen.get(r.messageId);
      if (existing) { out.push(existing); continue; }
      const withIndex = { ...r, index: seen.size + 1 };
      seen.set(r.messageId, withIndex);
      out.push(withIndex);
    }
    return out;
  };

  const render = (rows: Source[]) =>
    rows.length === 0
      ? "No matches."
      : rows.map((s) =>
          `[${s.index}] ${s.date.slice(0, 10)} · ${s.fromName ?? ""} <${s.fromEmail ?? ""}> · "${s.subject ?? "(no subject)"}"\n${s.snippet}`,
        ).join("\n\n");

  const searchTool = betaTool({
    name: "search_email",
    description:
      "Semantic search over the user's whole email archive. Returns numbered excerpts — cite them as [n]. " +
      "Call this repeatedly with different phrasings, senders or date ranges; that is the intended use.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in natural language. Include the sender or product name when you know it." },
        k: { type: "integer", description: "How many results (1-25). Use a larger k when you need complete coverage of a period." },
        since: { type: "string", description: "ISO date lower bound, e.g. 2026-01-01." },
        until: { type: "string", description: "ISO date upper bound, e.g. 2026-03-31." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: async ({ query, k, since, until }) => {
      // searchSources returns { sources, crossSource, applied } — not a bare array.
      const res = await searchSources(query, {
        k: Math.min(Math.max(k ?? 12, 1), MAX_K),
        since: since || undefined,
        until: until || undefined,
      });
      const indexed = register(res.sources);
      trace.push({ tool: "search_email", input: `${query}${since ? ` since ${since}` : ""}${until ? ` until ${until}` : ""}`, got: indexed.length });
      return render(indexed);
    },
  });

  const readTool = betaTool({
    name: "read_email",
    description:
      "Fetch one email IN FULL by its message id. Use when a snippet is cut off before the detail you need — " +
      "amounts and totals are often just past the truncation.",
    inputSchema: {
      type: "object",
      properties: { message_id: { type: "string", description: "The message id from a search result." } },
      required: ["message_id"],
      additionalProperties: false,
    },
    run: async ({ message_id }) => {
      const em = await getEmailByMessageId(message_id);
      trace.push({ tool: "read_email", input: message_id, got: em ? 1 : 0 });
      if (!em) return "Not found.";
      return `From: ${em.fromName ?? ""} <${em.fromEmail ?? ""}>\nDate: ${em.date.slice(0, 10)}\nSubject: ${em.subject ?? ""}\n\n${em.bodyClean}`;
    },
  });

  const historyTool = betaTool({
    name: "person_or_place_history",
    description: "The full timeline for one person or one address across every source, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["person", "address"] },
        value: { type: "string", description: "The person's name or the address." },
      },
      required: ["type", "value"],
      additionalProperties: false,
    },
    run: async ({ type, value }) => {
      const e = await getEntity(type as "person" | "address", value);
      trace.push({ tool: "person_or_place_history", input: `${type}:${value}`, got: e.messages.length });
      if (!e.messages.length) return `No records for ${type} "${value}".`;
      const rows = register(e.messages.map((m) => ({
        index: 0, messageId: m.messageId, subject: m.subject, fromName: m.fromName,
        fromEmail: m.fromEmail, date: m.date, snippet: m.snippet, stream: m.stream,
      }) as unknown as Source));
      return render(rows);
    },
  });

  const runner = anthropic().beta.messages.toolRunner({
    model: p.model,
    max_tokens: p.maxTokens,
    thinking: p.thinking === "adaptive" ? { type: "adaptive" } : { type: "disabled" },
    ...(p.effort ? { output_config: { effort: p.effort } } : {}),
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [searchTool, readTool, historyTool],
    messages: [{ role: "user", content: question }],
    max_iterations: MAX_ITERATIONS,
    // Streaming is REQUIRED at this max_tokens: the SDK refuses a non-streaming
    // request that could exceed 10 minutes, and a multi-turn research loop at
    // 32k output can. Each iteration yields a stream; finalMessage() resolves it.
    stream: true,
  } as Parameters<ReturnType<typeof anthropic>["beta"]["messages"]["toolRunner"]>[0]);

  let inputTokens = 0;
  let outputTokens = 0;
  let iterations = 0;
  let last: Anthropic.Beta.BetaMessage | null = null;

  for await (const stream of runner as AsyncIterable<{ finalMessage: () => Promise<Anthropic.Beta.BetaMessage> }>) {
    iterations++;
    last = await stream.finalMessage();
    inputTokens += last.usage?.input_tokens ?? 0;
    outputTokens += last.usage?.output_tokens ?? 0;
  }

  const answer = (last?.content ?? [])
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text).join("").trim();

  return {
    answer: answer || "I couldn't complete that search. Try narrowing the question.",
    // Newest-first, matching the pipeline's contract so the UI renders the same.
    sources: [...seen.values()].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    trace, iterations, inputTokens, outputTokens,
  };
}
