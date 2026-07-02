import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { getWall } from "@/lib/wall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Wall (LOOK): the ONE call behind the Mayor's default screen — needsYouNow,
// cabinet cards, footer counts, and each agent's full digest for the sheet.
// ?hour= is the Mayor's local hour (greeting only); ?name= the persona name.
export async function GET(req: NextRequest) {
  try {
    if (!DEMO) {
      return NextResponse.json(
        { error: "Live Wall reads canonical.agent_runs — lands in Phase 5 (/api/cron/agent-runs)." },
        { status: 501 },
      );
    }
    const hourRaw = Number(req.nextUrl.searchParams.get("hour") ?? "8");
    const hour = Number.isFinite(hourRaw) ? hourRaw : 8;
    const name = req.nextUrl.searchParams.get("name") ?? undefined;
    return NextResponse.json(getWall({ hour, mayorName: name }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
