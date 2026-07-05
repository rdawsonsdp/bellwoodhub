import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { logAudit } from "@/lib/audit";
import { embedPendingMessages, embedCounts } from "@/lib/embed-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ING-4 stage 7: the embed pass — chunk + Voyage-embed every canonical
// message that has no chunks yet (newest first, time-budgeted, resumable).
// Gated exactly like cron/ingest-email; /api/sync drives it in-process on
// the pilot (Vercel fires crons only on production). `?budget=` lets the
// caller shrink the pass so it shares /api/sync's maxDuration with the
// email + calendar pulls.
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
    if (DEMO) {
      return NextResponse.json({ ok: true, mode: "demo", note: "DEMO mode: the fixture search index serves Ask; live embedding requires DATABASE_URL + VOYAGE_API_KEY." });
    }
    const budget = Math.min(Number(req.nextUrl.searchParams.get("budget")) || 210_000, 210_000);
    const result = await embedPendingMessages(budget);
    const counts = await embedCounts();
    void logAudit({ actor: null, action: "embed.run", meta: { ...result, ...counts }, req });
    return NextResponse.json({ ok: true, ...result, ...counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/cron/embed-mail]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
