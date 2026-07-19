# Bellwood Hub — Technical Summary (2026-07-19)

> A handoff document for reviewing the current state in a fresh agent session.
> Written against the real repo state, not memory. Branch:
> `agent-focus-and-sync-fixes` (15 commits ahead of `main` at `db0e488`,
> **pushed, not merged**). `main` deploys straight to the Mayor's live site, so
> nothing here has shipped to production.

---

## 1. What this project is

An AI "Chief of Staff" for a municipal mayor. It ingests a mailbox (and now
Google Drive), lands every message into a canonical Postgres+pgvector store, and
runs a team of **agents** over it that produce cited digests on a **Hub**
screen. A separate **Ask** path answers plain-English questions over the whole
corpus with citations.

The two-week arc of this branch: agents went from **hardcoded code artifacts** to
**things a user creates and instructs in the app**, and the data layer went from
**email-only** to **source-agnostic**.

**Stack:** Next.js 14 App Router (`web/`), TypeScript, inline-style design
tokens (no CSS framework), Supabase Postgres + pgvector, Voyage `voyage-4-large`
(1024-d) embeddings, Anthropic (Haiku classify / Sonnet synth), Auth.js v5
(Google + Microsoft), Vercel cron. Everything has a keyless **DEMO_MODE** path.

---

## 2. The core data flow (unchanged foundation)

```
OAuth sign-in vaults a refresh token
  → cron/ingest-email pulls new mail (Gmail/Graph connector)
  → landMessage(): RAW → staged → canonical.messages   (steps 1–2 of 5)
  → cron/embed-mail: chunk + Voyage embed → canonical.chunks
  → agents read canonical + chunks; Ask queries the same store
```

- `canonical.messages` is the record; `canonical.chunks` holds the 1024-d
  vectors. A file/email/whatever is a **record**; retrieval never asks where it
  came from.
- **Live ingest stops at step 2 of 5** — no entity resolution, no
  `message_topics`, no classify/fold on the live path. This is why routing by
  topic label doesn't work on live mail, and why **semantic focus** (below) is
  the mechanism that actually functions.
- **Two retrieval paths, and they differ in quality:**
  - **Ask** uses `lib/planner.ts` — a **3-pass fused retrieval** (structured +
    graph + semantic, RRF-fused) then Sonnet synthesis. This is strong.
  - **Agents** use `lib/agent-focus.ts::fetchFocusSlice` — **semantic only**.
    Weaker. See §8 (known gap): pointing agents at the planner is a likely
    upgrade, now evidence-backed.

---

## 3. The headline feature: FOCUS — instruct an agent in English

**File:** `web/lib/agent-focus.ts`, `web/lib/agent-instruction.ts`

The old agent model routed mail to a desk via a closed `StreamKey` enum + a
regex + a code deploy. That capped the product at 7 hardcoded desks and, worse,
depended on topic labels the live pipeline never writes.

Focus replaces that: an agent's scope is a **plain-English instruction**,
resolved semantically across the whole archive (no time cursor, no label).

- The instruction does two jobs that pull apart — *instructing* wants detail,
  *retrieving* wants a short concrete phrase. So the retrieval query is
  **derived** from the instruction by one cheap Haiku call **at save time**,
  cached on the row (`agent-instruction.ts::deriveFocusQuery`,
  `effectiveFocusQuery`). Never derived in the runner — reading config must not
  cost a model call. A stale cache (instruction edited w/o re-derive) resolves
  to null rather than searching the old query.
- `fetchFocusSlice` floors results at `MIN_SCORE = 0.30` — cosine top-N always
  returns *something*, so an unmatched instruction would otherwise hand the
  agent 12 confident-looking junk rows.
