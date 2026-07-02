# The Agent Factory — agents that create agents

> Direction from RD, 2026-07-02 (logged as DEC-12 / RB-6). Design for review;
> build lands after RB-5 (the orchestrator), which it depends on.

## The ask, verbatim in spirit

Users create agents of **defined types** (e.g. "add an email agent") through an
**interview**: an onboarding agent asks questions; the answers configure the new
agent. Today's agents are the templates — but the system must support agent
types **not yet conceived**. Agents are not programmed in Claude Code until
needed: **an agent builds an agent.** Credentials and missing information are
requested from the user when required. The application grows as agents are
added.

## Why the architecture already points here

Phase 1 made agents **data, not code**: a `DomainAgent` is a registry row —
charter (prose), domains, scopeEntities, goals, urgencyRules, autonomy ceiling,
walled flag, identity color. The Wall, Queue, and digest sheets render *any*
registry row with zero new components (Gate 5's harbor-wellness proof is
exactly this: activation = a config flip). The generic runner
(`lib/agent-run.ts`) executes any agent's slice and enforces the contract
regardless of who the agent is. The factory generalizes one step further:
registry rows are **created at runtime, by an agent, through an interview** —
stored in `canonical.agent_registry`, never in source.

## The two-layer rule system

**1. The constitution (fixed, code-enforced — `lib/agent-run.ts`).**
Every agent of every type, including types that don't exist yet, inherits:
- autonomy ceiling: observe → suggest → draft. **Nothing ever sends.**
- every output cites canonical messageIds; uncited output fails validation.
- commitments close only by evidence or explicit mayor action.
- walled agents' content never leaves their own card.
- a memory namespace keyed (agent_key, kind, title); occurrence counting.
- new agents **activate at `observe`** and are promoted only on eval evidence
  (the R-ladder answer to agent anxiety, RSK-6).

**2. Type templates (data, growable — `canonical.agent_types`).**
A type = interview script + config schema + guardrail defaults + required
connections. Seed types are distilled from today's roster:

| Type | Distilled from | Interview asks about | Connections |
|---|---|---|---|
| `email-ingest` | Outlook/Gmail agents | which mailbox, public-record vs walled, FOIA scope, pull cadence | OAuth (Graph/Gmail), read-only |
| `domain-desk` | police/fire/council/constituent | the domain, who sends into it, what's RED here, draft vs observe | none (reads canonical) |
| `entity-scope` | harbor-wellness | the entity, walled?, deadlines that matter | none |
| `commitments` | schedule agent | which calendars, what "overdue" means, personal-item policy | calendar OAuth |
| `doc-connector` | Police RMS / FOIA portal connectors | source system, format, sensitivity → storage routing (DEC-4) | API key / SFTP / scrape target |

**Novel types:** when no template fits, the Builder runs a first-principles
interview and — before configuring the agent — **authors the missing template**
(script + schema + guardrails) and saves it as a new `agent_types` row. The
constitution still binds it. Rules exist for types not yet conceived because
the constitution is type-independent and templates are just data the Builder
can write.

## The Agent Builder (an agent whose domain is agents)

Registry entry like any other: `key: "builder"`, autonomy `draft` — because
**a new agent IS a draft** with a human gate, exactly like an email reply:

1. **Choose** — "Add an agent" (Operator → Staff Agents / Admin): pick a type,
   or "something new" → the Builder proposes the closest template or drafts a
   new one.
2. **Interview** — conversational (Claude-driven, script-seeded so it can ask
   follow-ups): scope, senders, urgency rules in the user's own words, wall
   status, cadence. Voice or typed — same transcribe path as fix-it.
3. **Draft config** — the Builder emits a candidate registry row: charter
   prose written from the interview, domains, urgencyRules, goals, icon +
   identity color (auto-assigned, collision-checked), autonomy requested vs
   granted (starts observe).
4. **Connections** — the type's required credentials become a checklist the
   user completes: OAuth flows or key entry. Secrets go to the environment /
   secret store, referenced by name in config. **Never stored in the registry,
   never echoed back.**
5. **Charter sign-off (the human gate)** — the drafted agent renders as a
   review card (charter, powers, wall status, what it will read, what it may
   never do). Approve → row written, agent live at observe with a starter
   routine (DEC-10). Fix-it notes revise the draft, same as the Queue.
6. **Grow** — after N clean runs / eval evidence, the Builder proposes a
   promotion (observe → suggest → draft), again human-gated.

## Data model (extends migrations/002)

- `canonical.agent_registry` — the DomainAgent fields as columns + `type_key`,
  `created_by` ('builder' | 'seed'), `status` (interviewing/pending-connections/
  awaiting-approval/active/paused), `promoted_at`, `config jsonb`.
- `canonical.agent_types` — type_key, interview_script jsonb, config_schema
  jsonb, guardrail defaults, required_connections jsonb, `authored_by`.
- `canonical.agent_interviews` — transcript + extracted answers (auditable:
  why an agent is configured the way it is — FOIA-friendly provenance).
- `connection_requests` — name, scope, status; secret VALUE lives in env/
  secret manager only.

`DOMAIN_AGENTS` in code becomes the **seed roster**: at boot, live mode reads
registry rows ∪ seeds (seeds being rows with `created_by: 'seed'`). DEMO mode:
the wizard runs against localStorage so the full interview→approve flow demos
keylessly; a fixture interview (e.g. adding a "Water & Sewer desk") ships as
the demo script.

## Sequencing

RB-5 first (live runs — a created agent needs an orchestrator to run under).
Then RB-6 in three cuts:
1. **RB-6a** Demo wizard: type picker → scripted interview → draft charter →
   sign-off → agent appears on the Wall (localStorage registry overlay).
   Proves the growth story end-to-end, keyless.
2. **RB-6b** Live registry + Builder-as-agent (Claude-driven interview,
   registry writes, routines) + connections checklist with real OAuth.
3. **RB-6c** Novel-type authoring + promotion-by-evidence.

Gate (the product test): a user who is not us adds an email agent for a new
mailbox entirely through the interview — no code changes, no deploy — and the
new agent's card is on the Wall at observe, wired to a routine, with its
credentials requested and stored correctly.
