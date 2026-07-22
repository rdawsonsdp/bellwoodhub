import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/*
 * GET /api/sync/series?mode=days|hours — REAL sync volume for the dashboard's
 * bar chart (RB-UX 2026-07-22): rows landed per day (last 7) or per hour
 * (last 12), counted from pipeline.ingest_log. Never invented.
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") === "hours" ? "hours" : "days";
  try {
    if (DEMO) {
      const demo = mode === "hours"
        ? [40, 220, 180, 90, 310, 260, 120, 0, 75, 190, 240, 160]
        : [1200, 3400, 2100, 5200, 4300, 2600, 3900];
      return NextResponse.json({ mode, series: demo.map((n, i) => ({ label: String(i), n })) });
    }
    const { query } = await import("@/lib/db");
    const rows = mode === "hours"
      ? await query<{ label: string; n: string }>(
          `SELECT to_char(date_trunc('hour', updated_at), 'HH24') AS label, count(*)::text AS n
             FROM pipeline.ingest_log
            WHERE updated_at > now() - interval '12 hours'
            GROUP BY date_trunc('hour', updated_at) ORDER BY date_trunc('hour', updated_at)`,
        )
      : await query<{ label: string; n: string }>(
          `SELECT to_char(date_trunc('day', updated_at), 'Dy') AS label, count(*)::text AS n
             FROM pipeline.ingest_log
            WHERE updated_at > now() - interval '7 days'
            GROUP BY date_trunc('day', updated_at) ORDER BY date_trunc('day', updated_at)`,
        );
    return NextResponse.json({ mode, series: rows.map((r) => ({ label: r.label, n: Number(r.n) })) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
