/*
 * agent-run.ts — the one run contract every domain agent shares.
 *
 * input:  { agent, newMessages (its slice), memory (its namespace) }
 * output: AgentRunOutput — strict, zod-validated. The runner (not the prompt)
 * enforces the guarantees the product depends on:
 *
 *   1. Autonomy ceiling — actItems are rejected outright unless the agent's
 *      autonomy is "draft". No agent ever sends; drafts wait for the human gate.
 *   2. Citations — every digest point and actItem carries messageId refs back
 *      to canonical messages. Uncited output fails validation.
 *   3. Commitments — a memory item of kind "commitment" may only be closed by
 *      evidence (sourceMessageIds) or explicit mayor action. Enforced in
 *      applyMemoryOps, not in the prompt.
 *
 * DEMO mode: runs are served from hand-authored fixtures
 * (lib/demo/data/domain-agents.ts). Live runs land in Phase 5 via
 * /api/cron/agent-runs (Voyage/Claude per admin config), writing
 * canonical.agent_runs + canonical.agent_memory (migrations/002).
 */
import { z } from "zod";
import type { DomainAgent, Urgency } from "./domain-agents";

// ── Output contract ──────────────────────────────────────────────────────────

const UrgencyZ = z.enum(["red", "yellow", "clear"]);

const DigestPointZ = z.object({
  point: z.string().min(1),
  sourceMessageIds: z.array(z.string().min(1)).min(1), // every point cited — no exceptions
});

const ActItemZ = z.object({
  type: z.literal("draft_reply"),
  threadId: z.string().min(1),
  draftSubject: z.string().min(1),
  draftBody: z.string().min(1),
  rationale: z.string().min(1),
  citations: z.array(z.string().min(1)).min(1),
});

export const MEMORY_KINDS = ["open_issue", "commitment", "pattern", "entity_note"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

const MemoryOpZ = z.object({
  op: z.enum(["upsert", "close"]),
  kind: z.enum(MEMORY_KINDS),
  title: z.string().min(1),
  body: z.string().optional(),
  entityId: z.string().optional(),
  sourceMessageIds: z.array(z.string().min(1)),
});

export const AgentRunOutputZ = z.object({
  headline: z.string().min(1), // one line for the cabinet card
  urgency: UrgencyZ,
  digest: z.array(DigestPointZ).max(8),
  actItems: z.array(ActItemZ), // only if autonomy === 'draft' — enforced below
  memoryOps: z.array(MemoryOpZ),
});

export type AgentRunOutput = z.infer<typeof AgentRunOutputZ>;
export type DigestPoint = z.infer<typeof DigestPointZ>;
export type ActItem = z.infer<typeof ActItemZ>;
export type MemoryOp = z.infer<typeof MemoryOpZ>;

// ── Memory store shapes ──────────────────────────────────────────────────────

export interface AgentMemoryItem {
  agentKey: string;
  kind: MemoryKind;
  entityId?: string;
  title: string; // upsert identity = (agentKey, kind, title)
  body?: string;
  status: "open" | "closed";
  occurrenceCount: number;
  sourceMessageIds: string[];
  firstSeen: string; // ISO
  lastSeen: string; // ISO
}

/** The slice of canonical messages handed to one agent for one run. */
export interface AgentSliceMessage {
  messageId: string;
  threadId: string | null;
  date: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  topic: string | null;
  snippet: string;
}

export interface AgentRunInput {
  agent: DomainAgent;
  newMessages: AgentSliceMessage[];
  memory: AgentMemoryItem[]; // the agent's namespace only
  /** Commitment titles the Mayor explicitly closed (the only non-evidence close path). */
  mayorClosedCommitments?: string[];
}

// ── Runner-enforced validation ───────────────────────────────────────────────

/**
 * Parse + enforce the contract for one agent's run output. Throws with a
 * precise reason — a failed run is loud, never silently trimmed.
 */
export function validateRunOutput(agent: DomainAgent, raw: unknown): AgentRunOutput {
  const out = AgentRunOutputZ.parse(raw);
  if (agent.autonomy !== "draft" && out.actItems.length > 0) {
    throw new Error(
      `${agent.key}: autonomy is "${agent.autonomy}" but the run emitted ${out.actItems.length} actItem(s) — drafts are only allowed at the "draft" ceiling.`,
    );
  }
  return out;
}

/**
 * Fold a run's memoryOps into an agent's memory namespace (pure — callers
 * persist the result). Enforces the commitment rule: kind="commitment" closes
 * only with evidence (sourceMessageIds) or explicit mayor action.
 */
export function applyMemoryOps(
  existing: AgentMemoryItem[],
  ops: MemoryOp[],
  ctx: { agentKey: string; ranAt: string; mayorClosedCommitments?: string[] },
): AgentMemoryItem[] {
  const items = existing.map((m) => ({ ...m, sourceMessageIds: [...m.sourceMessageIds] }));
  const find = (op: MemoryOp) =>
    items.find((m) => m.agentKey === ctx.agentKey && m.kind === op.kind && m.title === op.title);

  for (const op of ops) {
    if (op.op === "upsert") {
      const hit = find(op);
      if (hit) {
        hit.occurrenceCount += 1;
        hit.lastSeen = ctx.ranAt;
        hit.status = "open";
        if (op.body) hit.body = op.body;
        for (const id of op.sourceMessageIds)
          if (!hit.sourceMessageIds.includes(id)) hit.sourceMessageIds.push(id);
      } else {
        items.push({
          agentKey: ctx.agentKey,
          kind: op.kind,
          entityId: op.entityId,
          title: op.title,
          body: op.body,
          status: "open",
          occurrenceCount: 1,
          sourceMessageIds: [...op.sourceMessageIds],
          firstSeen: ctx.ranAt,
          lastSeen: ctx.ranAt,
        });
      }
    } else {
      // close
      const hit = find(op);
      if (!hit) continue; // closing something we never knew — a no-op, not an error
      const mayorClosed = ctx.mayorClosedCommitments?.includes(op.title) ?? false;
      if (op.kind === "commitment" && op.sourceMessageIds.length === 0 && !mayorClosed) {
        throw new Error(
          `${ctx.agentKey}: commitment "${op.title}" may only be closed by evidence (sourceMessageIds) or explicit mayor action.`,
        );
      }
      hit.status = "closed";
      hit.lastSeen = ctx.ranAt;
      for (const id of op.sourceMessageIds)
        if (!hit.sourceMessageIds.includes(id)) hit.sourceMessageIds.push(id);
    }
  }
  return items;
}

// ── One completed run, as stored/served ──────────────────────────────────────

export interface AgentRun {
  agentKey: string;
  ranAt: string; // ISO
  output: AgentRunOutput;
}

/** Card-level urgency ordering: red outranks yellow outranks clear. */
export const URGENCY_RANK: Record<Urgency, number> = { red: 0, yellow: 1, clear: 2 };
