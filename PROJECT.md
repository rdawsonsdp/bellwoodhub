# Bellwood Hub — Project Manager

> **"Ask the PM"** → read this file. It is the single source of truth for project
> status, outstanding tasks, blockers, and decisions. Keep it current: when a task
> changes state, update the table and the changelog at the bottom.
>
> The live session task list (TaskCreate/TaskList) mirrors the **Task Board** below.
> This file is the durable copy that survives across sessions.

**📡 Shareable status page (live):** https://project-status-ten.vercel.app — public, no login. Source: `project-status/index.html`. Redeploy: `vercel deploy --prod --yes --cwd project-status`.
**Last updated:** 2026-06-26
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

**Post-demo product work — pending:**
| # | Task | Status | Notes |
|---|------|--------|-------|
| TASK-1 | Capture Outlook data for the Mayor's mailbox | ⚪ pending | Exchange/Microsoft Graph connector → ingest pipeline (real data). Logged 2026-06-26. Relates to #3 |
| 2 | Backfill + cut over to canonical | ⚪ pending | poc is loaded; canonical not backfilled. Flip `RETRIEVAL_BACKEND=canonical` |
| 3 | First real email connector (IMAP/Gmail) | ⚪ pending | only `synthetic_email.py` exists |
| 4 | Send capability (R3) | ⚪ pending | approve records decision, doesn't send |
| 5 | Full Morning Brief | ⚪ pending | `needsYouToday()` is the precursor |
| 6 | Expand eval harness | ⚪ pending | 5 → meaningful set |

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

- **`VIS-1` Direction (2026-06-26)** — This becomes an **agent that connects to other agents**
  (agent-to-agent / MCP). The capability agents + MCP server are the foundation.
- **`DEC-1` (2026-06-26)** — Kept the JSON demo as default (`DEMO_MODE=1`) over the live DB for demo reliability.
- **`DEC-2` (2026-06-26)** — Connect via the Supabase **Session Pooler** (IPv4); no IPv4 add-on needed.
- **`DEC-3` (2026-06-26)** — Fixed the `message_topics` RLS migration bug so the schema applies cleanly.
- **2026-06-26** — Default `RETRIEVAL_BACKEND=poc` kept for the live demo; canonical
  cutover deferred until backfilled + eval-validated.
- **2026-06-26** — Project synced locally; chose in-place `git init` + fetch to preserve
  the existing `.claude/` folder.

---

## Changelog

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
