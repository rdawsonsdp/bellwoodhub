import { NextRequest, NextResponse } from "next/server";
import { getWall } from "@/lib/wall";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Wall (LOOK): the ONE call behind the Mayor's default screen — needsYouNow,
// cabinet cards, footer counts, and each agent's full digest for the sheet.
// getWall branches DEMO (fixtures) vs live (canonical.agent_runs) itself.
// ?hour= is the Mayor's local hour (greeting only); ?name= the persona name.
export async function GET(req: NextRequest) {
  try {
    const hourRaw = Number(req.nextUrl.searchParams.get("hour") ?? "8");
    const hour = Number.isFinite(hourRaw) ? hourRaw : 8;
    const name = req.nextUrl.searchParams.get("name") ?? undefined;
    // actor: null until L0.1 threads the session email through
    void logAudit({ actor: null, action: "wall.read", req });
    return NextResponse.json(await getWall({ hour, mayorName: name }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
