import { NextResponse } from "next/server";
import { needsYouToday } from "@/lib/capabilities";
import { DEMO, demoBrief } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Open read-only digest for the Brief screen (the cron variant is at
// /api/cron/needs-you and is CRON_SECRET-gated).
export async function GET() {
  try {
    if (DEMO) return NextResponse.json(demoBrief());
    return NextResponse.json(await needsYouToday());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
