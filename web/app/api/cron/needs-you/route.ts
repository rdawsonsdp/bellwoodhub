import { NextRequest, NextResponse } from "next/server";
import { needsYouToday } from "@/lib/capabilities";

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
    // Read-only capability: build the digest from canonical (R1). Never sends
    // anything (R3); empty sections are returned explicitly (R4).
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
