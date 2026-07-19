import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { TENANT_ID } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The important-senders list — the "people whose mail matters" rail. The exec
// edits it in-app so it can change without a developer (RD directive). GET
// lists, POST adds, DELETE removes. Seeded with tenant defaults on first read.

export async function GET() {
  try {
    if (DEMO) {
      const { DEMO_SENDERS } = await import("@/lib/triage/demo");
      return NextResponse.json({ senders: DEMO_SENDERS });
    }
    // loadImportantSenders seeds defaults on first run
    const { loadImportantSenders } = await import("@/lib/triage/run");
    await loadImportantSenders();
    const { query } = await import("@/lib/db");
    const rows = await query<{ id: string; match: string; label: string; seeded: boolean }>(
      `SELECT id, match, label, seeded FROM app.important_senders WHERE tenant = $1 ORDER BY created_at`,
      [TENANT_ID],
    ).catch(() => []);
    return NextResponse.json({ senders: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (DEMO) return NextResponse.json({ ok: true, mode: "demo" });

    const body = (await req.json()) as { label?: string; match?: string };
    const label = (body.label ?? "").trim();
    const match = (body.match ?? "").trim().toLowerCase();
    if (!label || !match) {
      return NextResponse.json({ error: "Both a name and an email or domain are required." }, { status: 400 });
    }
    const { query } = await import("@/lib/db");
    const actor = session?.user?.email ?? null;
    const rows = await query<{ id: string }>(
      `INSERT INTO app.important_senders (tenant, match, label, seeded, created_by)
       VALUES ($1, $2, $3, false, $4)
       ON CONFLICT (tenant, match) DO UPDATE SET label = EXCLUDED.label
       RETURNING id`,
      [TENANT_ID, match.slice(0, 200), label.slice(0, 120), actor],
    );
    await logAudit({ actor, action: "triage.sender.add", objectRef: match, meta: { label, match, tenant: TENANT_ID }, req });
    return NextResponse.json({ ok: true, id: rows[0]?.id, label, match });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/triage/senders POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (DEMO) return NextResponse.json({ ok: true, mode: "demo" });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { query } = await import("@/lib/db");
    await query(`DELETE FROM app.important_senders WHERE id = $1 AND tenant = $2`, [id, TENANT_ID]);
    await logAudit({ actor: session?.user?.email ?? null, action: "triage.sender.remove", objectRef: id, meta: { id, tenant: TENANT_ID }, req });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
