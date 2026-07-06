import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Activity console (RD 2026-07-05: "I need a log file or console so I can
// see what's happening"). Read-only window onto app.audit_log — the append-only
// ledger every action already writes to. Newest first, optional action-prefix
// filter (e.g. ?filter=ingest / draft / sync / agents). Live-only: the demo
// has no ledger and says so.
export async function GET(req: NextRequest) {
  try {
    if (DEMO) {
      return NextResponse.json({ live: false, rows: [], note: "Demo mode — the audit ledger exists on live builds only." });
    }
    const filter = (req.nextUrl.searchParams.get("filter") ?? "").trim();
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 120, 300);
    const { query } = await import("@/lib/db");
    type Row = {
      at: string; actor: string | null; action: string;
      object_type: string | null; object_ref: string | null; meta: Record<string, unknown>;
    };
    const rows = await query<Row>(
      `SELECT at::text, actor, action, object_type, object_ref, meta
         FROM app.audit_log
        WHERE ($1 = '' OR action LIKE $1 || '%')
        ORDER BY at DESC
        LIMIT $2`,
      [filter, limit],
    );
    return NextResponse.json({
      live: true,
      rows: rows.map((r) => ({
        at: r.at,
        actor: r.actor,
        action: r.action,
        objectType: r.object_type,
        objectRef: r.object_ref,
        // compact, display-safe summary of meta — drop bulky nested payloads
        meta: Object.fromEntries(
          Object.entries(r.meta ?? {})
            .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
            .slice(0, 8),
        ),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