- **Empirical finding, load-bearing:** concrete nouns retrieve precisely
  ("invoices", "water main breaks"); abstract intent returns noise ("anything
  urgent"). A score-based "weak match" warning was built and **removed** —
  correct and junk results were indistinguishable by score. The mitigation is
  the **preview** (see §5) plus `docs/AGENT_TEST_PLAN.md` teaching "name a thing
  you could search for."

---

## 4. The Agent Factory — agents are rows, not deploys

**Files:** `migrations/014_custom_agents.sql`, `web/lib/agent-registry.ts`,
`web/app/api/agents/create/route.ts`, `web/components/chief/AddAgentSheet.tsx`

"Add an agent" was a disabled mockup. It's now real: an agent is a row in
`app.agents` (name, instruction, derived query, autonomy, mailbox lane,
sources[]). `agent-registry.ts::allAgents()` merges the 7 built-in
`DOMAIN_AGENTS` with created rows into one roster the runner, Wall, and Ask all
read.

**The safety invariant — "a row adds a DESK, never a POWER":**
- `autonomy` is CHECKed to `observe|suggest|draft` in SQL, clamped again in the
  API (an unknown value → `observe`, never errors up), and re-validated in
  `validateRunOutput`. **There is no `send` anywhere in that chain.**
- A created agent cannot take a built-in key (shadowing `police` from the UI
  would rewrite a compliance-held desk) — rejected in the API, ignored in the
  registry.
- Citations, the mailbox wall, and the send cage live in the runner /
  approvals path and apply identically to created and built-in agents.

`google-security` (built-in, added this branch) and two created agents
(`billing-invoices-agent`, `google-search`) proved the path end to end on a real
mailbox — created agents produce cited digests exactly like built-ins.

---

## 5. Configuration UX (the "prompt it like Claude" work)

- **One box, not four.** The create/edit form is a single "What should this
  agent do?" field; charter/goals/urgency moved behind an **Advanced**
  disclosure. Built-ins save to `app.agent_configs.overrides`; created agents
  save to their own row (`PATCH /api/agents/create`). The operator can't tell
  which kind they're editing.
- **Preview before commit.** Both the create form and the edit screen call
  `POST /api/agents/focus-preview`, which **derives the query first** (same as
  save) and shows the real matches + the derived query. Catches a vague
  instruction at creation instead of a day later as an empty digest.
- **Source picker.** When >1 data source is connected, the create form shows a
  checkbox picker (`app.agents.sources[]`, migration 016). Retrieval honors it
  (`fetchFocusSlice` extra AND) — but only *within* the mailbox wall, never
  across it.

---

## 6. Google Drive — the first non-email source

**Files:** `migrations/015_drive_source.sql`, `web/lib/connectors/gdrive.ts`

Implements the **same `Connector` contract** as Gmail/Graph, because a document
maps onto the record shape: `filename→subject, owner→from,
modifiedTime→sentAt, extractedText→body, parentFolder→threadRef`. That mapping
is why focus, agents, Ask, and citations need **zero changes** — a Drive file is
searchable by every agent the day it lands. **This is the proof that the next
source is cheap.**

- **Access model:** shared drives the account belongs to + items shared with it.
  Not public links, not personal My Drive. Revoking in Drive revokes here.
- **Text:** Google-native → API export; PDF (`pdf-parse` v2, `PDFParse` class) /
  xlsx (`xlsx`) parsed. A file it can't read is **reported, never silently
  skipped** — incl. a scanned PDF that parses to nothing (an *unread* doc, not an
  empty one). Per-file isolation; watermark advances past failures.
- `provider` column now allows `gdrive` (015); a `config` jsonb holds
  `{fileTypes[], scope}` answered during the interview.
- **BLOCKER:** needs `drive.readonly` OAuth scope. Added to the request in
  `lib/auth.ts`, but requires **re-consent** — a scope never applies to an
  already-issued token. Not yet connected/tested end to end.

---

## 7. Trust & transparency work

The stated product risk: *"if users don't 100% trust their agents, they go back
to old behaviour."* Three states were indistinguishable and are now distinct:

| State | Before | Now |
|---|---|---|
| Ran, found nothing | silent card | "Checked — nothing new since the last run" |
| Never ran (just created) | **invisible** | "Ready — waiting for its first run" |
| Scheduler stopped | silent | amber warning on the Hub |

- **`web/lib/agent-schedule.ts`** is the single source of truth for cadence
  (must match `web/vercel.json` cron). The Hub shows "running hourly · next in
  Nm (3:00 PM)", or an amber "agents may be stopped" when a run is >2 slots
  overdue (deliberately generous — one miss is a cold start).
- **Sync progress** (`lib/sync-status.ts`, `components/chief/SyncProgress.tsx`):
  rate/min, ETA, and **mirrored-vs-searchable as two tracks** — collapsing them
  is what produces "it says synced, why can't it find my email?"
- **Deleted a fabricated panel** (ISS-6): the Ask right rail rendered a
  hardcoded "92%" and invented gap cards over live answers. Replaced with real
  recent searches.

---

## 8. Bugs fixed this branch (all were *silent* failures)

| ID | Bug | Root cause |
|---|---|---|
| BUG-2 | Ingest could stall a backfill **forever** while reporting `ok` | SELECT-then-INSERT race on `uq_raw_version`; a dup message threw and unwound the whole round, cursor never advanced. Fixed: idempotent RAW landing + per-message isolation. |
| BUG-3 | `app.audit_log` readable by anon key | `004` stopped at REVOKE UPDATE/DELETE (append-only ≠ private); absent from `003_rls` array. Fixed in the migration so it can't recur on a fresh project. |
| BUG-4 | Agent run truncated at 2048 tokens killed the **whole** run | Output is one JSON object; truncation = "Unterminated string in JSON". Raised to 4096 + the parse error names the cause. |
| — | **Citation guard rejected CORRECT citations** | An RFC id `<0100…@ses.com>` cited without brackets/domain failed exact-match and killed the run. Fixed: `resolveCitation()` normalizes (strip `<>`, lowercase, compare local-part) and **rewrites** to canonical; unknown ids are pruned, not fatal; body snippets are stripped of id-like strings. |
| DEC-15 | Ask returned "0 sources" | `RETRIEVAL_BACKEND` defaulted to `poc` (empty OpenAI-embedded store). Set to `canonical`. **`TASK-13`: verify this env var on the Mayor's prod project — it may be broken there now.** |

---

## 9. Live verification (2026-07-19, real mailbox, ~14.5k messages)

Ask was driven in-browser. Results, with my *predictions* noted because they
were **wrong** in an instructive way:

- "How much did BSB make July 17?" → **$519.50, 3 orders**, cited. ✅
- "BSB sales last week?" — I predicted failure (dates). Instead it resolved
  Mon–Fri, **named the 3 missing days, and refused a fake weekly total**. ✅
- "What subscriptions am I paying for?" — predicted failure (enumeration).
  Instead: confirmed vs. possible split, a price *range*, and it **noticed
  "+2 more purchases" implying its own list was incomplete**. ✅
- "What did the Mayor email me about the water main break?" (false premise) →
  **denied the premise**, surfaced the one adjacent Facebook post, marked it as
  not the answer. ✅

**Why my predictions were wrong:** I pre-tested with semantic-only retrieval;
Ask uses the 3-pass fused planner. Two conclusions: (a) the "date reasoning" and
"enumeration" gaps I feared are handled by synthesis + honest-gap behavior; (b)
**agents are on the weaker semantic-only path** (`fetchFocusSlice`), so routing
the agent runner through `planner.ts` is a real, now-evidenced upgrade.

---

## 10. In flight right now: Brown Sugar Bakery tenant

User wants a BSB build to demo tomorrow. Decisions locked:
**full rebrand** (remove municipal framing), **personal Gmail** ingest,
**local** (`localhost:3200`), **Stephanie Hart's voice** (there's a
`stephanie-voice` skill).

