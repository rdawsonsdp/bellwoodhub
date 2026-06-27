import { NextResponse } from "next/server";
import { demoInbox } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recent inbox feed (newest inbound first) for the Emails inbox list.
export async function GET() {
  try {
    return NextResponse.json(demoInbox(80));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
