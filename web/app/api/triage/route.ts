import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/triage — the read path for the Needs You screen. Precomputed rows
// with corrections applied at read time (never re-runs the pass).
export async function GET() {
  try {
    if (DEMO) {
      const { DEMO_TRIAGE } = await import("@/lib/triage/demo");
      return NextResponse.json(DEMO_TRIAGE);
    }
    const { readTriage } = await import("@/lib/triage/read");
    return NextResponse.json(await readTriage());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
