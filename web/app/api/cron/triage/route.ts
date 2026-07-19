import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full pass makes several batched Haiku calls

// The triage pass — a SIBLING of the agent runner, not one of its agents. Reads
// structured thread facts + batched soft signals, buckets and ranks all recent
// mail, upserts one current row per thread. Runs pre-dawn (fresh before the
// morning check) and hourly. Gated by CRON_SECRET like the other cron routes.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (DEMO) {
      return NextResponse.json({ ok: true, mode: "demo", note: "DEMO: fixture triage serves the Needs You screen." });
    }
    const { runTriage } = await import("@/lib/triage/run");
    const result = await runTriage();
    void logAudit({ actor: null, action: "triage.run.cron", meta: { ...result } });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/cron/triage]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
