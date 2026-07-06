/*
 * agent-runner.ts — the LIVE run loop (Phase 5). The cron orchestrator
 * (/api/cron/agent-runs) iterates the active registry, and for each agent:
 *
 *   gather slice (deriveDomains over new canonical messages)
 *     → build the memory-aware prompt (charter + goals + urgency rules +
 *       OPEN memory items, so digests can say "3rd complaint at this address
 *       this quarter" and cite the PRIOR sourceMessageIds)
 *     → Claude (task "draft" → Sonnet per lib/agents/constants; override
 *       with AGENT_RUN_TASK=flagship once eval evidence gates Opus in)
 *     → validateRunOutput (the constitution: autonomy ceiling, citations)
 *     → write canonical.agent_runs + fold memoryOps into canonical.agent_memory
 *
 * getWall() then reads each agent's latest run. DEMO mode never enters this
 * module — fixtures serve (the route no-ops).
 *
 * NOTE on the live SQL: canonical is built but not yet cut over (PROJECT.md
 * task #2). The queries below follow lib/capabilities.ts conventions
 * (source_ref = the RFC message id, sent_at, message_topics) and MUST be
 * smoke-tested at cutover before the cron is pointed at production.
 */
import { DOMAIN_AGENTS, type DomainAgent } from "./domain-agents";
import { deriveDomains } from "./topics";
import {
  validateRunOutput, type AgentMemoryItem, type AgentRunOutput, type AgentSliceMessage, type MemoryKind,
} from "./agent-run";
import { query } from "./db";
import { complete } from "./agents/claude";
import type { Task } from "./agents/constants";

// same tenant scoping as lib/capabilities.ts
const TENANT = "00000000-0000-0000-0000-000000000001";

// ── pure pieces (eval-tested) ────────────────────────────────────────────────

/** The memory-aware prompt. Stable agent identity rides in `system` (cached
 *  block); the volatile slice + memory ride in `user`. */
export interface AgentSkill {
  name: string;
  content: string;
}

export function buildAgentPrompt(
  agent: DomainAgent,
  memory: AgentMemoryItem[],
  messages: AgentSliceMessage[],
  skills: AgentSkill[] = [],
): { system: string; user: string } {
  const actShape =
    agent.autonomy === "draft"
      ? '[{"type":"draft_reply","threadId":string,"draftSubject":string,"draftBody":string,"rationale":string,"citations":string[]}]'
      : '[] — your autonomy is NOT draft; actItems must be empty';
  const system = [
    `You are the ${agent.name} on the Mayor of Bellwood's cabinet.`,
    agent.charter,
    `Your goals:\n${agent.goals.map((g) => `- ${g}`).join("\n")}`,
    `Urgency rules for YOUR desk (what is red/yellow HERE):\n${agent.urgencyRules}`,
    // FEAT-21: operator-uploaded skills refine voice and judgment — they can
    // NEVER override the hard rules below or grant autonomy the code denies.
    ...(skills.length
      ? [
          `Operator-uploaded skills for your desk (follow these; the hard rules still win on any conflict):\n` +
            skills.map((s) => `### ${s.name}\n${s.content.slice(0, 6000)}`).join("\n\n"),
        ]
      : []),
    `Respond with ONLY a JSON object:\n` +
      `{"headline": string (one line for your cabinet card),\n` +
      ` "urgency": "red"|"yellow"|"clear",\n` +
      ` "digest": [{"point": string, "sourceMessageIds": string[]}]  // max 8; EVERY point cited\n` +
      ` "actItems": ${actShape},\n` +
      ` "memoryOps": [{"op":"upsert"|"close","kind":"open_issue"|"commitment"|"pattern"|"entity_note","title":string,"body"?:string,"entityId"?:string,"sourceMessageIds":string[]}]}`,
    `Hard rules: cite only messageIds present in the input (memory evidence included) — a messageId is the ` +
      `value in [square brackets]; thread ids in parentheses are NOT citable. Never invent facts. If you have ` +
      `nothing citable to report, return "digest": [] — NEVER write filler points like "no new items". ` +
      `A commitment may only be closed with message evidence; when your memory shows a repeat, say so ` +
      `("3rd complaint at this address this quarter") and cite the prior sourceMessageIds alongside the new one.`,
  ].join("\n\n");

  const open = memory.filter((m) => m.status === "open");
  const memLines = open.length
    ? open
        .map(
          (m) =>
            `- [${m.kind}] ${m.title} (seen ${m.occurrenceCount}×; evidence: ${m.sourceMessageIds.join(", ")})${m.body ? ` — ${m.body}` : ""}`,
        )
        .join("\n")
    : "(empty)";
  const msgLines = messages.length
    ? messages
        .map(
          (m) =>
            `- ${m.date.slice(0, 10)} · ${m.fromName ?? m.fromEmail ?? "?"} · "${m.subject ?? "(no subject)"}" [${m.messageId}]${m.threadId ? ` (thread ${m.threadId})` : ""}\n  ${m.snippet}`,
        )
        .join("\n")
    : "(no new messages this run — report standing memory status honestly)";
  const user = `YOUR OPEN MEMORY:\n${memLines}\n\nNEW MESSAGES ON YOUR DESK:\n${msgLines}\n\nProduce the run output JSON now.`;
  return { system, user };
}

