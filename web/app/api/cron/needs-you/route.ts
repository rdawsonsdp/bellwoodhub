import { NextRequest, NextResponse } from "next/server";
import { needsYouToday } from "@/lib/capabilities";
import { DEMO } from "@/lib/demo";
import { getWall, wallPushLine } from "@/lib/wall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mirror the cron/refresh auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET>;
// a manual trigger can pass ?k=<secret>.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Phase 4: the notification payload is the Wall's top line + queue size —
    // "1 urgent: {headline} · {n} drafts ready · ≈{eta} min" → deep-link /chief.
    if (DEMO) {
      const wall = getWall({ hour: new Date().getHours() });
      return NextResponse.json({
        line: wallPushLine(wall),
        urgent: wall.needsYouNow.filter((i) => i.urgency === "red").length,
        waiting: wall.footer.waiting,
        etaMinutes: wall.footer.etaMinutes,
        deepLink: "/chief",
        generatedAt: wall.generatedAt,
      });
    }
    // Live (until Phase 5 wires agent runs): the legacy canonical digest.
    // Read-only (R1); never sends (R3); empty sections stated (R4).
    const brief = await needsYouToday();
    return NextResponse.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/cron/needs-you]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
