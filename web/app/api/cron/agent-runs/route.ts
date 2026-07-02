import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { runAllAgents } from "@/lib/agent-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full cabinet pass makes several model calls

// The Phase-5 orchestrator: run every active domain agent — gather its slice,
// prompt with its open memory, validate against the constitution, write
// canonical.agent_runs + agent_memory. getWall() reads the latest runs.
// Gated exactly like cron/needs-you.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (DEMO) {
      // fixtures serve the Wall in demo mode — a run pass has nothing to do
      return NextResponse.json({ ok: true, mode: "demo", ran: 0, note: "DEMO mode: fixture runs serve the Wall; live runs require DATABASE_URL + ANTHROPIC_API_KEY." });
    }
    const results = await runAllAgents();
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ ok: failed.length === 0, ran: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/cron/agent-runs]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
