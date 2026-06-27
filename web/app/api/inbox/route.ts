import { NextRequest, NextResponse } from "next/server";
import { demoInbox } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recent inbox feed (newest inbound first) for the Emails inbox list.
// Scoped by ?mailbox= (the "source system"): "gov" (default) or "biz" (walled Gmail).
export async function GET(req: NextRequest) {
  try {
    const mailbox = req.nextUrl.searchParams.get("mailbox") || "gov";
    return NextResponse.json(demoInbox(80, mailbox));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
