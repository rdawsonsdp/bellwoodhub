import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DOMAIN_AGENTS } from "@/lib/domain-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Create an agent (the Agent Factory, RB-6).
 *
 * Until now "Add an agent" described an interview no code could complete —
 * agents only existed as literals in lib/domain-agents.ts, so making one meant
 * a deploy. FEAT-27 is what unblocks it: a desk's scope can be a sentence
 * resolved semantically rather than a StreamKey enum + a routing regex.
 *
 * A created agent gets a DESK, never a POWER:
 *   - autonomy is clamped to observe|suggest|draft here, CHECKed in SQL, and
 *     re-validated in validateRunOutput at run time. There is no 'send'.
 *   - it cannot take a built-in key (shadowing `police` from the UI would be a
 *     way to rewrite a compliance-held desk).
 *   - citations, the mailbox wall, and the send cage are enforced in the runner
 *     and the approvals path, identically for created and built-in agents.
 *
 * GET lists created agents. POST creates one. DELETE removes one.
 */

const COLORS = ["#5b8def", "#4f9d6b", "#c98b3a", "#9d7fd1", "#3fa3a3", "#c46b8a"];

export async function GET() {
  try {
    if (DEMO) return NextResponse.json({ agents: [] });
    const { loadCustomAgents } = await import("@/lib/agent-registry");
    const rows = await loadCustomAgents();
    return NextResponse.json({
      agents: rows.map((r) => ({
        key: r.agent_key, name: r.name, icon: r.icon, color: r.color,
        instruction: r.instruction, focusQuery: r.focus_query,
        autonomy: r.autonomy, mailbox: r.mailbox, active: r.active,
      })),
    });
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
      return NextResponse.json({
        ok: false,
        error: "Demo mode has no database — agents can only be created on a live instance.",
      }, { status: 400 });
    }

    const body = (await req.json()) as {
      name?: string;
      instruction?: string;
      autonomy?: string;
      mailbox?: string;
    };
    const name = (body.name ?? "").trim();
    const instruction = (body.instruction ?? "").trim();
    if (!name) return NextResponse.json({ error: "Give the agent a name." }, { status: 400 });
    if (instruction.length < 10) {
      return NextResponse.json(
        { error: "Say what this agent should do — a sentence or two, in plain English." },
        { status: 400 },
      );
    }

    // Constitution: clamp to the three real levels. Anything else — including
    // a hopeful "send" — becomes observe rather than erroring, so a malformed
    // client can never accidentally create a more powerful desk than intended.
    const autonomy = ["observe", "suggest", "draft"].includes(body.autonomy ?? "")
      ? (body.autonomy as "observe" | "suggest" | "draft")
      : "observe";
    const mailbox = body.mailbox === "biz" ? "biz" : "gov";

    const { slugify, getCustomAgent } = await import("@/lib/agent-registry");
    const key = slugify(name);
    if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(key)) {
      return NextResponse.json({ error: "That name can't be turned into an id — try letters and spaces." }, { status: 400 });
    }
    if (DOMAIN_AGENTS.some((a) => a.key === key)) {
      return NextResponse.json(
        { error: `"${name}" is the name of a built-in agent. Pick a different one.` },
        { status: 409 },
      );
    }
    if (await getCustomAgent(key)) {
      return NextResponse.json({ error: `An agent named "${name}" already exists.` }, { status: 409 });
    }

    // Derive the retrieval query the same way the one box does — at save time,
    // cached on the row. Fails soft: the agent is still created, it just runs
    // on its time window until the instruction is re-saved.
    const { deriveFocusQuery } = await import("@/lib/agent-instruction");
    const focusQuery = await deriveFocusQuery(instruction);

    const { query } = await import("@/lib/db");
    const actor = session?.user?.email ?? null;
    const color = COLORS[Math.abs(hash(key)) % COLORS.length];

    await query(
      `INSERT INTO app.agents
         (agent_key, name, icon, color, instruction, focus_query, focus_query_for,
          autonomy, mailbox, created_by)
       VALUES ($1, $2, 'smart_toy', $3, $4, $5, $6, $7, $8, $9)`,
      [key, name.slice(0, 80), color, instruction.slice(0, 4000),
       focusQuery, focusQuery ? instruction.slice(0, 4000) : null, autonomy, mailbox, actor],
    );

    await logAudit({
      actor, action: "agent.create", objectRef: key,
      meta: { key, name, autonomy, mailbox, derivedQuery: focusQuery },
      req,
    });

    return NextResponse.json({
      ok: true, key, name, autonomy, mailbox,
      focusQuery,
      // Surfaced so the UI can warn rather than let the operator discover it
      // as "the agent found nothing" on the next run.
      note: focusQuery
        ? null
        : "Couldn't derive a search query from that instruction — the agent will only see new mail until you reword it.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/agents/create]", message);
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
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    // Built-ins are code, not rows — nothing to delete, and refusing is clearer
    // than a silent no-op.
    if (DOMAIN_AGENTS.some((a) => a.key === key)) {
      return NextResponse.json({ error: "Built-in agents can't be deleted — disable it instead." }, { status: 400 });
    }
    const { query } = await import("@/lib/db");
    await query(`DELETE FROM app.agents WHERE agent_key = $1`, [key]);
    await logAudit({ actor: session?.user?.email ?? null, action: "agent.delete", objectRef: key, meta: { key }, req });
    return NextResponse.json({ ok: true, key });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Stable per-key colour pick — the same agent keeps its identity hue. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}
