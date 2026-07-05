import { NextRequest, NextResponse } from "next/server";
import { getQueue } from "@/lib/queue";
import { DEMO } from "@/lib/demo";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Queue (ACT): every waiting decision — the union of agent actItems and
// pending drafts, deduped by thread, red→yellow→recency. Approve/discard
// actions stay on the existing /api/approvals route (keyed by draftId).
// getQueue branches DEMO (fixtures) vs live (agent_runs ∪ app.drafts) itself.
export async function GET(req: NextRequest) {
  try {
    // actor: null until L0.1 threads the session email through
    void logAudit({ actor: null, action: "queue.read", req });
    // sendLive: the cage is armed — the UI shows the pulsing warning pill
    return NextResponse.json({ ...(await getQueue()), sendLive: !DEMO && process.env.SEND_ENABLED === "1" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
