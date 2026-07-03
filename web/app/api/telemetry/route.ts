import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

// Access telemetry (top-risk directive): one 'access.page' ledger row per
// authenticated page view — WHO/WHERE/WHAT-DEVICE for the Sentinel's
// baseline/deviation queries. middleware.ts fires this fire-and-forget
// (event.waitUntil) after a session is confirmed, forwarding the visitor's
// original x-forwarded-for / user-agent / x-vercel-ip-* headers, so
// requestMeta here sees the real client, not the middleware hop. Internal
// only: x-internal-key must equal CRON_SECRET (the cron-route pattern).
// DEMO (no DATABASE_URL): logAudit's console line stands in for the row.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-internal-key") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path : null;
  // awaited (never throws): a 204 must not race the serverless freeze
  await logAudit({ actor: null, action: "access.page", meta: { path }, req });
  return new NextResponse(null, { status: 204 });
}
