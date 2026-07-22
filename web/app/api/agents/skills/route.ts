import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FEAT-21 (RD 2026-07-05): skills are uploadable rules per agent. A skill is
// an operator-uploaded markdown module (voice guide, rules, checklist) stored
// versioned in app.skills; attaching it (app.agent_skills) injects its content
// into that agent's run prompt. A skill shapes voice and judgment — it can
// never grant autonomy the constitution denies. Every mutation is audited.

const MAX_CONTENT = 100_000; // ~100 KB of markdown is a big skill already

export async function GET(req: NextRequest) {
  try {
    if (DEMO) {
      return NextResponse.json({ live: false, skills: [], note: "Skills upload lands on the live pilot — the demo is display-only." });
    }
    const agentKey = req.nextUrl.searchParams.get("agent") ?? "";
    const { query } = await import("@/lib/db");
    type Row = {
      skill_id: string; name: string; kind: string; version: number;
      updated_at: string; chars: string; attached: boolean; agents: string[];
    };
    // table absent until migration 013 is applied → empty list, no crash
    const rows = await query<Row>(
      `SELECT s.skill_id, s.name, s.kind, s.version, s.updated_at::text,
              length(s.content)::text AS chars,
              EXISTS (SELECT 1 FROM app.agent_skills a
                       WHERE a.skill_id = s.skill_id AND a.agent_key = $1) AS attached,
              COALESCE((SELECT array_agg(a.agent_key ORDER BY a.agent_key)
                          FROM app.agent_skills a WHERE a.skill_id = s.skill_id), '{}') AS agents
         FROM app.skills s
        ORDER BY s.updated_at DESC`,
      [agentKey],
    ).catch(() => [] as Row[]);
    return NextResponse.json({
      live: true,
      skills: rows.map((r) => ({
        skillId: r.skill_id, name: r.name, kind: r.kind, version: r.version,
        updatedAt: r.updated_at, chars: Number(r.chars), attached: r.attached,
        agents: r.agents ?? [],
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
      return NextResponse.json({ error: "Demo mode — skills are managed on the live pilot." }, { status: 400 });
    }
    const actor = session?.user?.email ?? null;
    const body = (await req.json()) as {
      action?: "upload" | "attach" | "detach";
      name?: string; kind?: string; content?: string; skillId?: string; agentKey?: string;
      /** voice uploads: attach to EVERY draft-ceiling desk in one act, so one
       *  voice covers all reply-writing agents (RD 2026-07-22). */
      attachDrafting?: boolean;
    };
    const { query } = await import("@/lib/db");

    if (body.action === "upload") {
      const name = (body.name ?? "").trim();
      const content = body.content ?? "";
      if (!name || !content.trim()) {
        return NextResponse.json({ error: "A skill needs a name and markdown content." }, { status: 400 });
      }
      if (content.length > MAX_CONTENT) {
        return NextResponse.json({ error: `Skill too large (${content.length} chars; max ${MAX_CONTENT}).` }, { status: 400 });
      }
      // re-uploading the same name is a new version of that skill, not a twin
      const existing = await query<{ skill_id: string }>(
        `SELECT skill_id FROM app.skills WHERE lower(name) = lower($1) LIMIT 1`, [name],
      );
      let skillId: string;
      if (existing[0]) {
        skillId = existing[0].skill_id;
        await query(
          `UPDATE app.skills SET content = $2, kind = COALESCE($3, kind),
                  version = version + 1, updated_by = $4, updated_at = now()
            WHERE skill_id = $1`,
          [skillId, content, body.kind ?? null, actor],
        );
      } else {
        const ins = await query<{ skill_id: string }>(
          `INSERT INTO app.skills (name, kind, content, updated_by)
           VALUES ($1, COALESCE($2, 'rules'), $3, $4) RETURNING skill_id`,
          [name, body.kind ?? null, content, actor],
        );
        skillId = ins[0].skill_id;
      }
      if (body.agentKey) {
        await query(
          `INSERT INTO app.agent_skills (agent_key, skill_id, attached_by)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [body.agentKey, skillId, actor],
        );
      }
      if (body.attachDrafting) {
        const { allAgents } = await import("@/lib/agent-registry");
        const drafting = (await allAgents()).filter((a) => a.autonomy === "draft");
        for (const a of drafting) {
          await query(
            `INSERT INTO app.agent_skills (agent_key, skill_id, attached_by)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [a.key, skillId, actor],
          );
        }
      }
      await logAudit({ actor, action: "skill.upload", objectType: "skill", objectRef: skillId, meta: { name, agentKey: body.agentKey ?? null, chars: content.length }, req });
      return NextResponse.json({ ok: true, skillId });
    }

    if (body.action === "attach" || body.action === "detach") {
      if (!body.skillId || !body.agentKey) {
        return NextResponse.json({ error: "skillId and agentKey required." }, { status: 400 });
      }
      if (body.action === "attach") {
        await query(
          `INSERT INTO app.agent_skills (agent_key, skill_id, attached_by)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [body.agentKey, body.skillId, actor],
        );
      } else {
        await query(`DELETE FROM app.agent_skills WHERE agent_key = $1 AND skill_id = $2`, [body.agentKey, body.skillId]);
      }
      await logAudit({ actor, action: `skill.${body.action}`, objectType: "skill", objectRef: body.skillId, meta: { agentKey: body.agentKey }, req });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/agents/skills]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
