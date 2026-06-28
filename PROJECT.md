# Bellwood Hub — Project Manager

> **"Ask the PM"** → read this file. It is the single source of truth for project
> status, outstanding tasks, blockers, and decisions. Keep it current: when a task
> changes state, update the table and the changelog at the bottom.
>
> The live session task list (TaskCreate/TaskList) mirrors the **Task Board** below.
> This file is the durable copy that survives across sessions.

**📡 Shareable status page (live):** https://project-status-ten.vercel.app — public, no login. Source: `project-status/index.html`. Redeploy: `vercel deploy --prod --yes --cwd project-status`.
**Last updated:** 2026-06-28
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
| FEAT-10 | Agent-driven **Upload Source** ingestion | 🔵 Phase 1 done | **Phase 1 (demo-safe) shipped:** "Upload Source" button on Sources (mobile + desktop) → pick type → drop file → simulated agent draft → R3 review/categorize form → in-memory commit, surfaced as "Agent-ingested this session". Source-type registry: Fire/EMS, Police (restricted→secured store), Permit, General. Maps 1:1 to messages/entity_aliases/message_topics/chunks. **Next:** Phase 2 real OpenAI-vision parse · Phase 3 canonical writes · Phase 4 Voyage embed · Phase 5 FEAT-11 secured S3. |
| FEAT-12 | **Multiple mailboxes** + source-system filter | 🔵 Phase 1 done | Mayor's Government (Outlook) + Business (Gmail) accounts as a filterable "source system" on the Emails screen. New `lib/mailboxes.ts` registry + `mailbox_id` dimension; demo splits seed = Government, adds a walled Gmail business fixture. **Business is walled (DEC-6):** private, not FOIA-indexed, excluded from default AI Search. **Next:** Phase 2 Outlook (Graph) connector · Phase 3 Gmail connector · per-mailbox OAuth (read-only) + canonical.mailboxes table. |
| FEAT-11 | **Secured AWS document store** (S3, encrypted) | ⚪ pending | Per-source/sensitivity storage routing: `restricted` originals (e.g. police) go to a secured, access-controlled S3 bucket — `messages.raw_ref` points there; app holds only searchable metadata/RAG, not the file. `public/internal` may use Supabase Storage. Demo: restricted = memory-only. |
| FEAT-13 | **Today screen + Chief of Staff agent** | 🔵 shipped+ | "Good morning, Mayor Harvey" landing (mobile + desktop): **agent-generated, time-aware persona greeting** (varied) + briefing + today's calendar + **editable sign-to-approve** drafts + inbox preview. Bright **time-of-day banner** (sunrise→midday→dusk→night) + seal + weather + on-this-day. New R4 Chief of Staff agent. Hybrid keyless/OpenAI. Persona configurable. **Next:** the **Morning Agent** (web-search query cards) · verbal/TTS. |
| FEAT-14 | **Multi-customer / white-label** (per-tenant config) | ⚪ planned · post-launch | Shared repo + `lib/tenant.ts` (scaffold shipped) selected by `NEXT_PUBLIC_TENANT`; **one Vercel project + isolated Supabase per customer** (DEC-9). **Tasks:** (1) extend tenant config to branding/seal/title/persona/feedback-repo + wire all consumers; (2) per-tenant mailboxes + `SOURCES_DEFAULT`; (3) per-tenant demo fixtures + search index; (4) per-tenant live env (DATABASE_URL/keys/mailboxes); (5) add customer #2 + its Vercel project + write the "add a customer" runbook. **RD builds after Bellwood launch.** |
| FEAT-15 | **User feedback → Supabase + portal section** | ⚪ planned | Persist in-app Quick Notes durably + surface them on the portal (DEC-8). **Tasks:** (1) `feedback` table migration in BellwoodHub (same DB connection); (2) `/api/feedback` writes to Supabase when connected, in-memory demo fallback; (3) app prod env gets the Supabase/DB connection (infra step); (4) **"User Feedback & Comments"** section on the Project Status portal (`build-status.mjs` reads the table); (5) triage `status` field + optional GitHub/Linear forward. |

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
