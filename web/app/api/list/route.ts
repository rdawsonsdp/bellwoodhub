import { NextRequest, NextResponse } from "next/server";
import { listEmails } from "@/lib/retrieval";
import type { StreamKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Drill-in for the dashboard charts: list the actual emails behind a
// topic / source-stream / time-bucket segment, newest-first.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const topic = sp.get("topic") || undefined;
    const stream = (sp.get("stream") as StreamKey | null) || undefined;
    const since = sp.get("since") || undefined;
    const until = sp.get("until") || undefined;
    const inboundOnly = sp.get("inbound") === "1";

    if (!topic && !stream && !since && !until) {
      return NextResponse.json(
        { error: "Provide at least one of topic, stream, since, until." },
        { status: 400 },
      );
    }

    const result = await listEmails({ topic, stream, since, until, inboundOnly, limit: 60 });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/list]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
