import { NextRequest, NextResponse } from "next/server";
import { DEMO, demoInbox } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recent inbox feed (newest inbound first) for the Emails inbox list.
// Scoped by ?mailbox= (the "source system"): "gov" (default) or "biz" (walled Gmail).
// Live: canonical.messages via lib/live-inbox — an empty DB is an honest empty
// inbox, never fixtures.
export async function GET(req: NextRequest) {
  try {
    const mailbox = req.nextUrl.searchParams.get("mailbox") || "gov";
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "80");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 80;
    if (!DEMO) {
      const { liveInbox } = await import("@/lib/live-inbox");
      return NextResponse.json(await liveInbox(limit, mailbox));
    }
    return NextResponse.json(demoInbox(limit, mailbox));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
