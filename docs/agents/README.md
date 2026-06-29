# Agent specs

The **deep definition** of each agent — its jobs, roles, scope, inputs/outputs,
autonomy gate, schedules, and guardrails — lives here as a versioned Markdown
file, **not in the UX**. The app's `web/lib/cos-agents.ts` registry holds only a
lightweight, read-only summary (name, role, autonomy, recent activity) plus a
`spec` pointer to the file in this folder.

This split is deliberate: it lets the agent team **scale** without bloating the
UI, keeps the real contract in code review + git history, and gives Claude Code
(where agents are actually built and tested) a single source of truth per agent.

## Convention

- One file per agent: `docs/agents/<key>-agent.md`, where `<key>` matches the
  registry `key` (e.g. `email-outlook`, `email-gmail`).
- The registry entry sets `spec: "docs/agents/<file>.md"`.
- Each spec covers: **Identity · Scope · Jobs · Pipeline · Autonomy · Schedule
  (Routines) · Guardrails · Failure modes · Scaling notes**.

## Index

| Agent | Key | Spec |
|---|---|---|
| Outlook Email Agent | `email-outlook` | [email-outlook-agent.md](email-outlook-agent.md) |
| Gmail Email Agent | `email-gmail` | [email-gmail-agent.md](email-gmail-agent.md) |

Related: the ingestion contract (`ingest/base.py` 5-step), the Mailbox registry
(`web/lib/mailboxes.ts`), Routines (`web/lib/routines.ts`), and the autonomy
ladder R1–R4 (`PROJECT.md`).
