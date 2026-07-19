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
    const body = (await req.json()) as {
      agentKey?: string;
      /** Raw prose from the one box. `focus` is kept as an alias so an older
       *  client keeps working. */
      instruction?: string;
      focus?: string;
      /** Lane to search when no agent exists yet (the create form). */
      mailbox?: "gov" | "biz";
    };
    const instruction = (body.instruction ?? body.focus ?? "").trim();
    if (!instruction) return NextResponse.json({ error: "instruction (string) required" }, { status: 400 });

    // The agent may not exist yet — that is the create-form case. Fall back to
    // a lane-only stand-in so retrieval still respects the mailbox wall.
    const agent = body.agentKey ? domainAgentByKey(body.agentKey) : undefined;
    const walled = agent ? !!agent.walled : body.mailbox === "biz";
    const target = agent ?? { key: body.agentKey ?? "preview", walled };

    if (DEMO) {
      return NextResponse.json({
        ok: true,
        mode: "demo",
        query: null,
        hits: [],
        note: "Demo mode — no archive to search. Preview runs against the live record.",
      });
    }

    // DERIVE FIRST. The runner searches with the query derived from the
    // instruction, not the instruction itself — so a preview that embedded the
    // raw prose could show results the agent would never see. That is the one
    // thing a preview must never do. Same call the save path makes.
    const { deriveFocusQuery } = await import("@/lib/agent-instruction");
    const derived = await deriveFocusQuery(instruction);
    if (!derived) {
      // Nothing searchable in the instruction. This is the single most common
      // way a new agent ends up useless, and it costs ten seconds to fix here
      // instead of a day of empty digests.
      return NextResponse.json({
        ok: true,
        query: null,
        hits: [],
        reason: "no-searchable-subject",
        note: "This doesn't name anything specific enough to search for. Name a thing you could look up — \u201cwater main breaks\u201d, \u201cinvoices\u201d, \u201cbuilding permits\u201d — rather than a quality like \u201canything important\u201d.",
      });
    }

    // Preview must show what the AGENT actually retrieves — so it uses the same
    // planner-backed path (with the same wall/account/score guards).
    const { fetchFocusSlice, fetchFocusSlicePlanned } = await import("@/lib/agent-focus");
    const fetchSlice = process.env.AGENT_FOCUS_SEMANTIC === "1" ? fetchFocusSlice : fetchFocusSlicePlanned;
    const hits = await fetchSlice(target, derived, 12);
    return NextResponse.json({
      ok: true,
      agentKey: body.agentKey ?? null,
      // What is ACTUALLY being searched for — shown to the operator so the
      // derivation isn't a black box they can only judge by its results.
      query: derived,
      mailbox: walled ? "biz" : "gov",
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
