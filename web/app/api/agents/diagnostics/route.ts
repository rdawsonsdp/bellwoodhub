import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/*
 * GET /api/agents/diagnostics?agent=<key> — the "how did this get here" panel
 * (RD 2026-07-21): the retrieval identity behind an agent's report, shown as
 * diagnostics on the digest sheet. An eval surface inside the app — the
 * operator sees WHAT the desk was told, WHAT query that derived, and WHERE it
 * read, next to what it produced.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("agent");
  if (!key) return NextResponse.json({ error: "Provide agent." }, { status: 400 });
  try {
    if (DEMO) {
      return NextResponse.json({
        kind: "builtin", lane: "gov", sources: [],
        instruction: "Watch the demo stream and report what changed, with citations.",
        focusQuery: null, autonomy: "observe",
      });
    }
    const { query } = await import("@/lib/db");
    // the recorded execution of the LATEST run (019) — the trace itself
    const runRows = await query<{ ran_at: string; diagnostics: unknown | null }>(
      `SELECT ran_at::text, diagnostics FROM canonical.agent_runs
        WHERE agent_key = $1 ORDER BY ran_at DESC LIMIT 1`, [key],
    ).catch(() => []);
    const lastRun = runRows[0]
      ? { ranAt: runRows[0].ran_at, work: runRows[0].diagnostics ?? null }
      : null;

    const { getCustomAgent } = await import("@/lib/agent-registry");
    const custom = await getCustomAgent(key);
    if (custom) {
      return NextResponse.json({
        kind: "created",
        lane: custom.mailbox,
        sources: custom.sources ?? [],
        instruction: custom.instruction,
        focusQuery: custom.focus_query,
        autonomy: custom.autonomy,
        lastRun,
      });
    }
    const { DOMAIN_AGENTS } = await import("@/lib/domain-agents");
    const builtin = DOMAIN_AGENTS.find((a) => a.key === key);
    if (!builtin) return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
    // a built-in desk's operator instruction/focus live in agent_configs overrides
    const rows = await query<{ overrides: { instruction?: string; focus?: string } | null }>(
      `SELECT overrides FROM app.agent_configs WHERE agent_key = $1`, [key],
    ).catch(() => []);
    const ov = rows[0]?.overrides ?? {};
    return NextResponse.json({
      kind: "builtin",
      lane: builtin.walled ? "biz" : "gov",
      sources: [],
      instruction: ov.instruction || builtin.charter,
      focusQuery: ov.focus ?? null,
      autonomy: builtin.autonomy,
      lastRun,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
