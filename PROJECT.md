# Bellwood Hub — Project Manager

> **"Ask the PM"** → read this file. It is the single source of truth for project
> status, outstanding tasks, blockers, and decisions. Keep it current: when a task
> changes state, update the table and the changelog at the bottom.
>
> The live session task list (TaskCreate/TaskList) mirrors the **Task Board** below.
> This file is the durable copy that survives across sessions.

**📡 Shareable status page (live):** https://project-status-ten.vercel.app — public, no login. Source: `project-status/index.html`. Redeploy: `vercel deploy --prod --yes --cwd project-status`.
**Last updated:** 2026-07-05 — **Agent activity, one stop** (RD directive): the email agent's digest sheet now shows **"Sent — past 3 days" grouped by day** (what actually went out, from `app.drafts.sent_at`) + an **↻ refresh** on the box (email seats fire the same manual sync as the Sources button). Root-caused the pilot **Ask failure**: the `web` Vercel project's **Preview env (= the pilot) has no `OPENAI_API_KEY`** — it's Sensitive (write-only) so RD must supply it (dashboard → Preview, or paste into gitignored `web/.env.local` for Claude to sync up). The "Root Directory `web` does not exist" build error = redeploying pre-GitHub CLI deployments; harmless, settings correct. URLs: demo=**bellwood-hub.vercel.app** (public, Production env), pilot=**bellwood-hub-pilot.vercel.app** (SSO, Preview env, auto-deploys on push to `live-pilot`)
**Project:** AI Chief of Staff platform, built on the Bellwood municipal email RAG POC
**Authoritative spec:** `cto-architecture-brief.md` (R. Dawson, SDP Chicago, 2026-06-24) — three-plane
design (Ingestion → Canonical → Capability), 6 architectural decision records (AD-1…AD-6), 5-phase plan.
Currently lives in `~/Downloads/` — **should be copied into the repo** (e.g. `docs/`) so it's version-tracked.
**Phase:** Phase 0 complete · Phase 1 *started* (see roadmap)
**Design note:** there is intentionally NO email-inbox screen. Per brief §4, the mailbox is a *connector/source*
(surfaced on the **Sources** screen as connector health) + per-email drill-in (`/email`). The `/chief` UI is the
**Capability plane** (Brief/Ask/Commitments/Memory/Sources/Approvals) = a faithful port of the Claude Design
prototype into `web/components/chief/ChiefApp.tsx`.
**Default backend:** `poc` (flat pgvector store). `canonical` graph backend built but not yet cut over.
**Supabase project:** `BellwoodHub` (`wwqebbqbnetkjibqmhlj`, us-west-2, PG17) — isolated for client data. Schema applied (19 tables); corpus not yet loaded. Old shared `emailagent` project no longer used.

---

## Demo (mayor-ready, keyless JSON) — DEFAULT

The app runs on the **JSON demo path** (`DEMO_MODE=1` in `web/.env.local`) — bulletproof,
no DB/API dependency for the screens. Open `http://localhost:3200` → redirects to `/chief`.
- **Brief / Memory / Sources / Approvals** ← `web/lib/demo/data/*.json` (derived from the 30k seed)
- **Ask** ← keyword retrieval over `search-index.json` + **live OpenAI synthesis**; curated answers for hero questions; aggregate modes (who/open)
- **Voice search** ← mic in the Ask omnibox → `/api/transcribe` (OpenAI Whisper)
- **Admin console** (sidebar → Admin) ← demo-grade interactive: Models (routing tiers + pipeline), API Cost (rates + projection slider), Agent Rules (R1–R4 ladder + editable notes), Skills (8 capability agents, toggles), Sources (connector enable/schedule/add). Persists to `localStorage` (`bw-admin-config-v1`); server config untouched. Built `lib/admin-config.ts` + `components/chief/AdminPanel.tsx`.
- Rebuild fixtures: `cd web && node scripts/build-demo.mjs`
- **Live toggle:** Postgres (`poc.*`) is loaded with the same 30k + pgvector embeddings; set `DEMO_MODE=0` to switch the same screens to true DB-backed semantic search.

## Status at a glance

| | |
|---|---|
| Repo synced | ✅ on `main`, clean, up to date with origin (`22a0317`) |
| Python env | ✅ `.venv` created, deps installed (psycopg v3, openai, voyage, anthropic, tiktoken) |
| Web deps | ✅ `npm install` complete in `web/` |
| Env keys | ✅ all wired (gitignored): OpenAI, Voyage, Supabase service-role, `DATABASE_URL` (session pooler, IPv4) |
| New project schema | ✅ 19 tables applied to BellwoodHub via Supabase MCP (poc + canonical + pipeline + app) |
| Seed corpus | ✅ `corpus/seed_emails.json` — **30,641** synthetic emails |
| Live DB loaded | ✅ `poc.emails` 30,641 · `email_chunks` 30,831 embedded · `email_entities` 151,109 |
| JSON demo (default) | ✅ all 6 screens + Admin on seed-derived fixtures; `DEMO_MODE=1` |
| Web dev server | ✅ running `http://localhost:3200` → `/chief` (200) |
| Admin console | ✅ Models · Cost · Agent Rules · Skills · Sources (localStorage, demo-grade) |

**Top blocker:** none for the **Monday mayor demo** — it's built and running on the bulletproof JSON path. Open *product* items (connector, send, eval) are post-demo.

---

## Task Board

Legend: 🔵 in progress · ⚪ pending · ✅ done · 🚫 blocked

**Demo build (Monday) — all ✅:**
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Local setup: env + installs + boot | ✅ done | running on :3200 |
| 7 | Provision + seed BellwoodHub | ✅ done | schema + 30k loaded + entities |
| 8 | Demo fixtures from 30k seed | ✅ done | `scripts/build-demo.mjs` |
| 9 | Demo provider + wire routes | ✅ done | 6 screens keyless |
| 10 | Hybrid Ask (keyword + OpenAI) | ✅ done | curated + aggregates + live synth |
| 11 | Voice search (mic → Whisper) | ✅ done | `/api/transcribe` |
| 12 | Admin console (5 sections) | ✅ done | models/cost/rules/skills/sources |

**Look · Act · Know rebuild (master prompt: `docs/rebuild/`; phases gate-by-gate):**
| # | Phase | Status | Notes |
|---|------|--------|-------|
| RB-0 | Ground-truth map (`docs/rebuild/PHASE0_MAP.md`) | ✅ done | Screen/route/counts inventories + persona confirmation. **Gate: RD skim before RB-1** — 6 decisions queued in map §6 (persona naming, demo "today", walled calendar, keyless voice, /hub scope, routines collision) |
| RB-1 | Domain-agent core (registry, deriveDomains, run contract, fixtures) | ✅ done | Gate 1 passed 2026-07-01 on branch `rebuild/phase-1-domain-agents`: tsc + build clean, 38 eval checks green, `/api/agents/run?demo=1` serves all 5 active agents |
| RB-2 | LOOK: the Wall (getWall provider + WallScreen, replaces Today) | ✅ done | Gate 2 passed 2026-07-01: one `/api/wall` call behind everything visible; dual-domain dedup proven; hardcoded badges deleted; 28+38 eval checks green; RD to confirm look on phone |
| RB-3 | ACT: the Queue (approve / voice fix-it / skip, resumable) | ✅ done | Gate 3 passed 2026-07-01: 17 queue checks green; localStorage resumability; RD to time the phone run-through |
| RB-4 | KNOW + nav collapse (Wall·Queue·Ask + Operator toggle; in-app thread view) | ✅ done | Gate 4 passed 2026-07-02: 3 destinations in Mayor mode, one Ask entry + 5 seeds + hold-to-talk, in-app ThreadView (light /email page gone), entity kinds fixed, cron payload = Wall top line; 15 know-checks green |
| RB-5 | Orchestrator + live runs + harbor-wellness config-only proof + usage instrumentation | ✅ done | Gate 5 passed 2026-07-02: proof commit `09094a4` (4 files, zero UI); /api/cron/agent-runs + memory-aware runner (live SQL smoke-tests at canonical cutover); 4 adoption metrics wired + operator readout; phone tests (a)-(c) = RD's Fluency session |
| RB-6 | **Agent Factory** — agents create agents via interview onboarding (`docs/rebuild/AGENT_FACTORY.md`, DEC-12) | ⚪ design logged | RD direction 2026-07-02; builds on the registry-as-data architecture; sequenced after RB-5 (6a demo wizard → 6b live Builder+OAuth → 6c novel types) |

