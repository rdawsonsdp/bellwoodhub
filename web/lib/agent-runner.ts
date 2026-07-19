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
import { fetchFocusSlice, type FocusHit } from "./agent-focus";
import { effectiveFocusQuery, type AgentOverrides } from "./agent-instruction";
import { complete } from "./agents/claude";
import { VOICE } from "./agents/voice";
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

/** FEAT-17 (RD): "agents should ALWAYS find related emails when finding
 *  emails and marking them." One background line: an email from the record
 *  that surrounds a new message — same thread, same sender, or a semantic
 *  neighbor via the Voyage index. Citable like any slice message. */
export interface RelatedLine {
  primaryId: string; // the new message this background belongs to
  messageId: string;
  date: string;
  from: string;
  subject: string;
  why: "same thread" | "same sender" | "similar topic";
}

export function buildAgentPrompt(
  agent: DomainAgent,
  memory: AgentMemoryItem[],
  messages: AgentSliceMessage[],
  skills: AgentSkill[] = [],
  related: RelatedLine[] = [],
  /** The operator's instruction (the one box), the search query derived from
   *  it, and what that query matched across the whole record. Absent = the desk
   *  runs on its time window alone, exactly as before. */
  focus: { instruction: string | null; query: string | null; hits: FocusHit[] } =
    { instruction: null, query: null, hits: [] },
): { system: string; user: string } {
  const actShape =
    agent.autonomy === "draft"
      ? '[{"type":"draft_reply","threadId":string,"draftSubject":string,"draftBody":string,"rationale":string,"citations":string[]}]'
      : '[] — your autonomy is NOT draft; actItems must be empty';
  const system = [
    // Shared product voice (lib/agents/voice.ts) — the same assistant the Mayor
    // meets in Ask. The desk's own charter follows and narrows it.
    `${VOICE}\n\nYou are the ${agent.name} — one desk of that job.`,
    agent.charter,
    `Your goals:\n${agent.goals.map((g) => `- ${g}`).join("\n")}`,
    `Urgency rules for YOUR desk (what is red/yellow HERE):\n${agent.urgencyRules}`,
    // FOCUS: the operator's standing instruction for this desk. It directs
    // attention — it never grants autonomy or relaxes the citation rules below.
    ...(focus.instruction
      ? [
          `THE MAYOR'S INSTRUCTION for your desk — this is what he actually asked you to do, ` +
            `and it outranks the goals above when they differ:\n${focus.instruction}` +
            (focus.hits.length
              ? `\n\nRecords matching it from the whole archive are supplied below under FOCUS ` +
                `MATCHES. They are NOT new mail — they may be months old. Treat them as a body of ` +
                `evidence: counts, patterns, repeats, who keeps appearing. Cite them like any other ` +
                `message, and say plainly if they are too thin to support a conclusion.`
              : `\n\nNothing in the archive matched it this run. Say so plainly rather than ` +
                `reporting something else in its place.`),
        ]
      : []),
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
  // FEAT-17: the record around the new mail. Grouped per primary message so
  // the model reasons over the pattern ("3rd complaint from this sender"),
  // not the lone message. These ids are fully citable.
  const relLines = related.length
    ? related
        .map((r) => `- around [${r.primaryId}]: [${r.messageId}] ${r.date.slice(0, 10)} · ${r.from} · "${r.subject}" (${r.why})`)
        .join("\n")
    : "(none found)";
  const focusLines = focus.hits.length
    ? focus.hits
        .map(
          (h) =>
            `- ${h.date.slice(0, 10)} · ${h.fromName ?? h.fromEmail ?? "?"} · "${h.subject ?? "(no subject)"}" [${h.messageId}]\n  ${h.snippet}`,
        )
        .join("\n")
    : "(no records in the archive matched the standing instruction)";
  const user =
    (focus.instruction ? `FOCUS MATCHES (whole archive, any date — searched for "${focus.query ?? ""}"):\n${focusLines}\n\n` : "") +
    `YOUR OPEN MEMORY:\n${memLines}\n\nNEW MESSAGES ON YOUR DESK:\n${msgLines}\n\n` +
    `RELATED BACKGROUND (prior record around the new mail — weigh it when judging urgency and cite its ids when you use it):\n${relLines}\n\n` +
    `Produce the run output JSON now.`;
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

/** FEAT-17: gather the record around each new message — same thread, same
 *  sender, semantic neighbor (Voyage index) — WITHOUT crossing the mailbox
 *  wall (DEC-6: relatedness never bridges gov/private). Zero model calls:
 *  the semantic arm reuses the message's own stored chunk vector. */
async function fetchRelatedContext(primaryIds: string[]): Promise<RelatedLine[]> {
  const out: RelatedLine[] = [];
  for (const pid of primaryIds) {
    type Row = { source_ref: string; sent_at: Date; from_name: string | null; from_email: string | null; subject: string | null; why: RelatedLine["why"] };
    const rows = await query<Row>(
      `WITH me AS (
         SELECT message_id, thread_id, from_email,
                COALESCE(provenance->>'_mailbox', 'gov') AS mailbox
           FROM canonical.messages WHERE source_ref = $1 LIMIT 1
       ),
       vec AS (
         SELECT c.embedding FROM canonical.chunks c JOIN me ON c.message_id = me.message_id
          WHERE c.embedding IS NOT NULL ORDER BY c.chunk_index LIMIT 1
       )
       (SELECT m.source_ref, m.sent_at, m.from_name, m.from_email, m.subject, 'same thread'::text AS why
          FROM canonical.messages m, me
         WHERE m.thread_id = me.thread_id AND m.message_id <> me.message_id
           AND COALESCE(m.provenance->>'_mailbox', 'gov') = me.mailbox
         ORDER BY m.sent_at DESC LIMIT 2)
       UNION ALL
       (SELECT m.source_ref, m.sent_at, m.from_name, m.from_email, m.subject, 'same sender'::text
          FROM canonical.messages m, me
         WHERE m.from_email = me.from_email AND m.message_id <> me.message_id
           AND m.thread_id IS DISTINCT FROM me.thread_id
           AND COALESCE(m.provenance->>'_mailbox', 'gov') = me.mailbox
         ORDER BY m.sent_at DESC LIMIT 2)
       UNION ALL
       (SELECT m.source_ref, m.sent_at, m.from_name, m.from_email, m.subject, 'similar topic'::text
          FROM canonical.chunks c
          JOIN canonical.messages m ON m.message_id = c.message_id, me, vec
         WHERE c.message_id <> me.message_id AND c.embedding IS NOT NULL
           AND COALESCE(m.provenance->>'_mailbox', 'gov') = me.mailbox
         ORDER BY c.embedding <=> vec.embedding LIMIT 2)`,
      [pid],
    ).catch(() => [] as Row[]);
    const seen = new Set<string>([pid]);
    for (const r of rows) {
      if (seen.has(r.source_ref)) continue;
      seen.add(r.source_ref);
      out.push({
        primaryId: pid, messageId: r.source_ref, date: r.sent_at.toISOString(),
        from: r.from_name ?? r.from_email ?? "?", subject: r.subject ?? "(no subject)", why: r.why,
      });
      if (out.filter((x) => x.primaryId === pid).length >= 4) break;
    }
    if (out.length >= 24) break; // prompt budget
  }
  return out;
}

export async function runAgentLive(agent: DomainAgent): Promise<AgentRunResult> {
  try {
    const last = await query<{ ran_at: Date }>(
      `SELECT ran_at FROM canonical.agent_runs WHERE agent_key = $1 ORDER BY ran_at DESC LIMIT 1`,
      [agent.key],
    );
    const since = last[0]?.ran_at?.toISOString() ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const [slice, memory] = await Promise.all([fetchAgentSlice(agent, since), fetchAgentMemory(agent.key)]);

    // FEAT-19 slice 2 (RD 2026-07-05): the prompt is configuration, not code.
    // Operator edits in app.agent_configs.overrides beat the registry defaults
    // — charter, goals, and the urgency directives ("these emails are ALWAYS
    // red"). Autonomy is deliberately NOT overridable here: the constitution
    // stays in code.
    //
    // Read BEFORE the quiet-desk check: `focus` is a standing instruction over
    // the whole record, so an agent with focus has work to do even on an hour
    // when no new mail landed on its desk.
    const ovRows = await query<{ overrides: AgentOverrides }>(
      `SELECT overrides FROM app.agent_configs WHERE agent_key = $1`,
      [agent.key],
    ).catch(() => [] as { overrides: AgentOverrides }[]);
    const ov: AgentOverrides = ovRows[0]?.overrides ?? {};

    // FOCUS (lib/agent-focus.ts): what the operator told this desk to watch
    // for, in plain English, matched semantically across the whole record —
    // not just since the cursor. Fails soft: a Voyage outage or an unembedded
    // corpus degrades the run to its time window rather than killing it.
    // The retrieval query is DERIVED from the instruction at save time and
    // cached (lib/agent-instruction.ts) — reading config must never cost a
    // model call. A stale cache resolves to null rather than searching for the
    // previous instruction.
    const focusQuery = effectiveFocusQuery(ov);
    const focusHits = focusQuery ? await fetchFocusSlice(agent, focusQuery).catch(() => []) : [];

    // Quiet desk: nothing to read, nothing remembered — skip the model
    // entirely; an honest "nothing new" beats prompted-into-filler output.
    if (slice.length === 0 && memory.length === 0 && focusHits.length === 0) {
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

    const instruction = typeof ov.instruction === "string" && ov.instruction.trim() ? ov.instruction.trim() : null;
    const effective: DomainAgent = {
      ...agent,
      charter: typeof ov.charter === "string" && ov.charter.trim() ? ov.charter : agent.charter,
      goals: Array.isArray(ov.goals) && ov.goals.some((g) => typeof g === "string" && g.trim())
        ? (ov.goals.filter((g) => typeof g === "string" && (g as string).trim()) as string[])
        : agent.goals,
      urgencyRules: typeof ov.urgencyRules === "string" && ov.urgencyRules.trim() ? ov.urgencyRules : agent.urgencyRules,
    };

    // FEAT-17: the record around the newest mail rides in the prompt — the
    // agent judges patterns, not lone messages (capped for prompt budget)
    const related = slice.length ? await fetchRelatedContext(slice.slice(0, 8).map((m) => m.messageId)) : [];

    const { system, user } = buildAgentPrompt(effective, memory, slice, skills, related, {
      instruction,
      query: focusQuery,
      hits: focusHits,
    });
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
    // related background is citable evidence too (FEAT-17)
    const known = new Set([
      ...slice.map((m) => m.messageId),
      ...memory.flatMap((m) => m.sourceMessageIds),
      ...related.map((r) => r.messageId),
      ...focusHits.map((m) => m.messageId), // focus matches are citable evidence
    ]);
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
