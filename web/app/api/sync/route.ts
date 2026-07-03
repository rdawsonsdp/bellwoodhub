import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit, requestMeta } from "@/lib/audit";
import { POST as ingestEmail } from "../cron/ingest-email/route";
import { POST as ingestCalendar } from "../cron/ingest-calendar/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a manual sync is a full email + calendar pass

// The Sync button (RD 2026-07-03): a user-triggered pull that replaces the
// cron on environments where Vercel doesn't fire schedules (preview/pilot)
// and gives the Mayor "refresh now" control everywhere. Runs the SAME
// ingest handlers the crons use — in-process, authorized with CRON_SECRET —
// so there is exactly one ingest code path.
export async function POST(req: NextRequest) {
  try {
    // The middleware already session-gates this route when AUTH_ENABLED=1;
    // this in-route check keeps the gate when the route is reached directly
    // (local dev with middleware off still allows, for smoke tests).
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (DEMO) {
      return NextResponse.json({ ok: true, mode: "demo", note: "Demo mode — nothing to sync." });
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    const internal = (path: string) =>
      new NextRequest(new URL(path, req.nextUrl.origin), {
        headers: { authorization: `Bearer ${secret}` },
      });

    const emailRes = await ingestEmail(internal("/api/cron/ingest-email"));
    const email = await emailRes.json();
    const calRes = await ingestCalendar(internal("/api/cron/ingest-calendar"));
    const calendar = await calRes.json();

    await logAudit({
      actor: session?.user?.email ?? null,
      action: "sync.manual",
      meta: { email, calendar },
      req,
    });
    return NextResponse.json({ ok: !!(email.ok && calendar.ok), email, calendar });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
