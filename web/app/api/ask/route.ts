import { NextRequest, NextResponse } from "next/server";
import { ask, type SearchOpts } from "@/lib/backend";
import { askAgent } from "@/lib/ask-agent";
import { DEMO, demoAsk } from "@/lib/demo";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cross-reference question (planner CROSS_INTENT) fans out to several
// retrieval passes before synthesis. Measured 47s on a WARM local server with a
// direct DB connection (RD 2026-07-30); production adds cold start, serverless
// overhead and pooler latency, so 60s was being exceeded and the function killed
// — the client then showed an empty result. Matches the agent routes at 300.
export const maxDuration = 300;

/** Questions that need the model to search, look, and search again rather than
 *  one retrieval pass: a completeness ask, a comparison, or an explicit table. */
function needsResearch(q: string): boolean {
  return /\b(break ?down|breakdown|itemi[sz]e|by month|per month|monthly|by quarter|each month|complete|comprehensive|every (invoice|charge|payment|receipt|email)|all (invoices|charges|payments|receipts)|total(l?ed)? (spend|cost|charges)|compare|comparison|in a table|as a table|cross[- ]?reference)\b/i.test(q);
}

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = clean(body.question);
    if (!question) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }
    // actor: null until L0.1 threads the session email through
    void logAudit({ actor: null, action: "ask.query", meta: { question }, req });
    if (DEMO) {
      const k = typeof body.k === "number" && Number.isFinite(body.k) ? body.k : 8;
      const uploads = Array.isArray(body.uploads) ? body.uploads : [];
      return NextResponse.json(await demoAsk(question, k, uploads));
    }
    const filters: SearchOpts = {
      person: clean(body.person),
      address: clean(body.address),
      since: clean(body.since),
      until: clean(body.until),
      topic: clean(body.topic),
      // Leave k UNSET unless the caller asked for one. The planner widens it for
      // a completeness question ("break down my Google spend by month"); pinning
      // 8 here silently capped those answers at 8 excerpts — the answer looked
      // like a model failure but the data was never retrieved (RD 2026-07-30).
      k: typeof body.k === "number" && Number.isFinite(body.k) ? body.k : undefined,
      noAuto: body.noAuto === true,
    };
    // AGENTIC ASK (RD 2026-07-30) — Claude drives retrieval itself: search,
    // read what came back, search again. Reproduces the Claude.ai answer to
    // "break down my Google spend by month" figure-for-figure ($542.61 total),
    // which the single-shot pipeline could not (eval/ask-agent.test.ts).
    // Measured ~270s / 167k input tokens on that question, so it is gated to
    // questions that actually need multi-step research; simple lookups keep the
    // fast pipeline. ASK_AGENT=0 disables it entirely.
    const agentOn = process.env.ASK_AGENT !== "0";
    if (agentOn && !filters.k && needsResearch(question)) {
      const r = await askAgent(question);
      return NextResponse.json({
        mode: "agent", question, answer: r.answer, sources: r.sources,
        crossSource: new Set(r.sources.map((s) => s.stream)).size >= 3,
        trace: r.trace, iterations: r.iterations,
      });
    }
    const result = await ask(question, filters);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/ask]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
