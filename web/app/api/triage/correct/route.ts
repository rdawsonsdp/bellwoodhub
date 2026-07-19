import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { TENANT_ID } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/triage/correct — the exec overrides one item. Append-only: writes a
// correction row; the read path applies the latest per message. Takes effect on
// re-render WITHOUT re-running classification.
const VALID = new Set(["not_important", "bump_up", "not_waiting_on_me"]);

export async function POST(req: NextRequest) {
  try {
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (DEMO) return NextResponse.json({ ok: true, mode: "demo" });

    const body = (await req.json()) as { messageId?: string; correction?: string };
    if (!body.messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });
    if (!VALID.has(body.correction ?? "")) {
      return NextResponse.json({ error: "correction must be not_important | bump_up | not_waiting_on_me" }, { status: 400 });
    }

    const { query } = await import("@/lib/db");
    const actor = session?.user?.email ?? null;
    await query(
      `INSERT INTO app.triage_corrections (message_id, tenant, correction, created_by)
       VALUES ($1, $2, $3, $4)`,
      [body.messageId, TENANT_ID, body.correction, actor],
    );
    await logAudit({
      actor, action: "triage.correct", objectRef: body.messageId,
      meta: { messageId: body.messageId, correction: body.correction, tenant: TENANT_ID },
      req,
    });
    return NextResponse.json({ ok: true, messageId: body.messageId, correction: body.correction });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/triage/correct]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