**Go-Live (demo → everyday tool — `docs/GO_LIVE_PLAN.md`; pilot = RD's own mailbox; planned 2026-07-02):**
| # | Phase | Status | Notes |
|---|------|--------|-------|
| L0 | Lock the doors: Auth.js login+allowlist, Deployment Protection, RLS (ISS-4), audit ledger (ISS-5), key rotation (TASK-7), CRON_SECRET | 🔵 started | Buildable slice (RLS/audit/auth-scaffold/state migrations) on branch `live-pilot`; blocked-on-RD: provider answer, OAuth app, pilot Supabase, dashboard toggles |
| L1 | RD's mail flows (ING-1→4 on his mailbox) + real send in a safety cage (`SAFE_SEND_ALLOWLIST`) | ⚪ pending | Gate = the day-two test: two mornings, different real content; approve actually sends |
| L2 | The return trip: 7 AM digest email → Web Push; server-side user state (cross-device); offline shell | ⚪ pending | |
| L3 | Earned intelligence: live memory verified, fix-it→style patterns, 50-question evidence engine, retire 31MB bundle on live | ⚪ pending | |
New risks registered: `SEC-2` multi-user roles/walls undesigned (gates the Mayor's real mailbox, not the pilot) · `LGL-1` FOIA-discoverability/retention of the hub itself — counsel question.

| FEAT-22 | **Email agents clean up the emails** (RD 2026-07-05, from Ask source cards showing newsletter URL-soup): hygiene becomes an agent JOB, not just an ingest filter. Staged: (1) harden `cleanEmailText` for bracketed tracking links, base64-ish token runs, unsubscribe footers; (2) **re-clean + re-chunk + re-embed** the already-mirrored corpus (today's `canonical.chunks` carry the junk; display-level `snippetText` de-noising shipped 7/05 as the stopgap); (3) optional Haiku pass classifying boilerplate vs. content per message at ingest; (4) discuss with RD whether "clean up" also means inbox triage (auto-labeling/archiving commercial noise — R2, human-review queue). | ⚪ logged | Snippet display fix shipped; deep clean needs the re-embed pass |
| FEAT-21 | **Uploadable Skills, referenceable by agents** (RD 2026-07-05, from Admin → Skills): the Skills tab grows an **Upload skill** path — a skill is a reusable module (voice/style guide, prompt block, checklist, knowledge doc) stored versioned in the DB (`app.skills`: name, kind, content, version, uploaded_by, audited), not code. Agents then **reference** skills in their config (FEAT-19 `app.agent_configs.skills[]`; Factory rows too): e.g. upload the **"Mayor Harvey Voice Skill"** and the Drafting/Gmail agent cites it so every reply is written in that voice. Runner injects referenced skill content into the prompt; constitution (citations, human gate) still binds. Converges with L3's learned style-memory (fix-it patterns could *draft* a skill) and DEC-12 (skills become part of the Factory interview). Open questions for RD: skill format (guide doc vs. example replies vs. both) · upload privileges pre-SEC-2 · scope (per-agent vs. per-mailbox vs. tenant-wide). | ⚪ logged | RD: "we don't have to do this now" — design conversation first |
| FEAT-20 | **Plain-language agent transparency** (RD 2026-07-03, close of day): every agent documented in household English, user-facing — "this reduces the fear of agents." Each agent card/detail answers four questions a non-technical user has: what it READS, what it PRODUCES, what it can NEVER do, and WHO DECIDES (always a human). Written for the Mayor and village staff, not engineers; the technical spec (docs/agents/*.md) stays separate. Applies to Default and future Custom agents alike — the Agent Factory interview should GENERATE this plain description as part of creating an agent. | 🔵 shipped (v1, 2026-07-05) | "In plain English" 4-question card on every agent detail (all 15 roster agents); on live, email agents describe their REAL account/lane/send-cage from connector facts + real recent activity (syncs, sends, drafts, runs). Remaining: Agent Factory generates it (RB-6); move copy to `app.agent_configs` (FEAT-19) |
| FEAT-19 | **Agent config lives in the app, not in code** (RD 2026-07-03, via remote): each agent's configuration — charter, rules, autonomy, context — shown ON its agent card, stored in the database, editable in-app by privileged users. Today: config = code registry (`domain-agents.ts`) + versioned specs (`docs/agents/*.md`); runs/memory are already DB. Plan: `app.agent_configs` seeded from the code registry (those become the "Default" agents), runner + cards read DB-first with code fallback, edit UI on agent detail (goals/urgency rules/autonomy ceiling), every edit audited. Editing privileges = the pre-multi-user security conversation (SEC-2). | ⚪ logged | The Agent Factory (RB-6) then WRITES rows here — create + edit converge on one store |
| FEAT-18 | **Auto sign-out** (RD 2026-07-03, safety): idle-timeout log-out, toggleable on/off in the Admin panel (device stays a risk surface — the Mayor's phone left unlocked must shed its session). Implement as session max-age + client idle timer; admin toggle persists per app config. | ⚪ logged | Pairs with FEAT-19 session-security follow-ups |
| FEAT-17 | **Related background on emails** — agent-discovered relatedness (RD requirement 2026-07-03): under any email (urgent first), show related/background messages the agent judged similar — "Mary Joseph asks about water charges → her prior threads, the meter issue on her street, neighbors' same complaint." Non-deterministic by design. Staged: (1) related-by-record (thread/sender/entities/topic — zero AI calls), (2) + semantic neighbors (Voyage embeddings, behind the week-2 AI-exposure decision), (3) + the agent judge pass during mailbox-agent runs on RED/needs-you items — ranked background with a cited WHY per item, stored on the run so cards render instantly. Wall rule applies: relatedness NEVER crosses the gov/private mailbox boundary (DEC-6). | ⚪ logged | Surfaces: ThreadView "Background" block first, then Queue/urgent cards |

**Mayor Harvey onboarding (Tuesday 2026-07-07 — plan agreed 2026-07-05; DEC-9 executed):**
Two parallel stacks, one codebase: RD keeps building on `live-pilot` (his pilot); the Mayor gets his own
**Vercel project (production = `main`)** + his own **isolated Supabase project** — infrastructure isolation
instead of user roles (sidesteps SEC-2 for now). His login allowlist = his emails only; **send starts
fail-closed**; native Vercel crons (his lane is Production). Features promote by fast-forwarding `main`.
| # | Task | Status | Notes |
|---|------|--------|-------|
| MH-1 | **Outlook framework**: Entra app registration (delegated Mail.Read/Calendars.Read/offline_access) + first live Graph pull + fixes (sent-items TODO, `bf:` walk parity) | ⚪ Monday | Graph connector code exists, never live-tested; registration needs RD's Microsoft account |
| MH-2 | Provision the Mayor's stack: Supabase project (13 migrations + RLS verify) + Vercel project (same repo, root `web`, prod branch `main`) + full env (fresh secrets, `ALLOWED_EMAILS`=his, DEMO_MODE=0, send vars ABSENT) | ⚪ Monday | gated by MH-D1 ownership decision |
| MH-3 | Google OAuth client: add the Mayor as test user + the new instance's redirect URI | ⚪ Monday | |
| MH-4 | End-to-end onboarding smoke test (temporary RD login, deleted same day) | ⚪ Monday | |
| MH-5 | **Tuesday, ~15 min with the Mayor**: open URL → Google sign-in (Gmail mirrors) → Microsoft sign-in (Outlook connects) → crons take over; RD watches counters, never content | ⚪ Tuesday | Outlook calendar via Graph = fast-follow |
| MH-6 | **Application overview document for the Mayor** (hand-out, Tuesday AM): what it is / is not, the three screens, the staff in plain English (FEAT-20 four-questions table), data + FOIA posture, the 15-min setup, week-one asks | ✅ done 2026-07-05 | `docs/MAYOR_ONBOARDING_OVERVIEW.md` + Notion copy (printable) |
Decisions pending (RD): **MH-D1** who owns his infra — Village-owned Supabase/Vercel (true no-access) vs. RD-owned with audit · **MH-D2** his URL (vercel.app alias vs. real domain) · **MH-D3** separate API keys for his instance (recommended) · **MH-D4** his exact allowlist addresses + temp smoke-test login · **MH-D5** confirm send stays OFF until his own day-two test.

**Email ingestion (real mail — `docs/EMAIL_INGESTION.md`; absorbs TASK-1 + #3; spec'd 2026-07-02):**
| # | Phase | Status | Notes |
|---|------|--------|-------|
| ING-0 | Spec + the 10-stage Connector Delivery Process | ✅ done | **Gate: RD decides §8 (backfill window, consent model, attachments, worker split, vault, test-mailbox-first)** |
| ING-1 | Registrations, OAuth (Graph delegated Mail.Read / gmail.readonly), vault, dry-run pull CLI | ⚪ pending | blocked on §8 decisions + ISS-4/TASK-7 prep |
| ING-2 | Backfill → RAW + Envelope normalize (clean_text parity evals on real formats) | ⚪ pending | |
| ING-3 | Canonical writes: identity, topics, **the wall stamped at ingest**, RLS on, audit rows | ⚪ pending | ISS-4/ISS-5 enforced here |
| ING-4 | Voyage embeddings + Ask over real mail; reconciliation counts; canonical read-path smoke (#2) | 🔵 shipped 2026-07-05 (backfill runs via Sync) | `lib/embed-mail.ts` + `/api/cron/embed-mail`; sync button drives backfill; `RETRIEVAL_BACKEND=canonical` on pilot; planner literal-address pass; counts on Sync button + agent card |
| ING-5 | Cron routines (rt-outlook/rt-gmail real), live Sources health, 48h soak | ⚪ pending | |

**Post-demo product work — pending:**
| # | Task | Status | Notes |
|---|------|--------|-------|
| TASK-1 | Capture Outlook data for the Mayor's mailbox | ⚪ pending | Exchange/Microsoft Graph connector → ingest pipeline (real data). Logged 2026-06-26. Relates to #3 |
| 2 | Backfill + cut over to canonical | ⚪ pending | poc is loaded; canonical not backfilled. Flip `RETRIEVAL_BACKEND=canonical` |
| 3 | First real email connector (IMAP/Gmail) | ⚪ pending | only `synthetic_email.py` exists |
| 4 | Send capability (R3) | ⚪ pending | approve records decision, doesn't send |
| 5 | Full Morning Brief | ⚪ pending | `needsYouToday()` is the precursor |
| 6 | Expand eval harness | ⚪ pending | 5 → meaningful set |
| FEAT-10 | Agent-driven **Upload Source** ingestion | 🔵 Phase 1 done | **Phase 1 (demo-safe) shipped:** "Upload Source" button on Sources (mobile + desktop) → pick type → drop file → simulated agent draft → R3 review/categorize form → in-memory commit, surfaced as "Agent-ingested this session". Source-type registry: Fire/EMS, Police (restricted→secured store), Permit, General. Maps 1:1 to messages/entity_aliases/message_topics/chunks. **Next:** Phase 2 real OpenAI-vision parse · Phase 3 canonical writes · Phase 4 Voyage embed · Phase 5 FEAT-11 secured S3. |
| FEAT-12 | **Multiple mailboxes** + source-system filter | 🔵 Phase 1 done | Mayor's Government (Outlook) + Business (Gmail) accounts as a filterable "source system" on the Emails screen. New `lib/mailboxes.ts` registry + `mailbox_id` dimension; demo splits seed = Government, adds a walled Gmail business fixture. **Business is walled (DEC-6):** private, not FOIA-indexed, excluded from default AI Search. **Next:** Phase 2 Outlook (Graph) connector · Phase 3 Gmail connector · per-mailbox OAuth (read-only) + canonical.mailboxes table. |
| FEAT-11 | **Secured AWS document store** (S3, encrypted) | ⚪ pending | Per-source/sensitivity storage routing: `restricted` originals (e.g. police) go to a secured, access-controlled S3 bucket — `messages.raw_ref` points there; app holds only searchable metadata/RAG, not the file. `public/internal` may use Supabase Storage. Demo: restricted = memory-only. |
| FEAT-13 | **Today screen + Chief of Staff agent** | 🔵 shipped+ | "Good morning, Mayor Harvey" landing (mobile + desktop): **agent-generated, time-aware persona greeting** (varied) + briefing + today's calendar + **editable sign-to-approve** drafts + inbox preview. Bright **time-of-day banner** (sunrise→midday→dusk→night) + seal + weather + on-this-day. New R4 Chief of Staff agent. Hybrid keyless/OpenAI. Persona configurable. **Next:** the **Morning Agent** (web-search query cards) · verbal/TTS. |
| FEAT-14 | **Multi-customer / white-label** (per-tenant config) | ⚪ planned · post-launch | Shared repo + `lib/tenant.ts` (scaffold shipped) selected by `NEXT_PUBLIC_TENANT`; **one Vercel project + isolated Supabase per customer** (DEC-9). **Tasks:** (1) extend tenant config to branding/seal/title/persona/feedback-repo + wire all consumers; (2) per-tenant mailboxes + `SOURCES_DEFAULT`; (3) per-tenant demo fixtures + search index; (4) per-tenant live env (DATABASE_URL/keys/mailboxes); (5) add customer #2 + its Vercel project + write the "add a customer" runbook. **RD builds after Bellwood launch.** |
| FEAT-15 | **User feedback → Supabase + portal section** | ⚪ planned | Persist in-app Quick Notes durably + surface them on the portal (DEC-8). **Tasks:** (1) `feedback` table migration in BellwoodHub (same DB connection); (2) `/api/feedback` writes to Supabase when connected, in-memory demo fallback; (3) app prod env gets the Supabase/DB connection (infra step); (4) **"User Feedback & Comments"** section on the Project Status portal (`build-status.mjs` reads the table); (5) triage `status` field + optional GitHub/Linear forward. |
| FEAT-16 | **Routines** (scheduled agents) | 🔵 demo shipped | **Admin → Routines** tab + `lib/routines.ts` registry: each routine binds an agent to a **cron + scope + autonomy** (council minutes biweekly, permit files monthly, police/fire nightly, FOIA hourly, morning brief, grant scan) with enable toggles; lists on-demand agents for contrast. Architecture (DEC-10): agent = what/scope, routine = when/where; decoupled, many routines per agent. **Next (production scheduler):** `routines` table + **Vercel Cron / Supabase pg_cron → `/api/cron/tick` → run agent → Agent Activity log**; per-tenant; R-level gates autonomous vs human-gated runs. |

**Known demo gaps (optional polish):** Commitments screen still uses static prototype content (not seed-wired); Brief mixes live data + a few hardcoded hero cards; "who emails most" surfaces institutional senders over residents.

---

## Roadmap / phases

- **Phase 0 — Foundation (DONE):** canonical assertion-ledger identities, event-sourced
  issues + commitments, medallion pipeline (RAW→STAGED→CANONICAL), resolver+fold, Voyage
  embeddings, the strangler-fig backend switch, `/chief` desktop UX, MCP `needs_you_today`
  + `draft_reply`, eval harness + clean_text tests.
- **Phase 1 — Real email (STARTED):** clean_text hardened for real Outlook/Gmail/forward
  chains. **Remaining:** an actual inbound connector (#3), canonical cutover (#2).
- **Phase 2+ (not started):** send capability / higher autonomy (#4), full Morning Brief
  (#5), broader eval coverage (#6).

### Graduated-autonomy model (R-levels)
- **R1** — read canonical only (capability agents today).
- **R3** — send/act; currently gated, `requiresHuman:true`, no send connector yet (#4).
- **R4** — honest-gap: state empty sections rather than omit (digest path).

---

## Tracked items (intake) — mirrored on the dashboard `status.json`

**Issues & bugs**
- `ISS-5` (**critical**) — No audit trail: retrievals, drafts, approvals, and record accesses are not logged. Required for FOIA/Open Meetings + accountability (brief §9). Go-live blocker, not a demo blocker.
- `ISS-1` (med) — Commitments screen still static prototype content (not seed-wired).
- `BUG-1` (med) — `search-index.json` is 31 MB; exceeds Vercel serverless bundle limits — trim before deploying the app.
- `ISS-2` (low) — Brief mixes live seed data with a few hardcoded hero cards.
- `ISS-3` (low) — "Who emails me most" surfaces institutional senders over residents.
- `ISS-4` (med) — Supabase advisor: 9 tables RLS-disabled (anon-key exposure); enforce before real mailbox data.

**Action items (PM sweep, Jun 26):** `TASK-2` trim search index · `TASK-3` deploy app to Vercel · `TASK-4` verify live DB path · `TASK-5` wire Commitments · `TASK-6` clean Brief cards · `TASK-7` rotate keys.

**Risks** (likelihood × impact)
- `RSK-1` (high×high) — API keys shared in plaintext in chat. *Mitigation:* rotate post-demo; move to Vercel env. *Owner:* RD.
- `RSK-2` (med×high) — Demo runs only on local dev server (single point of failure Monday). *Mitigation:* deploy app to Vercel. *Owner:* PM.
- `RSK-3` (low×med) — Live DB path (`DEMO_MODE=0`) unverified end-to-end. *Mitigation:* verify before relying on it. *Owner:* PM.
- `RSK-6` (**high×high**) — Agent anxiety: distrust of agents doing unapproved/automated work could block adoption. *Mitigation:* log ALL agent activity visibly (Agent Activity page, FEAT-6) + R3 human gates + audit trail (ISS-5). *Owner:* RD.

**Dependencies**
- `DEP-1` (pending) — Deploy the app to Vercel for a shareable mayor URL (needs BUG-1 trim).
- `DEP-2` (resolved) — BellwoodHub DB password — provided.
- `DEP-3` (resolved) — OpenAI / Voyage / service-role keys — provided.

**Background (product backlog):** no real connector (#3) · canonical not cut over (#2,#6) · send stubbed (#4) · thin eval (#6).

---

## Decisions log

- **`DEC-12` Agents are configuration, created by an agent (2026-07-02)** — Users add agents of **defined
  types** (email-ingest, domain-desk, entity-scope, commitments, doc-connector — distilled from today's
  roster) through an **interview** run by an Agent Builder agent; the answers become a registry row
  (`canonical.agent_registry`), never code. Two-layer rules: a fixed code-enforced **constitution**
  (autonomy ceiling ≤ draft, citations required, commitment close-by-evidence, walls, observe-first
  activation) that binds every type including ones not yet conceived, plus growable **type templates**
  (interview script + config schema + connections) that the Builder itself can author for novel types.
  Credentials are requested via a connections checklist (OAuth/keys → secret store, never the registry).
  A new agent is a human-gated draft: charter sign-off before activation, promotion only on evidence.
  Full design: `docs/rebuild/AGENT_FACTORY.md`. Sequenced after RB-5. *Decided by RD.*
- **`DEC-11` Agent definitions live in versioned `.md` specs (2026-06-29)** — Each agent's deep
  jobs/roles/scope/guardrails are defined in `docs/agents/<key>-agent.md`, **not in the UX**. The
  `web/lib/cos-agents.ts` registry holds only a lightweight read-only summary + a `spec` pointer. Keeps the
  real contract in code review + git, lets the agent team scale, and gives Claude Code one source of truth per
  agent. **Email ingestion = per-mailbox agents** (Outlook = Government/FOIA public record; Gmail = walled
  Business/private) — the records wall is enforced at the *agent* boundary, not just the UI. Agents read
  **Active / Inactive** (in use vs not-yet). *Decided by RD.*
- **`DEC-10` Agent scheduling = a decoupled "Routine" layer (2026-06-28)** — Agents are scoped workers for the
  Chief of Staff. **Scheduling is decoupled from the agent:** the agent defines *what + scope*; a **Routine**
  binds it to a *schedule (cron) + parameters (directory/server/feed) + autonomy*. One agent → many routines.
  Triggers: read-time, on-demand, **scheduled**. Production scheduler = **Vercel Cron / Supabase pg_cron →
  `/api/cron/tick` → run the agent → log to Agent Activity**; the **R-level gates** what a scheduled run may do
  (R1–R2 ingest/read autonomously; R3 drafts for human approval). Routines are **per-tenant config**. *Decided
  by RD.* Demo shipped as Admin → Routines (FEAT-16); the real scheduler is the build that follows.
- **`DEC-9` Multi-customer = shared repo + per-tenant config + isolated data (2026-06-28)** — One codebase
  on `main`; everything customer-specific (branding, persona, mailboxes, sources, demo fixtures) lives in
  `lib/tenant.ts`, selected by `NEXT_PUBLIC_TENANT` (default `bellwood`). **One Vercel project per customer**,
  each with its own env + **its own isolated Supabase project** (no commingling — FOIA/CJIS). A single push
  ships to every customer in lockstep. Grow into hostname-based multi-tenancy (`tenant_id` + RLS, one deploy)
  only at ~5–10+ customers. *Decided by RD; build after Bellwood launches (FEAT-14).*
- **`DEC-8` User feedback → Supabase, surfaced on the portal (2026-06-28)** — In-app Quick Notes (typed/voice)
  are the **system of record in a Supabase `feedback` table on the same BellwoodHub DB connection** the app
  uses, so the app and the portal stay in sync. They surface as a **"User Feedback & Comments"** section on the
  Project Status portal. The table is durable + tenant-scoped; an issue tracker (GitHub/Linear) is an optional
  *forward* for items actioned, not the store. Supersedes the GitHub-issue-only path. Schema:
  `feedback(id, tenant, text, page, source['typed'|'voice'], status['new'|'triaged'|'done'], created_at)`.
  *Decided by RD (FEAT-15).*
- **`DEC-7` Today screen = "see + act", persona-driven (2026-06-28)** — The Mayor's landing is a
  **Chief-of-Staff Today screen**, not the inbox: greet → brief (what happened / new / important) →
  calendar → **sign the checks (approve agent drafts inline)** → inbox preview. The metaphor is a human
  chief of staff who greets the Mayor with coffee, runs his calendar, has him sign some drafts, then lets
  him enjoy his morning. The briefing voice is a **configurable agent persona** (Admin → Chief of Staff:
  name, greeting, tone, freeform instructions). Default greeting ships as "Good morning, Mayor Harvey."
  *Decided by RD.* A later phase makes the agent **verbal** (TTS). Next: the **Morning Agent** — a
  configurable list of web-search queries (e.g. "Illinois Senate this week") answered by Claude with live
  web search, one card per query, Supabase-backed (`morning_agent_queries` + results); spec in progress.
- **`VIS-1` Direction (2026-06-26)** — This becomes an **agent that connects to other agents**
  (agent-to-agent / MCP). The capability agents + MCP server are the foundation.
- **`DEC-6` Multiple mailboxes; business walled (2026-06-27)** — The mayor's accounts are modeled as
  **Mailboxes** (the filterable "source system"), distinct from `messages.source`: **Government** =
  Outlook (`mayor@villageofbellwood.gov`, public record, FOIA-scoped, default) and **Business** = Gmail
  (`merrill.bellwood@gmail.com`). Business is **walled**: private, NOT FOIA-indexed, excluded from default
  AI Search, visible only when explicitly switched to. Same email appearing in both → **a copy per mailbox**
  (no cross-mailbox unify). Identity resolution still unifies *senders* across mailboxes. *Decided by RD.*
  The gov/business wall is a legal/records boundary, not just UX (commingling personal business with public
  records is a real FOIA risk). Ties to ISS-5 (audit) and FEAT-12.
- **`DEC-4` Storage routing by sensitivity (2026-06-27)** — Uploaded source originals are routed by the
  canonical `sensitivity` field, configured per source type. `restricted` (e.g. police/CJIS) originals are
  **not** stored in the app or Supabase — they live in a **secured, access-controlled AWS S3 store** (FEAT-11),
  with `messages.raw_ref` as the pointer; the app ingests only the searchable metadata + RAG chunks. `public`/
  `internal` may use Supabase Storage. In the demo, `restricted` files are memory-only (nothing persisted).
  *Decided by RD.* Ties to CJIS §5.4 / audit-trail requirements (ISS-5).
- **`DEC-5` Upload Source = human-confirmed Connector (2026-06-27)** — The Upload Source form is not a new
  data path: the Ingestion Agent drafts an `Envelope` from the file; the form is the **R3 human gate** that
  confirms it before it flows through the existing 5-step pipeline. Field→column mapping is 1:1 with
  `canonical.messages` / `entity_aliases` / `message_topics` / `chunks`.
- **`DEC-1` (2026-06-26)** — Kept the JSON demo as default (`DEMO_MODE=1`) over the live DB for demo reliability.
- **`DEC-2` (2026-06-26)** — Connect via the Supabase **Session Pooler** (IPv4); no IPv4 add-on needed.
- **`DEC-3` (2026-06-26)** — Fixed the `message_topics` RLS migration bug so the schema applies cleanly.
- **2026-06-26** — Default `RETRIEVAL_BACKEND=poc` kept for the live demo; canonical
  cutover deferred until backfilled + eval-validated.
- **2026-06-26** — Project synced locally; chose in-place `git init` + fetch to preserve
  the existing `.claude/` folder.

---

## Changelog

- **2026-07-05 close #5 (the agent's PROMPT becomes end-user configuration — FEAT-19 slice 2)** — RD:
  "the prompt each agent gets before running needs to be configured on the Agent Card, stored in the
  database, not hard-coded — written and edited by the end user… a big part will be directives like
  which types of emails are ALWAYS urgent." Shipped: **Instructions section on every runnable desk's
  console page** — Charter / Goals (one per line) / **Urgency rules** ("Any email about a water main
  break is always red") — loaded from the code registry as DEFAULT, edits saved to
  `app.agent_configs.overrides` (the column built for this in 011), **runner merges overrides over
  registry defaults at run time**, every edit audited (`agent.config.instructions`), reset-to-default
  one tap, EDITED/DEFAULT pill shows drift. Autonomy is deliberately NOT editable — constitution stays
  in code. Also: the gear on any cabinet box now resolves — domain desks (police/constituent/…) render
  a real detail page via a registry bridge, so every agent has ONE card with plain-English +
  Instructions + Skills + activity. **Skills migration applied** (RD's word) — uploads live.
  **Embed pipeline proven unstuck**: post-fix scheduler run embedded 1,824 messages / 10,793 chunks in
  one pass; 5,712 of 25,797 indexed and climbing on the 15-min cadence. tsc + build + 6 suites green.

- **2026-07-05 close #4 (SCHEDULER LIVE · skills built · embed poison-batch fixed)** — RD approved the
  protection bypass: generated via Vercel API (Preview protection stays ON for humans; the automation
  header is the machine lane), mirrored to `PILOT_BYPASS_SECRET`, workflow updated on both branches.
  **Proof run: the pilot ran itself** — ingest 200 (pulled 1,200 messages autonomously), calendar 200,
  and **Sentinel fired exactly as designed** (503 + alarms on the night's two genuinely-new access
  patterns: RD's phone and the GitHub runner IPs). The run also exposed a real bug: **the embed stage
  was STUCK** — newsletter bodies carry invalid UTF-8 (lone surrogates) and NULs; Voyage 400s the whole
  batch and the newest-first pass retried the same poison batch forever. Fixed: `toWellFormedText`
  sanitizer (replace unpaired surrogates, strip NULs) + per-message fallback that degrades a poison
  message to its header line and keeps walking; 4 new eval checks. **FEAT-21 skills BUILT** (RD: "the
  skill.md will be uploaded from the UX"): migration 013 (`app.skills` + `app.agent_skills`, deny-all
  RLS) — **awaiting RD's word to apply to the live DB**; `/api/agents/skills` (upload as new version by
  name / attach / detach, all audited); a Skills section on every agent's console page (upload .md,
  attach/detach); the runner injects attached skill content into that agent's prompt (draft-autonomy
  agents also inherit the Drafting desk's skills — where a voice skill lives). Constitution unchanged:
  skills shape voice/judgment, never autonomy. **Activity console readability pass** (RD screenshot:
  "we can't read this") — bigger type, real contrast, labeled meta pairs. Follow-up logged: teach
  Sentinel the automation lane is a known principal (else rotating GitHub runner IPs alarm hourly).
  tsc + build + 6 suites green.

- **2026-07-05 close #3 (Activity console · scheduler registered on main · ONE bypass approval left)** —
  **Activity console shipped** (RD: "I need a log file or console so I can see what's happening"): new
  operator screen (mobile menu + desktop rail → Activity) reading `app.audit_log` newest-first —
  syncs, embed passes, agent runs, drafts, sends, asks, config flips — with prefix filters
  (All/Mail/Index/Sync/Agents/Drafts/Ask), 30s auto-refresh (pausable), compact meta line per row;
  `/api/activity` (live-only, session-gated by middleware; ISS-5's ledger finally has a UI — the
  Approvals "audit trail" card is no longer decorative). **Scheduler**: RD authorized the push — the
  workflow file landed on `main` (80697ba; GitHub only runs schedules from the default branch); first
  dispatched run SUCCEEDED but every endpoint returned **302: Vercel Deployment Protection** walls the
  Preview lane against machines too. Correct fix = Vercel's **Protection Bypass for Automation**
  (secret header, protection stays ON for humans) — generating it was permission-gated as a security
  change; **blocked-on-RD**: approve "generate the protection bypass" (or dashboard → Settings →
  Deployment Protection → Protection Bypass for Automation, then hand the secret via `.env.local`).
  Until then, agents still run manually. tsc + build + 6 suites green.

- **2026-07-05 close #2 (Tuesday plan — Mayor Harvey onboarding)** — RD set Tuesday's goal: the Mayor
  on the same codebase, self-serve login + Gmail & Outlook connect, **RD without access to his data**,
  while RD keeps building features on his own pilot. Plan logged as the **MH board** (above): two
  parallel stacks per DEC-9 — new Vercel project (prod=`main`) + isolated Supabase for the Mayor;
  isolation by infrastructure (not roles — SEC-2 stays parked); his allowlist only; send fail-closed;
  native crons; features promote via fast-forwarding `main` from `live-pilot`. Monday = the Outlook
  framework (Entra registration + first live Graph pull) + stack provisioning + OAuth updates + smoke
  test. Five decisions queued (MH-D1…D5), ownership of his infra being the big one (Village-owned =
  literal no-access). Plan mirrored to Notion.

- **2026-07-05 close (SCHEDULER ARMED — agents run by default)** — RD approved the rotation: Preview
  `CRON_SECRET` regenerated and mirrored to repo secret `PILOT_CRON_SECRET` (write-only both sides;
  values never in chat/repo). This deploy bakes the new secret into the pilot; `pilot-crons.yml` goes
  live on its next tick — **every 15 min**: mail ingest + embed backfill; **hourly**: calendar mirror +
  Sentinel access watch; **hourly 7a–5p CT**: the agent cabinet reports in. The Mayor-experience loop
  ("email, good morning and schedule agents run by default" — RD) no longer needs a button; liveness
  dots go green as each engine reports in. First workflow run dispatched manually as the proof.

- **2026-07-05 late #5 (Ask sessions: "New Ask" · snippet hygiene · FEAT-22 logged)** — RD read the
  Coach-Bernie answer as session leakage; actual behavior: semantic nearest-neighbors landed on the
  Coach-MJ mail and the synthesizer honestly said "no record of Coach Bernie." His product call stands:
  follow-ups should read as drill-down with an explicit reset — **"✦ New Ask"** shipped on mobile
  (purges the session; "ASK MORE — or start clean" affordance) and desktop's reset renamed to match.
  True conversational drill-down (pinning a result set as context for follow-ups) is future planner
  work. **Snippet hygiene**: Ask source excerpts now pass through `snippetText` server-side (planner +
  canonical entity timeline) — tracking-URL soup dropped from display; the deep fix (re-clean →
  re-chunk → re-embed) logged as **FEAT-22 "email agents clean up the emails."**

- **2026-07-05 late #4 (the email agent's box becomes a dashboard · Ask answers formatted · ASK OVER
  REAL MAIL PROVEN)** — RD's screenshot showed Ask answering "emails from Coach MJ" with 8 real cited
  emails — ING-4's first live proof, ~90 minutes after shipping. Session of rapid directives, all
  shipped: **(1) the box is a dashboard** — "Agent responded" (bold) replaces "Sent"; each day leads
  with its answered-count as a big numeral ("15 · Friday, Jul 3 · emails answered" — "that's where the
  business value is"); days **collapse by date** (Today open, older days a header + count);
  **waiting-approval replies sit at the TOP** of the box (big number + Review → the Queue; deciding
  stays in the Queue — `WallRun.waitingApproval` from app.drafts); **(2) a gear icon** in the box
  header deep-links to the agent's detail view (Staff Agents; `AgentsPage initialAgentKey`; domain
  desks without a roster entry fall back to the list — unification is FEAT-19/Factory work);
  **(3) Ask answers render formatted** — new dependency-free `AnswerMd` (headings, bold, lists, pipe
  tables, [n] chips that still scroll to source cards) replaces raw-markdown pre-wrap on BOTH shells.
  tsc + build + 6 suites green.

- **2026-07-05 late #3 (liveness dots · the pilot's scheduler)** — Two RD directives: **(1) "if the
  agent is live the light should be green; if not, red"** — on live builds the cabinet dot is now the
  LIVENESS channel (urgency keeps needsYouNow + digest sheets): email seats green when the connector is
  active and synced within 2h; Schedule green while the Google connector is live (the calendar mirror
  rides its token); every other desk green only if its latest run is within 25h — so today Gmail +
  Schedule read green and the stale desks read red, honestly. **(2) "email, good morning and schedule
  agents should be running by default"** — root cause: Vercel fires crons only on Production; the pilot
  is Preview, so nothing was ever scheduled. Shipped `.github/workflows/pilot-crons.yml` (repo is
  public → free Actions): every 15 min ingest-email + embed-mail; hourly calendar + Sentinel; hourly
  agent-runs 7a–5p CT — fail-closed until `PILOT_CRON_SECRET` (repo secret) matches the pilot's
  `CRON_SECRET`. **Blocked-on-RD:** approving the secret rotation (CRON_SECRET is write-only; Claude's
  rotate+mirror command was permission-gated). Also flagged: the GitHub repo is PUBLIC — confirm intent.

- **2026-07-05 late #2 (mobile polish from RD's phone screenshot · Gmail leads the cabinet)** — RD's
  screenshot showed the Sent rows overflowing the phone viewport (long addresses in nowrap blocks) and
  the new sync counter squeezing the topbar ("Chief of Staff" wrapped to 3 lines). Fixed per mobile-UX
  basics: Sent rows now **wrap-then-clamp** (recipient 1 line, subject 2, `overflowWrap:anywhere` so
  unbroken strings can never widen the sheet), sizes stepped down; the compact topbar counter
  abbreviates ("18.2k · 1.3k", max-width capped) while desktop keeps the full words. Also per RD:
  **the mail desks now lead the cabinet, Gmail in the upper-left seat** (connector seats unshift to the
  front of `wall.cabinet`, gmail-first). tsc + build + 6 suites green.

- **2026-07-05 late (send-cage visibility — the "Live send on" pill)** — RD, seeing the holiday drafts
  in the queue, asked where "auto send" was configured and wanted a flashing label. Clarified the truth
  (nothing auto-sends: drafts sit until a human taps Approve; THEN the cage checks SEND_ENABLED +
  SAFE_SEND_ALLOWLIST — both currently armed on the pilot from 7/03, allowlist `*`), and shipped the
  visibility: a pulsing amber **"Live send on — Approve really sends"** pill on the Wall hero, the
  Queue header, and the desktop Approvals header. Each surface learns cage state from its own single
  API call (`WallPayload.sendLive` via getWall — invariant 9; queue + approvals GET add the flag);
  always false in DEMO; pill absent = sending disabled. Turning send OFF remains an env change
  (SEND_ENABLED=0 + redeploy) — an in-app master switch belongs to FEAT-19. tsc + build + 6 suites green.

- **2026-07-05 night (ING-4 shipped — Voyage embeddings + Ask over real mail)** — RD's test question
  ("emails from coachmj@…") returned nothing; root cause logged this morning (canonical.chunks never
  written, Ask searching the empty poc store). RD: "let's get ING-4 done." Shipped: **(1) the embed
  stage** — `lib/embed-mail.ts` (paragraph-aware chunker ~1400 chars + 200 overlap, one-line
  From/date/subject header stamped on every chunk so sender questions match pre-identity-ledger;
  Voyage voyage-4-large @1024 batch embedding; per-message atomic INSERT so reconciliation is exactly
  messages == chunked-messages; empty bodies embed their header so every message closes) +
  `/api/cron/embed-mail` (CRON_SECRET-gated, time-budgeted, resumable, cron 7/22/37/52); **(2) the
  driver** — `/api/sync` POST now runs email → calendar → embed (60s sub-budget) and the Sync button
  auto-continues while `backfillRemaining || embedRemaining` (one press mirrors AND indexes the
  mailbox; counter reads "N synced · M searchable"); **(3) Ask flipped to canonical** —
  `RETRIEVAL_BACKEND=canonical` on the pilot Preview env: the existing 3-pass planner (structured/
  graph/semantic + RRF + Sonnet synthesis, deterministic no-records short-circuit) now serves Ask,
  with a new **literal-address pass** (emails named in the question match from/to/cc directly —
  RD's exact test case works with an empty alias ledger); **(4) reconciliation counts** on the Sync
  line and the email agents' FEAT-20 activity ("Search index: M of N messages embedded"). New eval
  suite `eval/embed.test.ts` (chunker coverage/termination, header stamp, address extraction) —
  6 suites green + tsc + build. VOYAGE_API_KEY validated + staged (Preview + .env.local). Demo
  untouched (poc default). **Next press of Sync starts the ~12k backfill.** Stage 5–6 (identity
  aliases, topics) remain the ING-3 tail — History/entity anchoring still empty until then.

- **2026-07-05 evening (FEAT-20 shipped — plain-language agent transparency)** — RD caught the Gmail
  Email Agent detail page describing the demo persona ("merrill.bellwood@gmail.com", "walled", "never
  sends") on the live pilot — a transparency card that lies breeds MORE agent fear (RSK-6), so FEAT-20
  went from logged to shipped: **(1)** every roster agent (15) now carries a `plain` block in
  `cos-agents.ts` — the four questions in household English (what it READS · what it PRODUCES · what it
  can NEVER do · WHO DECIDES) — rendered as the gold-trimmed **"In plain English" card first** on the
  agent detail, before anything technical; **(2)** on live builds the email agents' role/job/plain are
  **rebuilt from connector facts** (`/api/agents/config` now returns account address, lane, mid-walk,
  message count, send-cage state) — no persona fiction can render on the pilot; **(3)** "Recent
  activity" is now REAL on live: connector sync state, human-approved sends, drafting outcomes
  (waiting/approved/discarded), and each agent's latest run headline, assembled server-side from
  `pipeline.connector_accounts` / `app.drafts` / `canonical.agent_runs`; **(4)** stale honesty fixes:
  R3 label "never sends" → "sends only with your approval" (true since the send cage). Also this
  session: **OPENAI_API_KEY landed in Preview** (RD supplied; validated 200) — pilot Ask synthesizes
  again; **VOYAGE_API_KEY staged** in Preview + `.env.local` (validated 200) for ING-4. Remaining
  FEAT-20 tail: the Agent Factory interview must GENERATE the plain block (RB-6); FEAT-19 moves the
  copy to `app.agent_configs`. tsc + build + 5 eval suites green.

- **2026-07-05 (agent activity one-stop · pilot Ask root-caused)** — RD (from the pilot, tapping the Gmail
  Email Agent box): "show emails sent the past 3 days, grouped by days — this is where activities of the
  agent should be seen, one stop," + a refresh on the box. Shipped both, mobile + desktop (shared
  components): `getWall()`'s connector cards now carry **`WallRun.sent`** — actual transmissions
  (`app.drafts.sent_at`, past 3 days, grouped by Mayor-local day, "every send human-approved · full record
  in the audit ledger") — rendered as a day-grouped **"Sent" section on the AgentDigestSheet**, honest
  empty state included; **↻ refresh** in the sheet header re-pulls the wall payload, email seats fire the
  same manual `/api/sync` as the Sources button first (one ingest code path). tsc + build + 5 eval suites
  green. **Ops findings** (RD updated the OpenAI key, hit a failed build, Ask down on the pilot): the
  pilot = the `web` project's **Preview** lane (alias on the latest `live-pilot` GitHub build); Preview
  **never had `OPENAI_API_KEY`** → Ask's planner throws — and the key is **Sensitive** (write-only), so
  only RD can supply it; the "Root Directory `web` does not exist" failure was a dashboard Redeploy of a
  pre-GitHub CLI deployment (source root IS the web folder) — harmless, no settings change needed, but
  **old CLI deployments can't be redeployed anymore**; deploy via git push (or CLI from repo root).

- **2026-07-03 night (GO-LIVE DAY — real mail flowing, first live agent runs, in-app agent controls)** —
  The rehearsal became real: RD's Google OAuth client + sign-in (consent captured to Vault after fixing a
  fire-and-forget serverless race — writes now awaited), `bellwood-mayor` DATABASE_URL wired (Session pooler,
  pinned CA verified), and the pilot's first live render: honest zeros, real date. **Sync**: the 200-cap
  became a full-mailbox walk (resumable `bf:` cursor + server batch loop + button auto-continue + live
  "N synced" counter) — **~9,000 messages** mirrored by end of day, walk still running; 14 calendar events.
  **First live agent runs** (RD's Anthropic key, Sensitive-scoped): all 6 initially rejected by the
  constitution — models wrote uncited filler on empty desks, one cited thread-ids — fixed with quiet-desk
  short-circuit (no model call), pre-validation filler drop, citation-hygiene prompt; second pass: 5 honest
  quiet desks + Constituent's real judgment ("inbox is commercial/personal noise only"). **In-app agent
  management started (FEAT-19 slice 1)**: enable switches on every Staff Agents card → `app.agent_configs`
  (migration 011, applied), enforced in runner/ingest/sentinel/Wall, every flip audited. "Run agents now"
  button (cards pulse Running). Email agents hold Wall cabinet seats from connector status (Default vs
  Custom origin vocabulary). Inbox pagination (Load more). Demo-era content purged from operator screens on
  live builds (real mailboxes in the switcher, no prototype fallbacks, no fake agent activity). **GitHub
  integration live** (root directory fixed via API): push = auto-deploy, proven 5×. Sign out in both
  profile menus. 48 holiday OOO drafts staged to Approvals (RD directive; send stays structurally
  impossible — read-only scopes). Logged: FEAT-17 related-background, FEAT-18 auto sign-out, FEAT-19
  agent-config-in-app. **Send cage (L1.7) BUILT + first real send**: RD chose the SEND_ENABLED route — gmail.send scope
  (re-consented), lib/send-cage (human Approve → master switch → recipient allowlist, fail-closed),
  threaded Gmail replies, outcomes on the draft row + ledger; **first caged send delivered 3:51 PM**
  (to RD himself), robot-recipient refusals proved the cage; RD then opened SAFE_SEND_ALLOWLIST to `*`
  (pilot Preview only — the Mayor's production env starts tight); 6 no-reply robot drafts discarded as
  housekeeping (restorable). SECURITY_POLICY / COMPLIANCE_MAP 1.7 updated honestly.
  **Real-mail text hygiene** (RD screenshot): newsletters pad bodies with invisible Unicode + URL soup —
  lib/clean-text.ts scrubs at ingest, snippets de-noised, 9k mirrored bodies backfilled; also fixed the
  email drill-in reading the empty poc table on live (canonical lookup first — real mail 404'd on tap).
  **Tomorrow (RD): agent logic + agent learning process** — RD's closing directive: **related-email
  retrieval becomes part of every agent's run loop** (FEAT-17 graduates from display feature to core
  process: gather same-sender/thread/topic + semantic neighbors, reason over the context, not the lone
  message); **plain-language agent transparency** (FEAT-20 — every agent's card says in household English
  what it reads, produces, can never do, and who decides); also agents skip no-reply senders when
  drafting, quieter not-sent feedback on bulk approvals.

- **2026-07-03 evening (PRODUCTION LOCKDOWN — RD: "Tuesday uses production data; lock this down now")** —
  Two agent-workflow waves + inline provisioning, all on `live-pilot` (@ `dd0c061`), 10 migrations now
  applied to `bellwood-mayor`. **Security:** DB client pins the Supabase Root 2021 CA (fetched from the
  live TLS chain; `SUPABASE_CA_CERT` on Preview); OAuth refresh tokens moved to **Supabase Vault**
  (migration 007 + `token-store.ts`, plaintext column NULLed forever); `audit_log` append-only now
  **DB-trigger-enforced** (binds even the owner, 009); **strict live mode** — `DEMO_MODE=0` set on the
  pilot: fixtures can never serve there, even DB-less (RD: "remove the demo data in this env").
  **Google Calendar** (RD: "my Google and Google Calendar, real data"): `calendar.readonly` scope,
  gcal connector, 2-hourly ingest cron → `app.calendar_events`; /api/events and the Wall's "Coming up"
  card read real rows live. **Access monitoring (RD: #1 risk = Mayor's mail accessed through us):**
  every audited action now carries **ip / device class / city / region / country**; page-view telemetry
  via middleware sink when auth is on; and the **Sentinel agent** — R1, flags-never-blocks, hourly cron
  baselining 30 days of access and flagging new IPs (alarm), new device classes (alarm), geo deviations,
  off-hours use, and volume anomalies (review), findings occurrence-counted into agent memory, 503-on-alarm
  so a free uptime pinger becomes the pager; registered in Staff Agents with spec
  `docs/agents/sentinel-agent.md`. ops-watch hourly + 15-min email-ingest crons scheduled. **Docs:**
  `SECURITY_POLICY.md` (plain-English, CTO-level, for peer review), `RETENTION_POLICY.md` (DRAFT for
  counsel), `OPS_RUNBOOK.md`, COMPLIANCE_MAP register updated (5.1/5.3/5.6 CLOSED, 5.4 partial,
  5.5 draft delivered). AUTH staged: `AUTH_SECRET` + `ALLOWED_EMAILS` set; `AUTH_ENABLED=1` flips the
  moment RD's Google OAuth client lands. Deliberate non-lockdowns per RD: no VPN/tunnel (mobile-first),
  MFA delegated to provider accounts. tsc + build + 5 eval suites green; public demo untouched (200).

- **2026-07-03 (Week-1 sprint: DB provisioned · connectors built · demo-data strategy executed)** — RD set
  the Tuesday goal (start ingesting the Mayor's Outlook + Gmail; his own accounts as the rehearsal;
  week 1 = LOAD, search is week 2) and the strategy: isolate the data, kill demo-data ambiguity, two email
  agents (Outlook + Gmail, separate business rules). Executed autonomously while RD was in a meeting:
  **(1) `bellwood-mayor` Supabase project created** via MCP (us-east-1, $10/mo, org rdawson) — all 8
  migrations applied (poc, canonical, pipeline, app, domain-agents, audit, user-state, connector-accounts)
  + RLS deny-all as the 9th; security advisors confirm ZERO missing-RLS findings (ISS-4 closed on this DB);
  tenant renamed honestly to `bellwood-mayor-pilot (real mail)`. **(2) Week-1 framework** (3-agent
  workflow, verified tsc/build/5-suites): live-honest data paths — /api/inbox reads canonical.messages,
  /api/events returns honest zeros, getWall/getQueue read canonical.agent_runs + app.drafts (fixtures can
  no longer leak into live mode); `ACTIVE_AGENTS` env narrows the pilot cabinet without touching the demo;
  Graph + Gmail connectors (plain-fetch, token refresh, delta/historyId cursors, Retry-After backoff);
  `/api/cron/ingest-email` lands RAW→staged→canonical with per-account error isolation; sign-in refresh
  tokens auto-upsert `pipeline.connector_accounts` (pending → operator flips active). **(3) Ops**:
  CRON_SECRET set on Production+Preview (crons stop silent-401ing); pilot deployed +
  aliased **https://bellwood-hub-pilot.vercel.app** — Vercel Deployment Protection confirmed ON for
  previews (L0.2 done); prod demo untouched (200). **RD's remaining unblocks (all in
  `docs/OAUTH_SETUP.md`):** Entra app registration, Google OAuth client (+ test users), reset the
  bellwood-mayor DB password → DATABASE_URL + auth env vars into Vercel Preview. Known gaps logged in
  commit 9707b19 caveats: clean_text parity (TS stores stripped text; Python re-parity from RAW later),
  Graph sent-items TODO, mailbox stamp rides provenance until a mailbox column lands.

- **2026-07-02 (L0 slice built by agent workflow · hourly cadence + cabinet notifications)** — Four parallel
  agents (workflow `l0-lock-the-doors`, branch `live-pilot`) built the unblocked Phase-L0 pieces:
  **`migrations/003_rls.sql`** (RLS + anon/authenticated revocation across all 21 project tables, verified
  on local PG 17.5 incl. idempotent re-runs), **`004_audit.sql` + `lib/audit.ts`** (append-only
  `app.audit_log`; `logAudit()` wired into ask/email/approvals/agents-run/cron/queue — console in DEMO,
  never-throws INSERT live), **dormant Auth.js scaffold** (next-auth v5 beta; Entra ID + Google providers
  whose sign-in grant carries the mail-ingest scopes; `ALLOWED_EMAILS` fail-closed allowlist; middleware is
  a total no-op until `AUTH_ENABLED=1` — demo behavior verified unchanged), and **`005_user_state.sql`**
  (cross-device state + usage-events tables, RLS-on). **Product (RD direction): the anticipation loop** —
  agent-runs cron now hourly 7a–5p CT (`0 12-22 * * *` UTC; DST drift noted), and cabinet cards carry
  per-desk notifications: `freshAt` on every card, a per-agent "seen" store (`lib/agent-seen.ts`), a
  pulsing gold **new** pill + ring on unseen cards that clears when the digest opens; in DEMO one
  government desk deterministically "reports in" each hour (never the walled desk — eval-proven) so the
  cabinet varies visit to visit while content dates stay coherent. Notes published to Notion (Bellwood Hub
  → "Go-Live Plan — Constraints & Phases"). tsc + build + 5 eval suites green.

- **2026-07-02 (SHIPPED — rebuild pushed to git + Vercel prod · email-ingestion workstream spec'd)** — RD
  called "push": `main` fast-forwarded to `fad0e95` (52 files, +4,776 −382 across Phases 0–5), pushed to
  GitHub with the `rebuild/phase-1-domain-agents` branch preserved; deployed to Vercel production (project
  `web`, 41s build) — **https://web-seven-tawny-20.vercel.app/chief → 200**, prod verified serving the
  rebuild (6-seat cabinet incl. walled Harbor Wellness, Meyer leading needsYouNow, "Coming up" schedule
  card). Then spec'd the **email ingestion workstream** (`docs/EMAIL_INGESTION.md`): a reusable **10-stage
  Connector Delivery Process** (spec → consent → pull → land → normalize → canonicalize → index → verify →
  schedule → monitor, each gated) + Microsoft Graph (delegated Mail.Read) and Gmail (gmail.readonly)
  connector designs mapped onto the existing 5-step contract, mailbox wall (DEC-6), sensitivity routing
  (DEC-4), and Routines (DEC-10). Blocking prereqs called out (ISS-4 RLS, ISS-5 audit, TASK-7 rotation);
  six §8 decisions queued for RD (backfill window, consent model, attachments, worker split, vault,
  test-mailbox-first). ING-0…ING-5 board added; absorbs TASK-1 and backlog #3.

- **2026-07-02 (Rebuild Phase 5 — orchestrator + config-only proof · Gate 5 passed · design refinements)** —
  **The proof landed first, isolated** (commit `09094a4`): Harbor Wellness activated by flipping
  `active: true` + fixtures — 4 files, ZERO UI changes; the Private card, digest, identity avatar, and every
  wall-exclusion rule lit up from existing components (new worst-case eval: a RED walled run with a draft
  still can't reach needsYouNow or the footer). **Orchestrator**: `/api/cron/agent-runs` (CRON_SECRET-gated,
  scheduled 11:30 UTC weekdays, demo no-op) + `lib/agent-runner.ts` — per active agent: slice via
  deriveDomains → **memory-aware prompt** (charter/goals/urgency rules cached; open memory with occurrence
  counts + evidence ids injected so digests can say "3rd complaint at this address" citing PRIOR sources) →
  Claude (task `draft`/Sonnet; Opus behind eval evidence) → constitution validation + invented-citation
  guard → writes `agent_runs` + folds memoryOps (002 migration: source_message_ids now `text[]` of
  source_refs). Live SQL smoke-tests at canonical cutover (task #2). **Instrumentation** (the 4 numbers for
  RD's weekly session): open→first-tap, queue-clear duration, fix-it uses, digest opens per agent —
  localStorage ring buffer + console, surfaced as an operator readout on Staff Agents. **Design (RD refs)**:
  Schedule card now wears the "Coming up" calendar face — serif day numerals, today marked, "No events
  today" stated, then the next 3 EVENT days (walled business items provably absent) + links OUT to
  Outlook/Google Calendar (no calendar work in-app); "+ Add an agent" card ends the cabinet → integration-
  style type-picker grid (5 defined types, interview + connections preview, Builder arrives with RB-6);
  Ask input restyled as the floating pill. **Gate 5:** tsc + build clean · /chief → 200 · 5 eval suites
  green (26 orchestrator checks new) · (a)(b)(c) phone tests = RD's Fluency-session run with Mayor Harvey.

- **2026-07-02 (Rebuild Phase 4 — KNOW + nav collapse · Gate 4 passed · Agent Factory logged)** — **Mayor
  mode ships**: mobile bottom tabs and a minimal desktop rail with exactly three destinations — **Wall ·
  Queue · Ask** — plus a profile menu holding the persisted **Operator toggle** (reveals Emails, Calendar,
  History, Sources, Staff Agents, Approvals, Admin — everything relocated, nothing deleted; leaving
  Operator mode can't strand you on an operator screen). **Ask**: one entry point (FAB + topbar
  pseudo-search + duplicate bars removed), named "Ask" everywhere (AI Search label killed), 5 seeded
  questions that all land curated/mode answers, and **hold-to-talk** as the primary mobile control.
  **Thread view in-app**: new `ThreadView` renders citations inside the shell (desktop right panel, mobile
  sheet) with entity chips, "View sender in History", and an honest reply path ("reply drafted → open
  Queue" for hero threads; otherwise states that live drafting lands in Phase 5); the light-theme /email
  page replaced by the same component + theme (deep links + MCP intact). **History**: entity kinds
  normalized at the provider (IDOT/county orgs are no longer "person"), type filter + search on both
  operator lists, desktop timeline rows now open the source. **Push layer**: /api/cron/needs-you payload
  repointed to `getWall()` — "1 urgent: {headline} · 3 drafts ready · ≈5 min" + /chief deep link.
  **Gate 4:** tsc + build clean · /chief and /email → 200 · eval 15 know + 17 queue + 29 wall + 38 routing
  checks green · RD confirms the 3-tab feel on phone. **Also:** RD's agent-creation direction captured as
  **DEC-12 + `docs/rebuild/AGENT_FACTORY.md`** (RB-6): interview-onboarded, registry-row agents built by an
  Agent Builder agent under a fixed constitution + growable type templates.

- **2026-07-01 (Rebuild Phase 3 — ACT: the Queue · Gate 3 passed + design pass)** — **The Queue** ships on
  both shells: `web/lib/queue.ts` (union of agent actItems + pending drafts store, deduped by thread — 3
  items not 6; stable ids = draftIds so approve/discard ride the existing /api/approvals) + `/api/queue` +
  `QueueScreen` (mobile: one card at a time; desktop: list+detail). Three thumb actions: **Approve & send**
  (optimistic, 15s undo toast, then demo fake-send), **Fix it** (typed or spoken note via the existing
  /api/transcribe with the iOS audio/mp4 guard; demo simulation appends a visible "Mayor's revision note"
  and returns the card to the top labeled *revised*), **Skip** (bottom, never deleted). Full body always
  (invariant 6): long drafts start collapsed on mobile and Approve unlocks after one expansion. Resumability
  (invariant 7): `lib/queue-state.ts` persists states/skips/revisions in localStorage `bw-queue-state`,
  interrupted revision passes resume on reload, "While you were out" diffs item ids. Wall Approve rows +
  digest sheets now deep-link to the Queue; Queue added to both navs. **Design pass (RD direction, Granola
  reference):** default theme → **daylight, rewarmed to cream paper**; Wall hero = letterhead card with the
  real Village bell logo (web/public/bellwood.webp) bleeding off the right edge; **agent identity system**
  — each domain agent has a color + emblem (`domain-agents.ts color`, `AgentBadge.tsx` solid-circle
  avatars/chips) used on cabinet cards, needs-you chips, digest sheets, and queue provenance — identity is
  the recognition channel, urgency (red/yellow/green) stays the action channel; serif section headings;
  reading sizes up. Also fixed `/email` "Back to the Hub" → now returns to `/chief`. **Gate 3:** tsc +
  build clean · `/chief` → 200 · eval 17 queue + 29 wall + 38 routing checks green · RD to time the
  end-to-end phone run (approve→fix-it→skip in under 2 min) and confirm refresh-mid-queue resume.

- **2026-07-01 (Rebuild Phase 2 — LOOK: the Wall · Gate 2 passed)** — The Mayor's default screen is now
  **the Wall** on mobile AND desktop (same commit series): **`web/lib/wall.ts` `getWall()`** — the ONE
  provider behind everything visible (invariant 9). needsYouNow: global rank red→yellow by recency, MAX 3,
  **deduped by thread overlap** — the Pawlak bar-noise thread renders once with merged police+constituent
  chips (dual-domain proof); primary caption prefers the constituent's inbound message over the department
  reply. Cabinet cards (status dot / headline / "X new · Y need you" / "updated Nm ago") → tap opens
  **`AgentDigestSheet`** (bottom sheet mobile, right panel desktop) with cited digest bullets → source
  drill-in, ending in "N drafts ready → Approve". Footer: "22 handled · 3 waiting · ≈5 min". **Single demo
  clock** (Gate-0 decision #2): `DEMO_NOW`/`demoToday()` anchored to the fixture window; `CURRENT_DATE`
  now derives from it; greeting is one sober time-coherent line (no weather, no coffee, no exclamations).
  **Deleted the fake-count class:** sidebar Calendar "8", Approvals "3", Emails red dot, "70,431 messages /
  4/6 connectors" card, topbar "synced 4m ago", Approvals `|| 3` fallback. Walled rule enforced in the
  provider: walled agents never enter needsYouNow or the footer (eval-proven on the Phase-5 flip path).
  TodayScreen retired from both shells (weather/on-this-day/inbox preview off the Mayor's default; the
  component + /api/morning-summary remain for the Phase-4 cron repoint). **Gate 2:** tsc + build clean ·
  `/chief` → 200 · eval `wall.test.ts` 28 checks + `derive-domains.test.ts` 38 checks green · RD confirms
  look-and-feel on phone (tool can't screenshot mobile). Next: RB-3, the Queue.

- **2026-07-01 (Rebuild Phase 1 — domain-agent core · Gate 1 passed)** — Built the lib layer for the
  Mayor's cabinet on branch `rebuild/phase-1-domain-agents` (no UI yet): **`web/lib/domain-agents.ts`**
  (7-agent registry — police/fire observe, council/schedule suggest, constituent draft-workhorse, hr +
  harbor-wellness inactive; harbor-wellness walled with `scopeEntities`, the Phase 5 config-only proof);
  **`deriveDomains()`** in `topics.ts` (multi-label stream→agent routing + clerk/agenda council rule +
  entity-scope hits; `deriveStream` untouched); **`web/lib/agent-run.ts`** (zod-validated AgentRunOutput —
  headline/urgency/cited digest/actItems/memoryOps; runner-enforced: actItems rejected unless autonomy
  is `draft`, commitments close only by evidence or explicit mayor action); **`migrations/
  002_domain_agents.sql`** (canonical.agent_memory + agent_runs, idempotent); DEMO fixtures
  (`demo/data/domain-agents.ts` + `agent-memory.ts`) — one convincing run per active agent on the hero
  scenarios, constituent actItems = the three seeded drafts **re-signed Mayor Merrill Bellwood** (Gate 0
  decision), and the El Faro bar-noise blotter cited in BOTH police + constituent digests (the Phase 2
  dedup proof); temp **`/api/agents/run?demo=1`** gate route that re-validates fixtures on serve.
  **Gate 1:** `tsc --noEmit` clean · `npm run build` clean · `/chief` → 200 · 38 checks green in
  `web/eval/derive-domains.test.ts` incl. every fixture citation resolving against the demo corpora.
  Next: RB-2, the Wall.

- **2026-07-01 (Look·Act·Know rebuild — Phase 0 ground-truth map)** — Started the rebuild of the Mayor-facing
  app around three jobs (LOOK = Wall, ACT = Queue, KNOW = Ask) per the master prompt. Survey pass only, no code
  changes: **`docs/rebuild/PHASE0_MAP.md`** inventories every reachable screen (mobile + desktop, with drift
  notes) and maps each to Wall/Queue/Ask/Operator; every `/api` route × which rebuild phase touches it; every
  count/date computation site (root cause of the coherence bugs: hardcoded literals — e.g. the sidebar Calendar
  badge `8` at `ChiefApp.tsx:199` — plus two "todays": fixture `CURRENT_DATE=2026-06-28` vs real clock; both
  "coffee this evening" code paths located). Persona set confirmed (Merrill Bellwood gov Outlook · Harbor
  Wellness Dispensary, Cary IL walled Gmail — fixtured well enough to be the Phase 5 entity-scoped proof agent),
  with two fixture discrepancies flagged: gov drafts signed "Mayor Daniel R. Okonkwo", and the
  `bellwood-demo.gov` vs `villageofbellwood.gov` domain split that would misclassify registry-domain mail as
  Resident in `deriveStream`. **Gate 0: awaiting RD skim of the map (6 decisions in §6) before Phase 1 begins.**

- **2026-06-29 (Email agents · Active/Inactive · agent specs in repo)** — Email ingestion is now modeled as
  **agents**: added the **Outlook Email Agent** (Government mailbox · Microsoft Graph · FOIA-scoped) and the
  **Gmail Email Agent** (walled Business mailbox · private), both R1 read-only, with email-pull **routines**
  (every 5 min). Staff Agents now read **Active / Inactive** with distinct colours — green ● Active vs grey ○
  Inactive, inactive cards dimmed. Each agent's **deep jobs/roles live in versioned `.md` specs** under
  `docs/agents/` (registry holds a lightweight summary + a `spec` pointer) so the team scales without bloating
  the UI (DEC-11). Plus: Today hero shows a **plain loading banner** until the briefing resolves (no "Good
  morning" flash), a **desktop Ask FAB** (lower-right) with the feedback button lifted above it, and the
  **Routines** Admin tab (FEAT-16). Many prod deploys.
- **2026-06-28 (Today polish · time-of-day life · feedback · planning)** — Iterated the Today screen on
  device: **bright sunrise banner** with a Village of Bellwood seal watermark, at-a-glance **weather** +
  **on-this-day**, tighter ~4-line briefing, and an **agent-generated persona greeting** that's varied each
  load (JSON output, temp 0.9) and time-aware, with a deterministic keyless fallback. **Editable draft
  approvals** (edit → save → approve) via a shared `DraftCard` + `/api/approvals` `save`; wired into Today
  "To sign" + mobile "Agent Answered". **Voice-enabled feedback button** in the footer (type or talk →
  `/api/feedback`). **Auto · time-of-day theme** (new default): 4 new palettes (morning/midday/evening/night)
  that shift by the hour; the banner + greeting move with the day; manual themes still pin. Fixed iOS text
  auto-inflation (oversized fonts) + wrapped the "most important" titles. **Planning:** logged DEC-8/DEC-9 and
  FEAT-14 (multi-customer / per-tenant config; scaffolded `lib/tenant.ts`) + FEAT-15 (feedback → Supabase +
  portal section) as post-launch workstreams. Many incremental prod deploys.
- **2026-06-28 (Today screen + Chief of Staff agent)** — Built the Mayor's **landing screen**: a
  "Good morning, Mayor Harvey" Chief-of-Staff briefing as the default Home view (mobile + desktop). A new
  **R4 Chief of Staff agent** (`cos-agents.ts`) reads every other agent's output + the inbox + the
  consolidated calendar and folds it into one **spoken-style briefing** — what happened / what's new /
  what's important — then surfaces the day's calendar and the **drafts to sign (approve inline)** before
  the Mayor ever opens the inbox (the "see + act" idea: greet → brief → calendar → sign the checks →
  inbox). Sections link out to the full Emails/Calendar/Approvals pages. **Hybrid generation**
  (`/api/morning-summary` + `demoMorningSummary`): a deterministic baseline always renders keyless; the
  persona voice is synthesized via OpenAI when a key is present. **Persona is configurable** in
  Admin → Chief of Staff (mayor name, greeting template, tone Warm/Formal/Brisk, freeform personality
  instructions; saved to localStorage, passed to the API). New `lib/morning.ts` contract; new
  `components/chief/TodayScreen.tsx` shared by both layouts. Also embedded the live PM status dashboard
  inline in Admin → Project Status (was a link). Typecheck + build clean. Logged FEAT-13 + DEC-7.
- **2026-06-28 (mobile nav polish + status page)** — Mobile navigation reworked: **hamburger menu** nav with a
  single consolidated **Ask** button; **Staff Agents** promoted to a first-class mobile tab (was buried under
  Source) with Agents + Admin surfaced at the top of the Source tab. PM **status page reformatted** as a light
  report and `status.json` repaired. Polish pass — no scope change.
- **2026-06-27 (Gmail business records + consolidated calendar)** — Expanded the walled Gmail account: added
  dispensary-business emails (Harbor Wellness Dispensary, Cary IL — IDFPR license, METRC, Brink's cash, Cresco
  wholesale, dispensary mgr) + social/charity invites (Ed Foundation gala, Rotary golf, Chamber awards, food
  pantry, family birthday). New **Gmail calendar** fixture (`gmail-calendar.json`). The **Calendar is now
  consolidated** across Government (Outlook) + Business (Gmail) — the Chief-of-Staff "whole day" view — with a
  source filter (All/Government/Business), per-event source badges (Outlook blue / Gmail purple), a forward
  agenda anchored on **today**, and day-dots colored by source. Mobile + desktop. Events carry `source`;
  `demoEvents()` merges both calendars. FEAT-12 extended.
- **2026-06-27 (Voice search fix + searching progress)** — Fixed the **mic not returning**: iOS Safari records
  `audio/mp4` but the upload was hardcoded `speech.webm`, so OpenAI rejected the format. Now the filename
  extension is derived from the real MIME (`audioExt`) on mobile + desktop, and failures surface a message
  instead of silently dying. Added **live progress**: a pulsing status pill (Listening… / Transcribing… /
  Searching the record…), the mic spins while transcribing, and the **Ask button pulses "Searching…"** while a
  query runs. `BUG-2` opened+closed.
- **2026-06-27 (Voice "thank you for watching" fix)** — `BUG-3`: silent/near-silent clips made Whisper
  hallucinate stock phrases ("thank you for watching", "please subscribe"). Now `/api/transcribe` rejects tiny
  clips (<1.6KB), runs at `temperature 0`, and filters a list of known hallucination phrases → returns
  `{empty:true}`; the client also size-guards before sending and shows "Didn't catch any speech…". Fixed.
- **2026-06-27 (Ask = broad corpus search, not just email)** — AI Search now retrieves across the **whole
  record**, not the inbox: emails **+** non-email documents (fire/EMS reports, police reports, permits, code
  cases, Public Works inspections, board minutes, FOIA) **+** any freshly-ingested uploads (passed from the
  client store, so the progress bar's "Indexed — searchable" is true end-to-end). New
  `lib/demo/data/corpus-docs.json` (9 seeded documents themed to existing issues e.g. Eastern Ave flooding,
  so answers go cross-source); `Source.docKind` added; cited results badge **Email** vs the document type and
  drill to the full source (uploads drill in from the client store on mobile). Synthesis prompt + copy
  generalized from "mailbox/email" to "the village record." Walled business mail stays excluded. Typecheck +
  build clean.
- **2026-06-27 (Upload Source · corpus progress bar)** — Added a staged **progress bar** on commit in the
  Upload Source flow: a new "Adding to corpus" step animates the 5-step ingest pipeline (Storing original →
  Writing canonical record → Resolving people & places → Classifying topic/stream → Embedding for AI Search →
  Indexed/searchable) with a % bar. Demo-timed; in production each row reflects a real stage event (embed =
  becomes searchable). The record is written to the store only after the run completes.
- **2026-06-27 (Calendar desktop/mobile parity)** — Desktop Calendar diverged from mobile; reconciled
  **desktop → mobile** (RD's call). Desktop now has the **horizontal date strip** + **Calendar | Events
  & Meetings** toggle, matching mobile; status filters (All/Open/Overdue/Done) moved into the Events &
  Meetings view. Both form factors now share the same calendar model.
- **2026-06-27 (Multiple mailboxes · source-system filter, Phase 1)** — Planned + shipped the demo for
  multi-mailbox. The Emails screen now has a **mailbox switcher** (Government / Business) — the mayor filters
  his inbox by "source system." **Government** = the Outlook seed (default, public record); **Business** = a
  new walled **Gmail** fixture (`lib/demo/data/business-inbox.json`) that's private, not FOIA-indexed, and
  excluded from default AI Search (DEC-6). New `lib/mailboxes.ts` registry; `/api/inbox?mailbox=` scoping;
  `demoEmail` drills into business docs; Sources page lists connected mailboxes (Outlook/Gmail) with an Add-
  mailbox affordance. Logged FEAT-12 + DEC-6. Typecheck + build clean.
- **2026-06-27 (Upload Source · agent ingestion, Phase 1)** — Shipped the agent-driven **Upload
  Source** flow on the Sources page (mobile + desktop): pick source type → drop file → Ingestion
  Agent drafts the record → **R3 review/categorize form** → commit. Grounded the form on the real
  canonical model (Envelope → messages / entity_aliases / message_topics / chunks) after mapping the
  schema. New: `lib/source-types.ts` (registry + simulated extraction), `lib/ingested-sources.ts`
  (demo store), `components/chief/UploadSource.tsx`. **Storage routes by sensitivity (DEC-4):**
  restricted (police/CJIS) → secured AWS store (FEAT-11, pointer-only); else Supabase Storage; demo
  persists nothing real. Logged FEAT-11 (secured S3) as a project feature. Typecheck + build clean.
- **2026-06-27 (kickoff + mobile polish)** — PM skill gained a **Project Kickoff** (PMP-certified
  Sr. PM interview → Project Charter in PROJECT.md). Added a **temporary Project Status tab** under
  Admin linking to the live PM dashboard. Mobile: **swipe-down (pull-to-refresh)** on the main
  screens — rubber-band pull, gold spinner, remounts the active screen to refetch.
- **2026-06-27 (UX sprint)** — Heavy demo-UX iteration. Jobs-to-be-done renames (Brief→Emails,
  Events→Calendar, Memory→History, Ask→AI Search, Agents→Staff Agents). Emails = dense inbox
  with **agent email categories** (Urgent/Important/Social/Spam/Inbox) + drill-to-source.
  **Calendar** = horizontal date strip. **AI Search** shows recent searches. **Staff Agents**
  landing page (click → recent activity) + HR agent; agents are an extensible team. **Sources**
  per-connector activity/sync log. Sample data **refreshed to today**. API-cost bold. Captured a
  large backlog: Agent Activity page (FEAT-6), Calendar save-layout (FEAT-7), Outlook calendar
  (TASK-11), Area views (FEAT-3), audit trail (ISS-5), security audit (TASK-10). North-Star
  vision recorded (VIS-2): one place to look/search/build the day; configurable Area views.
- **2026-06-26 (session 2)** — Deployed the app to Vercel (public URL); built the dedicated
  **mobile UI** (bottom-nav, ≤768px) and rearchitected it around jobs-to-be-done (Emails /
  Events / Search / History / Source); added a **theme switcher** (4 accessible schemes);
  made **every email clickable to its full source document** (`/api/email` from Postgres);
  made the **PM dashboard mobile-responsive**; added **home-screen icons** (🇺🇸 flag for the
  app, 📅 calendar for the dashboard, PWA manifests). PM skill upgraded: intake (log
  task/bug/issue/risk/dependency), session sweep, item details, HTML status page auto-published on git push.
- **2026-06-26 (build session)** — Stood up the full hybrid mayor demo on the 30k seed.
  Schema applied to BellwoodHub; `/`→`/chief`; OpenAI/Voyage/service-role/DB keys wired
  (session pooler, IPv4). Built keyless JSON demo layer (brief/memory/sources/approvals/
  dashboard fixtures + 31MB search index), hybrid Ask (keyword + live OpenAI synthesis +
  curated hero answers + aggregates), and voice search (mic → Whisper). Loaded the live
  Postgres path in parallel: 30,641 emails, 30,831 embedded chunks, 151,109 entities —
  ready as a `DEMO_MODE=0` toggle. **JSON kept as the demo default per RD.** Created the
  reusable `project-manager` skill.

- **2026-06-26** — Synced repo, ran installs (Python venv + web npm), scaffolded env files,
  stood up this PM doc + 6-task board. Setup blocked on credentials.
