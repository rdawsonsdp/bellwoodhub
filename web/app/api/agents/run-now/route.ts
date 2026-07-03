import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { runAllAgents } from "@/lib/agent-runner";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full cabinet pass makes several model calls

// The in-app agent trigger (RD 2026-07-03: agents are managed in the app,
// not in Claude Code). Session-gated like /api/sync — on the pilot, where
// crons don't fire and the model key is sensitive-scoped to the deployment,
// this button IS how a human runs the cabinet. Same runner as the cron:
// one code path, constitution-validated, fully ledgered.
export async function POST(req: NextRequest) {
  try {
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (DEMO) {
      return NextResponse.json({ ok: true, mode: "demo", ran: 0, note: "Demo mode — fixture runs serve the Wall." });
    }
    const results = await runAllAgents();
    const failed = results.filter((r) => !r.ok);
    await logAudit({
      actor: session?.user?.email ?? null,
      action: "agents.run.manual",
      meta: { ran: results.length, failed: failed.length, results },
      req,
    });
    return NextResponse.json({ ok: failed.length === 0, ran: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/agents/run-now]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
