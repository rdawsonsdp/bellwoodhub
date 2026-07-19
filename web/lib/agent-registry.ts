/*
 * agent-registry.ts — the ONE list of agents, code-defined and created.
 *
 * SERVER ONLY (it touches the database). Client code keeps importing
 * DOMAIN_AGENTS from ./domain-agents for the built-in seven; anything that
 * needs the full roster reads it through an API route.
 *
 * Why this exists: an agent used to be a literal in a TypeScript array, so
 * creating one meant a deploy — which is why "Add an agent" was a mockup. The
 * thing that unblocks it is FEAT-27. An agent's scope no longer needs a
 * StreamKey enum value and a routing regex; it can be a sentence resolved
 * semantically. So a created agent is a row: name, instruction, lane, ceiling.
 *
 * WHAT A ROW CANNOT DO. It adds a DESK, never a POWER. Autonomy is CHECKed in
 * SQL, re-validated here, and enforced again in validateRunOutput; there is no
 * 'send' value anywhere in that chain. Citations, the mailbox wall, and the
 * send cage live in the runner and the approvals path and apply identically to
 * created and built-in agents. Nothing in this table can widen them.
 */
import { DOMAIN_AGENTS, type DomainAgent, type DomainAutonomy } from "./domain-agents";
import { query } from "./db";
import type { AgentOverrides } from "./agent-instruction";

export interface CustomAgentRow {
  agent_key: string;
  name: string;
  icon: string;
  color: string;
  instruction: string;
  focus_query: string | null;
  focus_query_for: string | null;
  autonomy: DomainAutonomy;
  mailbox: "gov" | "biz";
  active: boolean;
}

/** A created agent, shaped as the runner's DomainAgent so every downstream
 *  consumer (prompt builder, wall, queue, focus retrieval) treats it exactly
 *  like a built-in one. `domains: []` is the point: it is routed by its
 *  instruction, not by a stream enum. */
export function toDomainAgent(r: CustomAgentRow): DomainAgent {
  return {
    key: r.agent_key,
    name: r.name,
    icon: r.icon,
    color: r.color,
    active: r.active,
    // The instruction is the charter. The operator wrote one sentence about
    // what this desk is for; repeating it as a separate "charter" field would
    // be asking the same question twice.
    charter: r.instruction,
    domains: [],
    goals: [],
    // Urgency has no per-desk rules until someone writes them; say so honestly
    // rather than inventing thresholds the operator never set.
    urgencyRules:
      "No custom urgency rules for this desk yet. Mark RED only for something that " +
      "needs the Mayor today; YELLOW for something he should see this week; otherwise CLEAR.",
    autonomy: r.autonomy,
    walled: r.mailbox === "biz",
  };
}

/** Overrides shape for a created agent — its instruction and cached query live
 *  in its own row rather than app.agent_configs, so the runner reads them from
 *  here. Same field names, so the runner path is identical either way. */
export function overridesOf(r: CustomAgentRow): AgentOverrides {
  return {
    instruction: r.instruction,
    focusQuery: r.focus_query ?? undefined,
    focusQueryFor: r.focus_query_for ?? undefined,
  };
}

const SELECT_COLS = `agent_key, name, icon, color, instruction, focus_query,
                     focus_query_for, autonomy, mailbox, active`;

/** Created agents, newest last. Fails soft: a project whose 014 migration
 *  hasn't been applied yet still runs its built-in agents. */
export async function loadCustomAgents(): Promise<CustomAgentRow[]> {
  return query<CustomAgentRow>(
    `SELECT ${SELECT_COLS} FROM app.agents ORDER BY created_at`,
  ).catch(() => [] as CustomAgentRow[]);
}

export async function getCustomAgent(key: string): Promise<CustomAgentRow | null> {
  const rows = await query<CustomAgentRow>(
    `SELECT ${SELECT_COLS} FROM app.agents WHERE agent_key = $1`,
    [key],
  ).catch(() => [] as CustomAgentRow[]);
  return rows[0] ?? null;
}

/**
 * Every agent the system knows about: the built-in cabinet plus everything
 * created in the app. Built-ins come first so the Wall's registry order is
 * stable and created desks append rather than shuffling existing cards.
 *
 * A created agent whose key collides with a built-in is IGNORED, not merged —
 * silently shadowing `police` with a row would be a way to rewrite a
 * compliance-held desk from the UI. The API rejects those keys at creation
 * time too; this is the second lock.
 */
export async function allAgents(): Promise<DomainAgent[]> {
  const builtinKeys = new Set(DOMAIN_AGENTS.map((a) => a.key));
  const custom = await loadCustomAgents();
  return [
    ...DOMAIN_AGENTS,
    ...custom.filter((r) => !builtinKeys.has(r.agent_key)).map(toDomainAgent),
  ];
}

/** Slug a display name into a stable key. Matches the SQL CHECK: lowercase,
 *  starts with a letter, ends alphanumeric, 3–40 chars. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (!/^[a-z]/.test(base)) return `agent-${base}`.slice(0, 40).replace(/-+$/g, "");
  return base.length >= 3 ? base : `${base}-desk`;
}
