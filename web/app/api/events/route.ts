import { NextResponse } from "next/server";
import { demoEvents } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Events — actionable items derived from the seed corpus (demo). Each links to
// its source email. (A live, DB-backed version is post-demo product work.)
export async function GET() {
  try {
    return NextResponse.json(demoEvents());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
