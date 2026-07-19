import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { domainAgentByKey } from "@/lib/domain-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Focus preview — "show me what this instruction actually matches, before I
 * trust a digest built on it."
 *
 * A standing instruction is only as good as its retrieval, and semantic match
 * is not self-evidently right: "red-light citations" may pull parking appeals,
 * or nothing at all if the archive isn't embedded yet. So the editor previews
 * the hits (with scores) at save time rather than letting the operator find out
 * from a wrong digest the next morning.
 *
 * Read-only: no model call, no writes, no run. Just the retrieval the agent
 * would do — same function, same mailbox wall.
 */

export async function POST(req: NextRequest) {
  try {
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as { agentKey?: string; focus?: string };
    const focus = (body.focus ?? "").trim();
    const agent = body.agentKey ? domainAgentByKey(body.agentKey) : undefined;
    if (!agent) return NextResponse.json({ error: "unknown agentKey" }, { status: 400 });
    if (!focus) return NextResponse.json({ error: "focus (string) required" }, { status: 400 });

    if (DEMO) {
      return NextResponse.json({
        ok: true,
        mode: "demo",
        hits: [],
        note: "Demo mode — no archive to search. Preview runs against the live record.",
      });
    }

    const { fetchFocusSlice } = await import("@/lib/agent-focus");
    const hits = await fetchFocusSlice(agent, focus.slice(0, 1000), 12);
    return NextResponse.json({
      ok: true,
      agentKey: agent.key,
      mailbox: agent.walled ? "biz" : "gov",
      hits: hits.map((h) => ({
        messageId: h.messageId,
        date: h.date,
        from: h.fromName ?? h.fromEmail ?? "—",
        subject: h.subject ?? "(no subject)",
        snippet: h.snippet.slice(0, 200),
        score: Math.round(h.score * 100) / 100,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/agents/focus-preview]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
