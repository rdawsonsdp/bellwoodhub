import { NextRequest, NextResponse } from "next/server";
import { DEMO, demoSyncStatus } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Sync page's data feed (RD 2026-07-06): every mirror process — mail per
// account, the Voyage index, calendar — with progress, throughput, scheduler
// liveness, and the recent-run ledger. `?totals=0` skips the live mailbox-size
// asks (the page's 20s auto-refresh uses it; the full ask runs on load only).
export async function GET(req: NextRequest) {
  try {
    if (DEMO) {
      return NextResponse.json(demoSyncStatus());
    }
    const withTotals = req.nextUrl.searchParams.get("totals") !== "0";
    const { getSyncStatus } = await import("@/lib/sync-status");
    return NextResponse.json(await getSyncStatus(withTotals));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/sync/status]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