/** Models return JSON, sometimes fenced — strip fences before parsing. */
export function parseRunOutput(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  return JSON.parse(stripped);
}

// ── live loop ────────────────────────────────────────────────────────────────

interface SliceRow {
  source_ref: string;
  thread_id: string | null;
  sent_at: Date;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  topic: string | null;
  snippet: string | null;
}

/** New inbound messages on this agent's desk since its last run (7-day cap). */
async function fetchAgentSlice(agent: DomainAgent, since: string): Promise<AgentSliceMessage[]> {
  const rows = await query<SliceRow>(
    `SELECT m.source_ref, m.thread_id, m.sent_at, m.from_name, m.from_email, m.subject,
            (SELECT mt.topic FROM canonical.message_topics mt WHERE mt.message_id = m.message_id LIMIT 1) AS topic,
            LEFT(m.clean_body, 400) AS snippet
       FROM canonical.messages m
      WHERE m.tenant_id = $1 AND m.direction = 'inbound' AND m.sent_at > $2
      ORDER BY m.sent_at DESC
      LIMIT 200`,
    [TENANT, since],
  );
  return rows
    .filter((r) => deriveDomains(r.topic, r.from_email).includes(agent.key))
    .map((r) => ({
      messageId: r.source_ref,
      threadId: r.thread_id,
      date: r.sent_at.toISOString(),
      fromName: r.from_name,
      fromEmail: r.from_email,
      subject: r.subject,
      topic: r.topic,
      snippet: r.snippet ?? "",
    }));
}

async function fetchAgentMemory(agentKey: string): Promise<AgentMemoryItem[]> {
  const rows = await query<{
    kind: MemoryKind; title: string; body: string | null; status: "open" | "closed";
    occurrence_count: number; source_message_ids: string[]; first_seen: Date; last_seen: Date;
  }>(
    `SELECT kind, title, body, status, occurrence_count, source_message_ids, first_seen, last_seen
       FROM canonical.agent_memory WHERE agent_key = $1 AND status = 'open'
      ORDER BY last_seen DESC LIMIT 40`,
    [agentKey],
  );
  return rows.map((r) => ({
    agentKey, kind: r.kind, title: r.title, body: r.body ?? undefined, status: r.status,
    occurrenceCount: r.occurrence_count, sourceMessageIds: r.source_message_ids ?? [],
    firstSeen: r.first_seen.toISOString(), lastSeen: r.last_seen.toISOString(),
  }));
}

async function persistRun(agentKey: string, output: AgentRunOutput): Promise<void> {
  await query(`INSERT INTO canonical.agent_runs (agent_key, output) VALUES ($1, $2::jsonb)`, [
    agentKey, JSON.stringify(output),
  ]);
  for (const op of output.memoryOps) {
    if (op.op === "upsert") {
      await query(
        `INSERT INTO canonical.agent_memory (agent_key, kind, title, body, source_message_ids)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (agent_key, kind, title) DO UPDATE SET
           occurrence_count = canonical.agent_memory.occurrence_count + 1,
           status = 'open',
           body = COALESCE(EXCLUDED.body, canonical.agent_memory.body),
           source_message_ids = ARRAY(SELECT DISTINCT unnest(canonical.agent_memory.source_message_ids || EXCLUDED.source_message_ids)),
           last_seen = now()`,
        [agentKey, op.kind, op.title, op.body ?? null, op.sourceMessageIds],
      );
    } else {
      // the commitment close-by-evidence rule was already enforced at validation;
      // an evidence-less close of a commitment never reaches this point
      await query(
        `UPDATE canonical.agent_memory SET status = 'closed', last_seen = now(),
                source_message_ids = ARRAY(SELECT DISTINCT unnest(source_message_ids || $4))
          WHERE agent_key = $1 AND kind = $2 AND title = $3`,
        [agentKey, op.kind, op.title, op.sourceMessageIds],
      );
    }
  }
}

export interface AgentRunResult {
  agentKey: string;
  ok: boolean;
  error?: string;
  slice?: number;
  digest?: number;
  actItems?: number;
}

/** The honest empty run — persisted WITHOUT a model call when an agent's
 *  desk is truly quiet (no new mail, no open memory). The first live run
 *  (2026-07-03) proved the alternative: models asked to report on nothing
 *  write uncited filler, and the constitution rightly rejects it. */
const quietRun = (): AgentRunOutput => ({
  headline: "Quiet desk — nothing new this pass.",
  urgency: "clear",
  digest: [],
  actItems: [],
  memoryOps: [],
});

