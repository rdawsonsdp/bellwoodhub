---
name: bellwood-hub
description: Operating context for the Bellwood Hub / Chief-of-Staff codebase — an AI assistant that ingests a mailbox, runs instructable agents over it, and answers cited questions. Load this before working in web/ so you inherit the architecture, the invariants, and the hard-won lessons instead of rediscovering them.
---

# Bellwood Hub — project skill

You are working in **Bellwood Hub**, an AI "Chief of Staff." It ingests a mailbox
(and Google Drive) into a canonical Postgres+pgvector store, runs a team of
**agents** that produce cited digests on a **Hub** screen, answers plain-English
questions with citations (**Ask**), and triages mail into what **needs the exec**.
It is **multi-tenant**: `bellwood` (a municipal mayor) and `brownsugar` (Brown
Sugar Bakery), selected by `NEXT_PUBLIC_TENANT`.

Read `docs/TECHNICAL_SUMMARY_2026-07-19.md` for the full state. This file is the
condensed operating context.

## Stack & layout
- Next.js 14 App Router in `web/`. TypeScript. **Inline-style design tokens**
  (`lib/cos-design.ts` — `C`, `FONT`); no CSS framework.
- Supabase Postgres + pgvector. Voyage `voyage-4-large` (1024-d) embeddings.
  Anthropic (Haiku classify, Sonnet synth). Auth.js v5 (Google + Microsoft).
- `web/app/` routes + `api/<x>/route.ts`; `web/components/chief/` UI
  (`ChiefApp.tsx` desktop, `MobileApp.tsx` mobile — **change both or they drift**);
  `web/lib/` logic; `migrations/` numbered SQL.

## The non-negotiables (violate these and you break the product)
1. **DEMO_MODE.** Everything must work keyless. `DEMO = !DATABASE_URL || DEMO_MODE==="1"`.
   Every API route branches `if (DEMO)`. Any new feature needs a demo fixture.
2. **The mailbox wall (DEC-6/FOIA).** Government mail (`_mailbox='gov'`) and walled
   business mail (`'biz'`) must never mix in retrieval. Every retrieval path
   re-checks the lane. `plan()` (the Ask planner) does NOT enforce it — callers
   must guard (see `fetchFocusSlicePlanned`).
3. **The autonomy ceiling.** No agent sends mail. Autonomy is `observe|suggest|draft`,
   CHECKed in SQL, clamped in the API, re-validated in `validateRunOutput`. There
   is no `send`. A created agent adds a DESK, never a POWER.
4. **Citations or silence.** Every claim carries a citation to a real record.
   `resolveCitation()` normalizes id forms before rejecting — do not tighten it to
   exact-match (that was a bug: it rejected correct citations).
5. **Defensibility.** For the mayor tenant, "why did the AI do this" must survive a
   FOIA request. Triage reasons are TEMPLATED from named rules, never model prose.
6. **Tenant-scope everything.** Read `lib/tenant.ts`. Branding, voice
   (`lib/agents/voice.ts`), and the built-in agent roster are all tenant-aware.

## Core concepts
- **Agent = a desk with a plain-English instruction.** Created in-app (row in
  `app.agents`), not deployed. The instruction is derived into a search query by
  one Haiku call at SAVE time (`agent-instruction.ts`), cached on the row — never
  derived in the runner. `agent-registry.ts::allAgents()` merges built-ins +
  created into the one roster the runner and Hub read.
- **Two retrieval paths, now unified.** Ask and agents both use the 3-pass fused
  planner (`lib/planner.ts`: structured + graph + semantic, RRF-fused). Agents
  reach it via `fetchFocusSlicePlanned` (planner + wall/account/score guards).
- **Triage** (`lib/triage/`) is a system pass, NOT an agent: buckets all mail
  (needs_reply / awaiting_others / fyi), ranks by named weights (`weights.ts`),
  reasons are templated (`reason.ts`), corrections apply at read time.
- **Connectors** implement one contract (`lib/connectors/types.ts`). A Drive file
  maps onto the message shape (filename→subject, owner→from, modified→date), so a
  new source is searchable by every agent the day it lands.

## How to run & verify (do this — don't claim done without it)
- Dev: `cd web && npm run dev -- -p 3200`. Live needs `DEMO_MODE=0` +
  `RETRIEVAL_BACKEND=canonical` + keys in the gitignored `web/.env.local`.
- Typecheck: `npx tsc --noEmit` from `web/`.
- Run agents: `POST /api/cron/agent-runs` with `Authorization: Bearer $CRON_SECRET`.
- Run triage: `POST /api/cron/triage` (same auth).
- **Verify behavior against the real mailbox, not just types.** Query Supabase to
  read what a pass actually wrote. The MCP Supabase tools work on the test project.
- Supabase: use the **Session Pooler** host (IPv4); the direct `db.<ref>` host is
  IPv6-only and hangs.

## Migrations discipline
Numbered SQL in `migrations/`. **Each new migration carries its OWN RLS + REVOKE**
(003_rls is not re-run for new tables). Every table: `ENABLE ROW LEVEL SECURITY` +
`REVOKE ALL FROM anon, authenticated`. The app connects as the BYPASSRLS service
role, so deny-all-with-no-policies is the intended posture. **Verify with
`get_advisors` that a new table is not anon-readable** — an append-only table is
not a private one (this was a real bug, BUG-3).

## Hard-won lessons (these are landmines — don't re-step them)
- **A stalled pass that reports `ok` is worse than one that errors.** Per-item
  isolation + report failures. (Ingest once looped forever re-pulling a duplicate.)
- **Truncation kills whole runs.** Agent output is one JSON object; a low token
  cap fails the entire run with "Unterminated string in JSON." Give headroom.
- **Semantic top-N always returns something.** Floor at `MIN_SCORE` or an
  unmatched query hands the model confident junk.
- **Concrete instructions retrieve; abstract ones return noise.** "invoices"
  works; "anything important" returns marketing. Teach users to name a searchable
  thing; show a preview before they trust a digest.
- **A quiet agent and a broken one must look different.** Say "checked, nothing
  new," show "ready — waiting for first run," warn when the scheduler is stale.
  Trust is the product; an ambiguous silence sends the user back to their inbox.
- **The model lifts message-ids out of quoted email bodies.** Strip id-like
  strings from snippets; normalize citations before rejecting.

## Workflow expectations
- Branch off `agent-focus-and-sync-fixes`; `main` auto-deploys to the mayor's
  live site — never commit there without intent. Commit in logical units with a
  message that explains the WHY.
- Surface real open questions instead of guessing (data-model choices, UI
  placement, cadence). Recommend, then confirm.
- Update `PROJECT.md` (PM source of truth) for substantive work.
