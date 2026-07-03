import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent enable switches (FEAT-19 first slice — RD 2026-07-03: agents are
// managed in the app). GET returns the disabled set; POST flips one agent.
// Absent row = enabled, so the map only carries the exceptions.

export async function GET() {
  try {
    if (DEMO) return NextResponse.json({ configs: {} });
    const { query } = await import("@/lib/db");
    const rows = await query<{ agent_key: string; enabled: boolean }>(
      `SELECT agent_key, enabled FROM app.agent_configs`,
    );
    const configs: Record<string, boolean> = {};
    for (const r of rows) configs[r.agent_key] = r.enabled;
    return NextResponse.json({ configs });
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
    if (DEMO) {
      return NextResponse.json({ ok: true, mode: "demo", note: "Demo mode — agent switches are display-only." });
    }
    const { agentKey, enabled } = (await req.json()) as { agentKey?: string; enabled?: boolean };
    if (!agentKey || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "agentKey (string) and enabled (boolean) required" }, { status: 400 });
    }
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO app.agent_configs (agent_key, enabled, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (agent_key) DO UPDATE SET
         enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [agentKey, enabled, session?.user?.email ?? null],
    );
    await logAudit({
      actor: session?.user?.email ?? null,
      action: "agent.config.toggle",
      objectRef: agentKey,
      meta: { agentKey, enabled },
      req,
    });
    return NextResponse.json({ ok: true, agentKey, enabled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/agents/config]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
