# Go-Live Plan — from stage set to everyday tool

> RD direction 2026-07-02: "I will use my own emails to build a live email box…
> We need to start to tighten this up." This plan addresses the four constraint
> layers in dependency order. Pilot data source: **RD's own mailbox** (the
> test-mailbox-first recommendation from docs/EMAIL_INGESTION.md §8.6, with RD
> as the test subject). Same delivery process as everything else: phase →
> gate → RD review.

## The one architectural decision that protects the demo

**Production stays the keyless demo. The pilot lives on a separate environment.**

- **Production** (web-seven-tawny-20…/chief): `DEMO_MODE=1`, no DB, no keys —
  the mayor-ready demo, untouched and unbreakable.
- **Pilot** (`live-pilot` branch → Vercel *Preview* environment): its own env
  vars — `DATABASE_URL` (a NEW Supabase project for RD's real mail; never the
  synthetic demo DB, and never commingled per DEC-9), all model keys, auth
  secrets, OAuth clients. Deployment Protection ON from day one, because real
  mail lands here.
- Production flips to live only when Gate L-final passes — a deliberate,
  reversible cutover, not a drift.

---

## Phase L0 — Lock the doors (constraint 2: trust infrastructure)

Nothing real enters until this is done. ~Small, mostly config + one auth build.

| # | Task | Notes |
|---|---|---|
| L0.1 | **App login** — Auth.js (NextAuth) with the Microsoft Entra ID *and* Google providers; session required by Next middleware for every page + `/api/*` except `/api/cron/*` (CRON_SECRET) and `/api/[transport]` (MCP_SECRET). Authz = `ALLOWED_EMAILS` allowlist (RD, later the Mayor). | The sign-in provider **doubles as the mail-consent flow**: the same OAuth grant that logs RD in carries `Mail.Read` (Graph) or `gmail.readonly` scopes + refresh token — login and ING-1 consent are ONE build. This closes the biggest unplanned gap (no auth ticket existed). |
| L0.2 | **Deployment Protection** on the pilot env (Vercel Authentication, Standard) | Belt + braces under L0.1. Caveats below in the Vercel section. |
| L0.3 | **RLS everywhere** (ISS-4) — migration `003_rls.sql`: enable RLS + deny-all policies on all `poc.*`, `canonical.*`, `pipeline.*`, `app.*` tables | The app connects with the service role (bypasses RLS) so nothing breaks; the anon-key hole closes. |
| L0.4 | **Audit ledger** (ISS-5) — migration `004_audit.sql`: `app.audit_log(actor, action, object_type, object_ref, at, meta jsonb)` append-only + `logAudit()` wired into Ask queries, email opens, approve/discard/fix-it, agent runs, ingest runs | Minimal viable audit: every read and decision leaves a row. FOIA/Open Meetings + the Mayor's own defense. |
| L0.5 | **Key hygiene** (TASK-7/RSK-1) — rotate OpenAI/Voyage/Anthropic/DB keys as they're entered into Vercel env; kill every plaintext copy | Rotation happens AT env-setup time so old shared keys never reach the pilot. |
| L0.6 | Set `CRON_SECRET` + decide `MCP_SECRET` | Crons have been 401-ing silently (secret never set). MCP: setting a secret breaks the existing claude.ai connector until re-configured with `?k=` — coordinate, don't surprise. |

**Gate L0:** hitting any pilot URL logged-out → sign-in; signed in as a
non-allowlisted account → 403; Supabase advisors show zero RLS warnings;
`audit_log` rows appear for an Ask + an approve; old keys revoked.

## Phase L1 — RD's mail flows, actions become real (constraint 1)

Executes ING-1→4 against RD's mailbox, then makes Approve mean something.