- Multi-tenant scaffold exists (`web/lib/tenant.ts`, `NEXT_PUBLIC_TENANT`,
  default `bellwood`) but has **zero consumers** — branding is still hardcoded
  ("Chief of Staff", "Mayor Harvey", municipal seal, Police/Fire/FOIA streams).
  Wiring the consumers is the real rebrand effort.
- **The engine is domain-agnostic** — half of today's best Ask answers were BSB's
  own data. Domain adaptation is *instructions* (Agent Factory), not code.
- Fresh isolated Supabase project **`brownsugar-hub`** (`iwffrwbvmqrxwijqwzmg`,
  us-east-2) provisioning now. Migrations to follow.
- **Open work:** apply migrations to BSB DB; `brownsugar` tenant config + wire
  consumers; purge municipal vocabulary; disable municipal built-in agents
  (a bakery has no Police desk); tenant-aware `lib/agents/voice.ts` in
  Stephanie's register; BSB `.env` + Google OAuth (user does consent).

---

## 11. Environment / operational notes

- **Run:** `cd web && npm run dev -- -p 3200`. `DEMO_MODE=0`,
  `RETRIEVAL_BACKEND=canonical` required for live. `web/.env.local` is
  gitignored.
- **Supabase:** use the **Session Pooler** host (IPv4); direct `db.<ref>` is
  IPv6-only and hangs.
- **Two throwaway Supabase projects billing $10/mo each:**
  `bellwoodhub-agent-test` (Gmail test) and `brownsugar-hub`. Delete when done.
- **Credential hygiene (TASK-15):** Anthropic, OpenAI, and a DB password
  transited chat during setup — rotate; folds into the existing TASK-12 batch.
- **Google OAuth is in Testing mode** — refresh tokens expire in 7 days.
- **Migrations 011/013/014/015/016 postdate `003_rls`** and carry their own
  REVOKE blocks; `003` is not re-run for them by design.

---

## 12. What to do next (priority order)

1. **`TASK-13`** — verify `RETRIEVAL_BACKEND=canonical` on `bellwood-mayor` prod.
   Ask may be returning 0 sources there right now, independent of this branch.
2. **Merge path** — branch → preview → `live-pilot` → `main`. `main` auto-deploys
   to the Mayor's site.
3. **BSB tenant** — finish §10.
4. **Route agents through the planner** — the §9 finding; agents deserve the same
   3-pass retrieval Ask gets.
5. **Per-agent schedules** — today there is ONE cadence for all agents, so
   "summarize daily" runs hourly and repeats. The Routines screen implies
   per-agent scheduling and is fixture data.
6. **`ISS-7`** — `constituent` reads 200 msgs, digests 0. Honest empty or
   over-aggressive stripping? Unverified.
7. **`TASK-14`** — remove the dead `poc` retrieval path (needs `getDashboard` +
   `listEmails` written on canonical first; 4 routes still import it directly).

---

*Full PM record: `PROJECT.md`. Printable status: `project-status/session-2026-07-18.html`. Test plan: `docs/AGENT_TEST_PLAN.md`.*
