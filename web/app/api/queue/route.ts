import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { getQueue } from "@/lib/queue";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Queue (ACT): every waiting decision — the union of agent actItems and
// pending drafts, deduped by thread, red→yellow→recency. Approve/discard
// actions stay on the existing /api/approvals route (keyed by draftId).
export async function GET() {
  try {
    if (!DEMO) {
      return NextResponse.json(
        { error: "Live Queue extends the approvals tables — post-Phase-3 work." },
        { status: 501 },
      );
    }
    // actor: null until L0.1 threads the session email through
    void logAudit({ actor: null, action: "queue.read" });
    return NextResponse.json(getQueue());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
