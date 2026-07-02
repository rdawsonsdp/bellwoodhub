import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { domainAgentByKey } from "@/lib/domain-agents";
import { validateRunOutput } from "@/lib/agent-run";
import { DEMO_AGENT_RUNS } from "@/lib/demo/data/domain-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY (Phase 1 gate check): every domain agent's latest run, from
// fixtures. Phase 2's /api/wall becomes the Mayor-facing read; Phase 5's
// /api/cron/agent-runs writes real runs. ?agent=<key> filters to one agent.
export async function GET(req: NextRequest) {
  try {
    if (!DEMO && req.nextUrl.searchParams.get("demo") !== "1") {
      return NextResponse.json(
        { error: "Live agent runs land in Phase 5 (/api/cron/agent-runs)." },
        { status: 501 },
      );
    }
    const only = req.nextUrl.searchParams.get("agent");
    const agents = DEMO_AGENT_RUNS.filter((r) => (only ? r.agentKey === only : true)).map((r) => {
      const agent = domainAgentByKey(r.agentKey);
      if (!agent) throw new Error(`Unknown agent key in fixtures: ${r.agentKey}`);
      return {
        agent: {
          key: agent.key,
          name: agent.name,
          icon: agent.icon,
          autonomy: agent.autonomy,
          active: agent.active,
          walled: !!agent.walled,
        },
        ranAt: r.ranAt,
        // fixtures pass through the same gate live runs will — the route 500s
        // loudly if a fixture ever violates the contract
        output: validateRunOutput(agent, r.output),
      };
    });
    return NextResponse.json({ agents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
