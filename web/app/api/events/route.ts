import { NextResponse } from "next/server";
import { DEMO, demoEvents } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Events — actionable items derived from the seed corpus (demo). Each links to
// its source email.
export async function GET() {
  try {
    if (!DEMO) {
      // Live commitments/events land post-ingestion (commitment extraction over
      // real mail, GO_LIVE_PLAN L1.3+). Until then: honest empty, never fixtures.
      return NextResponse.json({ events: [], stats: { open: 0, late: 0, done: 0 } });
    }
    return NextResponse.json(demoEvents());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