| # | Task | Notes |
|---|---|---|
| L1.1 | OAuth app registration for RD's provider (Entra app or Google Cloud client) + Auth.js wiring (L0.1) captures the refresh token | **RD input needed: is rdawson@strategicdataproducts.com M365 or Google Workspace?** That decides which connector goes first; the other follows the same contract. |
| L1.2 | New Supabase project `bellwood-pilot`; apply migrations (schema + 002/003/004) | Session-pooler (IPv4) connection string, per the house gotcha. |
| L1.3 | Backfill (recommend 12 months) → RAW → Envelope (`clean_text`) → canonical → Voyage embeddings; reconciliation counts at each hop | ING-2/3/4 on real data. Python pipeline for the one-shot; TS route for incremental. |
| L1.4 | Incremental sync cron (`/api/cron/ingest-email`, 5-min routine per DEC-10) with delta tokens / historyId | The Sources screen's connector health becomes real here. |
| L1.5 | `RETRIEVAL_BACKEND=canonical` on the pilot; Ask/Wall/Queue over real mail | deriveDomains will route most SDP mail → constituent (its domain rules are Bellwood-specific) — acceptable for the pilot; per-tenant routing config is a fast follow. |
| L1.6 | **First live agent runs**: `/api/cron/agent-runs` against the pilot DB; verify memory upserts, citation guard, run quality by hand | The runner's first real execution — expect prompt iteration here. |
| L1.7 | **Real send (#4), safety-caged**: Graph `Mail.Send` / Gmail send added as a SEPARATE consent; approve → actually sends, but only when `SEND_ENABLED=1` AND recipient ∈ `SAFE_SEND_ALLOWLIST` (initially just RD's own address) | Approve stops being theater; the cage means a runaway agent can only ever email RD. Undo window stays. |

**Gate L1 (the day-two test):** two consecutive mornings show *different,
real* Wall content from RD's actual inbox; an approved draft arrives in RD's
inbox as a sent email; a fix-it note revises via the live model path; every
action has an audit row.

## Phase L2 — the return trip + one state of truth (constraint 3)

| # | Task | Notes |
|---|---|---|
| L2.1 | **Morning digest delivery, v1 = email**: 7 AM cron sends `wallPushLine()` + top items as an email (uses L1.7 send) with a deep link | Ships in a day once send exists; the habit-forming nudge. |
| L2.2 | **Web Push v2**: service worker + push subscription; iOS 16.4+ supports push for installed PWAs (the home-screen icon already exists) | Falls back to email where push is denied. |
| L2.3 | **Server-side user state**: `app.user_state(user_email, key, value)` replaces localStorage for queue state, operator mode, persona; `app.usage_events` replaces the metrics ring buffer | Phone and desktop finally agree; needs L0.1 identity. localStorage stays as offline write-through cache. |
| L2.4 | **Offline shell**: service worker caches the app shell + last wall/queue payloads (stale-while-revalidate) | The parade-route/basement case: stale-but-present beats blank. |

**Gate L2:** approve on the phone → desktop reflects it on refresh; the 7 AM
email arrives; airplane-mode cold open renders yesterday's Wall with a
"stale" marker.

## Phase L3 — earned intelligence (constraint 4)

| # | Task | Notes |
|---|---|---|
| L3.1 | Memory verified on real runs: occurrence counts climb across days; commitments close only by evidence (watch it happen on real threads) | |
| L3.2 | **Fix-it → style memory**: after every N fix-its, a distillation step writes durable `pattern` items ("firmer dates; route drainage to DiMeo") injected into future drafting | The piece that makes correction compound. |
| L3.3 | **Evidence engine**: eval set 5 → 50+ questions with RD-confirmed answers from his real mail; automatic gates (schema-valid rate, citation-resolution rate) run as a weekly cron; results feed agent promotion (DEC-12's "evidence") | |
| L3.4 | Retire the 31MB in-bundle index on live envs (pgvector serves); demo build keeps it. Fixes BUG-1 for live + cold-start weight | |

**Gate L3:** an agent digest cites a prior-week message unprompted ("3rd time
this month"); the eval dashboard shows a trend line; a deliberate promotion
(constituent observe→draft equivalent for a new agent) is justified by eval
numbers, not vibes.

---

## Vercel configuration (the concrete advice)

1. **Environments** — keep Production demo-locked; put ALL live secrets on
   **Preview** scoped to the `live-pilot` branch (`vercel env add KEY preview`).
   Vars: `DATABASE_URL` (pilot Supabase pooler), `ANTHROPIC_API_KEY`,
   `OPENAI_API_KEY`, `VOYAGE_API_KEY`, `AUTH_SECRET`, provider client
   ids/secrets, `ALLOWED_EMAILS`, `CRON_SECRET`, `SEND_ENABLED`,
   `SAFE_SEND_ALLOWLIST`, and `DEMO_MODE=0`. Production keeps `DEMO_MODE=1`
   and — deliberately — no `DATABASE_URL`.
2. **Deployment Protection** — enable **Vercel Authentication** for
   Preview/pilot now (dashboard → Settings → Deployment Protection). Two
   caveats: Vercel Cron invocations bypass protection automatically, but the
   **MCP connector and any external webhook will need the Protection Bypass
   for Automation secret** — or stay excluded until Production hardening.
3. **Region alignment** — `vercel.json` pins `iad1` (Virginia) but Supabase is
   `us-west-2` (Oregon): every query pays ~70 ms cross-country. When the live
   DB becomes primary, move functions to `["sfo1"]`/`["pdx1"]` or place the
   pilot Supabase in `us-east-1`. Chatty routes (agent runs, backfill) feel
   this most.
4. **Crons** — three are scheduled; they've been failing 401 silently because
   `CRON_SECRET` was never set. Set it per environment. Function
   `maxDuration = 300` is already supported on the current plan defaults.
5. **Deploy discipline** — stop deploying straight to production once the
   Mayor uses it daily: PR → preview URL → verify → merge = prod (or
   `vercel deploy` + promote). We've been shipping direct during the demo
   phase; L0 is the moment to formalize.
6. **Observability** — turn on Log Drains/Alerts for the pilot (cron failures
   must page, not vanish); watch Active-CPU usage once agent runs go live
   (six model calls per cabinet pass is cheap, but alerts beat surprises).
7. **Bundle** — `outputFileTracingIncludes` ships the 31MB index into every
   function today. Live envs should exclude it (L3.4); interim, know that it
   is the single biggest cold-start weight — relevant to the 5-second LOOK rule.

## What only RD can do (the unblock list)

1. Answer: **M365 or Google Workspace** for rdawson@strategicdataproducts.com?
2. Create the OAuth app (Entra ID or Google Cloud) — I'll spec the exact
   scopes/redirects when (1) is answered.
3. Create the `bellwood-pilot` Supabase project (or hand me an org invite).
4. Fresh API keys at env-entry time (rotation moment).
5. Dashboard toggles: Deployment Protection; Log Alerts.

Multi-user roles and the FOIA-discoverability/retention question stay parked
as registered risks (SEC-2, LGL-1) — they gate the *Mayor's* real mailbox,
not RD's pilot.