export async function runAgentLive(agent: DomainAgent): Promise<AgentRunResult> {
  try {
    const last = await query<{ ran_at: Date }>(
      `SELECT ran_at FROM canonical.agent_runs WHERE agent_key = $1 ORDER BY ran_at DESC LIMIT 1`,
      [agent.key],
    );
    const since = last[0]?.ran_at?.toISOString() ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const [slice, memory] = await Promise.all([fetchAgentSlice(agent, since), fetchAgentMemory(agent.key)]);

    // Quiet desk: nothing to read, nothing remembered — skip the model
    // entirely; an honest "nothing new" beats prompted-into-filler output.
    if (slice.length === 0 && memory.length === 0) {
      await persistRun(agent.key, quietRun());
      return { agentKey: agent.key, ok: true, slice: 0, digest: 0, actItems: 0 };
    }

    // FEAT-21: attached skills join the prompt. Draft-autonomy agents also
    // inherit skills attached to the Drafting Agent's console page — that is
    // where a voice skill naturally lives. Absent table (pre-013) → none.
    const skillKeys = [agent.key, ...(agent.autonomy === "draft" ? ["drafting"] : [])];
    const skills = await query<AgentSkill>(
      `SELECT DISTINCT s.name, s.content
         FROM app.skills s JOIN app.agent_skills a ON a.skill_id = s.skill_id
        WHERE a.agent_key = ANY($1::text[])
        ORDER BY s.name LIMIT 6`,
      [skillKeys],
    ).catch(() => [] as AgentSkill[]);

    // FEAT-19 slice 2 (RD 2026-07-05): the prompt is configuration, not code.
    // Operator edits in app.agent_configs.overrides beat the registry defaults
    // — charter, goals, and the urgency directives ("these emails are ALWAYS
    // red"). Autonomy is deliberately NOT overridable here: the constitution
    // stays in code.
    type Overrides = { charter?: unknown; goals?: unknown; urgencyRules?: unknown };
    const ovRows = await query<{ overrides: Overrides }>(
      `SELECT overrides FROM app.agent_configs WHERE agent_key = $1`,
      [agent.key],
    ).catch(() => [] as { overrides: Overrides }[]);
    const ov = ovRows[0]?.overrides ?? {};
    const effective: DomainAgent = {
      ...agent,
      charter: typeof ov.charter === "string" && ov.charter.trim() ? ov.charter : agent.charter,
      goals: Array.isArray(ov.goals) && ov.goals.some((g) => typeof g === "string" && g.trim())
        ? (ov.goals.filter((g) => typeof g === "string" && (g as string).trim()) as string[])
        : agent.goals,
      urgencyRules: typeof ov.urgencyRules === "string" && ov.urgencyRules.trim() ? ov.urgencyRules : agent.urgencyRules,
    };

    const { system, user } = buildAgentPrompt(effective, memory, slice, skills);
    const task = (process.env.AGENT_RUN_TASK as Task) || "draft"; // Sonnet; flagship gated by eval evidence
    const raw = await complete({ task, system, user, maxTokens: 2048 });
    const parsed = parseRunOutput(raw) as { digest?: { sourceMessageIds?: unknown[] }[] };
    // Sanitize BEFORE validation: drop uncited filler points ("no new
    // items") — an uncited claim must never surface, but it shouldn't kill
    // the whole run either. Unknown-id citations still hard-fail below:
    // that shape is hallucination, not fluff.
    if (Array.isArray(parsed?.digest)) {
      parsed.digest = parsed.digest.filter(
        (d) => Array.isArray(d?.sourceMessageIds) && d.sourceMessageIds.length > 0,
      );
    }
    const output = validateRunOutput(agent, parsed); // enforce, then persist
    // guard against cited ids that weren't in the input (no invented evidence)
    const known = new Set([...slice.map((m) => m.messageId), ...memory.flatMap((m) => m.sourceMessageIds)]);
    const invented = output.digest.flatMap((d) => d.sourceMessageIds).filter((id) => !known.has(id));
    if (invented.length) throw new Error(`cited unknown messageIds: ${invented.slice(0, 3).join(", ")}`);
    await persistRun(agent.key, output);
    return { agentKey: agent.key, ok: true, slice: slice.length, digest: output.digest.length, actItems: output.actItems.length };
  } catch (err) {
    return { agentKey: agent.key, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** One orchestrator pass: every active agent, isolated failures. The in-app
 *  enable switch (app.agent_configs, FEAT-19) overrides the code default —
 *  a disabled agent is skipped entirely. */
export async function runAllAgents(): Promise<AgentRunResult[]> {
  const disabled = new Set(
    (await query<{ agent_key: string }>(
      `SELECT agent_key FROM app.agent_configs WHERE NOT enabled`,
    ).catch(() => [])).map((r) => r.agent_key),
  );
  const results: AgentRunResult[] = [];
  for (const agent of DOMAIN_AGENTS.filter((a) => a.active && !disabled.has(a.key))) {
    results.push(await runAgentLive(agent)); // sequential: bounded DB + API pressure
  }
  return results;
}
