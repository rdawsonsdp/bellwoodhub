import { NextRequest, NextResponse } from "next/server";
import { getEmailByMessageId } from "@/lib/retrieval";
import { DEMO, demoEmail } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// The lowest-level drill-in: the actual source email by message_id. Prefers the
// FULL body from Postgres when DATABASE_URL is set (works even in demo mode);
// falls back to the seed snippet so every reference still resolves to a document.
export async function GET(req: NextRequest) {
  try {
    const mid = req.nextUrl.searchParams.get("mid");
    if (!mid) {
      return NextResponse.json({ error: "Provide mid (message id)." }, { status: 400 });
    }
    if (process.env.DATABASE_URL) {
      try {
        const full = await getEmailByMessageId(mid);
        if (full) return NextResponse.json(full);
      } catch {
        /* DB unreachable — fall through to the demo snippet */
      }
    }
    if (DEMO) {
      const snip = demoEmail(mid);
      if (snip) return NextResponse.json(snip);
    }
    return NextResponse.json({ error: "Email not found." }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/email]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
