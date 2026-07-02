# PHASE 0 — Ground-Truth Map (Look · Act · Know rebuild)

> Survey pass, 2026-07-01. No code changed. Read order for the skim: §1 verdicts →
> §6 findings that need your call. §2–§5 are the evidence.
>
> Target model: Mayor nav collapses to **Wall (LOOK) · Queue (ACT) · Ask (KNOW)**;
> everything else moves behind an **Operator** toggle. Dispositions below use:
> **KEEP** (as-is) · **REPURPOSE →** (content/role relocates) · **RETIRE** (superseded;
> per Gate 4 nothing is deleted until its replacement ships).

---

## 1. Verdict summary — where every current surface lands

| Current surface | Disposition |
|---|---|
| Today (`TodayScreen`) | RETIRE → replaced by **Wall** (Phase 2) |
| Emails (mobile `EmailsScreen` / desktop `Brief`) | REPURPOSE → raw list to **Operator**; "Agent Answered" tab superseded by **Queue** |
| Calendar (mobile `EventsScreen` / desktop `Track`) | REPURPOSE → **Operator**; Mayor-facing calendar = **schedule agent** card on the Wall |
| Ask (desktop screen) / AskSheet + FAB (mobile) | REPURPOSE → single **Ask** tab (Phase 4); FAB + duplicate search bars RETIRE |
| Approvals (desktop `settings` screen) | RETIRE → superseded by **Queue** (Phase 3) |
| History (mobile) / Memory (desktop) | REPURPOSE → entity pages stay, reached via citations/**Ask** in Mayor mode; browse list to **Operator** (+ type filter/search) |
| Sources (+ UploadSource wizard) | REPURPOSE → **Operator** only |
| Staff Agents (`AgentsPage` / `cos-agents.ts`) | REPURPOSE → **Operator** only; Mayor-facing role superseded by the domain-agent cabinet |
| Admin (`AdminPanel`) | REPURPOSE → **Operator** only |
| `/email` standalone page (light theme, "Back to the Hub") | RETIRE → in-app thread view (Phase 4) |
| `/hub` legacy app + `/api/list`, `/api/dashboard`, `/api/entity` | Legacy, unreferenced from Mayor UI — leave untouched this rebuild (see §6.5) |
| Mobile hamburger `NavMenu` | RETIRE → bottom tabs Wall · Queue · Ask (Phase 4) |
| FeedbackButton, pull-to-refresh, theme system | KEEP |

---

## 2. Screen inventory (reachable surfaces, with drift notes)

Routing: `/` → `/chief` (`web/app/page.tsx:7`) → `ResponsiveChief.tsx:15` mounts
`MobileApp` (≤768px) or `ChiefApp`. Default screen on load: **today** (both).

### 2.1 Mobile — `MobileApp.tsx` (`type Screen`, :76)

| Key | Component | Reached by | Disposition |
|---|---|---|---|
| `today` (default) | `TodayScreen.tsx:70` — hero greeting/weather/on-this-day, pressing items, calendar-today, "To sign" drafts, 5-row inbox preview | load | RETIRE → **Wall** |
| `emails` | `EmailsScreen` :355 — mailbox switcher (gov/biz), category tabs (Urgent/Important/Social/Spam), Inbox, Agent Answered (DraftCards) | hamburger | REPURPOSE → Operator; drafts tab → **Queue** |
| `events` | `EventsScreen` :456 — open/late/done stats, day strip, gov/gmail filter | hamburger | REPURPOSE → Operator + **schedule agent** |
| `history` | `HistoryScreen` :547 + `MemoryDetailSheet` :576 | hamburger | REPURPOSE → **Ask**/citations + Operator browse |
| `agents` | `AgentsPage.tsx:28` (shared) | hamburger | REPURPOSE → Operator |
| `sources` | `SourcesView` :609 + `UploadSource.tsx:29` wizard | hamburger | REPURPOSE → Operator |
| `admin` | `AdminPanel.tsx:66` (shared) | hamburger | REPURPOSE → Operator |
| — overlays | `AskSheet` :724 (FAB :185), `EmailSheet` :265, `NavMenu` :151 | FAB / any email ref / hamburger | AskSheet → Ask tab; EmailSheet → in-app thread view; NavMenu → RETIRE |

Stale artifact: file-header comment (:4-5) describes a bottom-tab bar that no longer exists.

### 2.2 Desktop — `ChiefApp.tsx` (`type Screen`, :57)

| Key | Component | Disposition |
|---|---|---|
| `today` (default) | shared `TodayScreen` | RETIRE → **Wall** |
| `brief` "Emails" | `Brief` :302 — Urgent/Inbox/Agent Answered tabs (different tab model than mobile) | REPURPOSE → Operator; queued tab → **Queue** |
| `ask` | `Ask` :424 — AskInput + mic, RetrievalPlan/GapsPanel rail (hardcoded "2 gaps") | REPURPOSE → **Ask** tab |
| `track` "Calendar" | `Track` :708 | REPURPOSE → Operator + **schedule agent** |
| `memory` "History" | `Memory` :834 (+ static `MemoryRepresentative` fallback :902) | REPURPOSE → Ask/citations + Operator |
| `sources` | `Sources` :958 (+ review queue Merge/Reject :993 — mobile lacks this) | REPURPOSE → Operator |
| `settings` "Approvals" | `Approvals` :1094 (+ static fallback drafts :1122) | RETIRE → **Queue** |
| `agents`, `admin` | shared components | REPURPOSE → Operator |
| — chrome | Sidebar :167 (hardcoded badges — see §4), Topbar :258 (fake ⌘K search, static "synced 4m ago"), floating Ask pill :153 | Rebuilt in Phase 4 nav collapse |

### 2.3 Known mobile/desktop drift (evidence for "ships in BOTH" rule)

- Emails tabs: mobile = category classifier (`email-config.ts`); desktop = brief-needs-you + inbox. Different data models for the same screen.
- Today `onGo` targets differ (MobileApp :119 vs ChiefApp :141); desktop leaves the shell to `/email`, mobile opens `EmailSheet` in-app.
- Desktop-only: Approvals screen, Sources review queue, Ask gaps rail, calendar status filters. Mobile-only: category tabs, mailbox block, pull-to-refresh, uploads-in-Ask.
- Memory timeline rows clickable on mobile, not on desktop.

---

## 3. API route inventory × rebuild phase

DEMO flag: `web/lib/demo/index.ts:62`. "Demo-only" = no live DB path exists at all.

| Route | Today | Demo status | Rebuild touch |
|---|---|---|---|
| `/api/wall` | — (new) | — | **P2**: new; single provider for everything the Wall shows |
| `/api/agents/run?demo=1` | — (new, temp) | — | **P1**: fixture-backed gate check |
| `/api/cron/agent-runs` | — (new) | — | **P5**: orchestrator, CRON_SECRET-gated |
| `/api/brief` | needs-you digest | branches ✅ | **P2** Wall supersedes for Mayor; route kept for Operator Brief |
| `/api/morning-summary` | Today hero (live path = demo fn, route :27-28 TODO) | ✅ | **P2** superseded on Mayor surface; **P4** cron payload repoints to `getWall()` |
| `/api/approvals` | drafts list/approve/discard/save | branches ✅ (`draft` action 400 in demo) | **P3** Queue wires approve/fix-it/skip |
| `/api/events` | consolidated calendar | **demo-only** (route :7-8) | **P2** feeds schedule agent (see §6.3 walled tension) |
| `/api/inbox` | mailbox-scoped feed | **demo-only** | **P4** Operator emails list |
| `/api/ask` | RAG Q&A | branches ✅ | **P4** UI-only changes; pipeline kept |
| `/api/transcribe` | Whisper voice | **no demo branch — 503 keyless** | **P3** fix-it mic, **P4** Ask voice (see §6.4) |
| `/api/email` | full message by mid | hybrid ✅ | **P4** in-app thread view |
| `/api/memory` | entity list/detail | branches ✅ | **P4** fix entity `kind` labels; Operator type filter/search |
| `/api/sources` | connector health/review | branches ✅ (POST no-op demo) | Operator; untouched |
| `/api/feedback` | notes → GitHub | keyless ✅ | untouched |
| `/api/cron/needs-you` | gated digest | needs DB | **P4** payload = Wall top line + queue size |
| `/api/cron/refresh` | synthetic refresh | needs DB+key | untouched |
| `/api/[transport]` MCP | 5 tools | needs DB/keys | untouched this rebuild |
| `/api/dashboard`, `/api/entity`, `/api/list` | `/hub` legacy only | `/api/list` **500s in demo** (no fixture path) | untouched; see §6.5 |

Migration touch: `migrations/002_domain_agents.sql` (**P1**) — `canonical.agent_memory`, `canonical.agent_runs`.

---

## 4. Counts & dates — every computation site (must converge in Phase 2)

Root cause of the coherence bugs: **at least four independent sources of the same
numbers** (fixtures, per-widget fetches, hardcoded literals, real-clock math) and
**two "todays"** (fixture `CURRENT_DATE = "2026-06-28"`, `lib/demo/index.ts:115`,
vs real `new Date()`).

### 4.1 Hardcoded literals (delete in P2/P4 — no data source at all)

- `ChiefApp.tsx:197` Emails red dot · `:199` **Calendar badge `8`** · `:201` Sources `!` · `:202` **Approvals `3`** · `:210-215` "70,431 messages / 4 / 6 connectors" sidebar card · `:270` "synced 4m ago" · `:431` "70,431 records indexed" (Ask idle) · `:1106` `drafts.length || 3` fallback.
- `lib/cos-agents.ts:36` "11 need you, 3 to sign, 8 on the calendar" — hardcoded activity string that also surfaces on Today via `demoMorningSummary` agent notes (`demo/index.ts:174-180`).
- Static prototype blocks: `MemoryRepresentative` (ChiefApp :902-950), `SourcesRepresentative` (:1045-1091), GapsPanel "2 gaps / 78%" (:647-670).

### 4.2 Computed, but from divergent sources (converge on `getWall()` / one provider per screen)

| Concept | Site A | Site B | Divergence |
|---|---|---|---|
| Calendar count | sidebar literal `8` (ChiefApp :199) | day count vs **real** today (ChiefApp :787 / MobileApp :512); stats open 273/late 656/done 551 from `/api/events` | 8 vs 0 vs 273 on one screen |
| Events "today" | Today hero `counts.eventsToday` — filtered on fixture `CURRENT_DATE` 6-28 (`demo/index.ts:127-136,183`) | Calendar screens filter on `new Date()` UTC (MobileApp :461, ChiefApp :714) | hero says N, calendar says 0 |
| Needs-you | hero = raw sum, no dedup (`demo/index.ts:182`) | desktop Brief = deduped union (ChiefApp :312) | same fixture, different arithmetic |
| Drafts pending | Today "To sign · N" (`TodayScreen:190`, live fetch) | sidebar literal `3` (:202), `|| 3` fallback (:1106) | breaks after first approve |
| Inbox counts | Inbox tab = full total | category chips counted over first 80 rows only (`demo/index.ts:336-352`) | one response, two populations |

### 4.3 Date/time incoherence (the three named bugs — responsible code)

- **(a) Badge 8 vs "0 events":** literal badge `ChiefApp.tsx:199`; "0 events" from real-today filtering (`ChiefApp:787`) against fixtures whose gov events end **2026-06-21** (`events.json`).
- **(b) "today" vs Jun 28 card:** header shows real date (`TodayScreen:82`); items picked by fixture-today `todayEvents()` (`demo/index.ts:127-136`) with `when` = frozen fixture `dueLabel` ("Sun Jun 28 · 5:00 PM", `gmail-calendar.json`) rendered at `TodayScreen:181`.
- **(c) "coffee … this evening":** keyless path always prepends "Here's the quick read, coffee in hand." (`demo/index.ts:139`) while `fillGreeting` (`lib/morning.ts:49-55`) says "Good evening"; LLM path bakes "with his coffee this ${part}" into the prompt (`demo/index.ts:193`). Also two different hour taxonomies (greeting 12/17 vs banner band 11/17, `lib/theme.ts:13-18`).

### 4.4 Fixture date strategy

All fixtures are **absolute, frozen at build time** (`scripts/build-demo.mjs` shifts
corpus so newest email = build-day): search-index newest 2026-06-27, gov events end
06-21, gmail calendar 06-28→07-31, drafts 06-20/22, `dueLabel` strings pre-baked
("overdue · 6d") — everything drifts one day per real day. **P2 must pick one demo
"now"** — recommendation in §6.2.

---

## 5. Demo persona set — CONFIRMED (with discrepancies)

- **Gov mailbox:** `lib/mailboxes.ts:31-42` — "Bellwood Government", Outlook, `mayor@villageofbellwood.gov`, `foiaScope: true`, default.
- **Walled Gmail:** `lib/mailboxes.ts:43-53` — "Bellwood Business", `merrill.bellwood@gmail.com`, `isPrivate: true, foiaScope: false`. Harbor Wellness Dispensary, Cary IL is fully fixtured: `business-inbox.json` biz-015 (IDFPR, "412 Northwest Hwy, Cary, IL"), biz-016 METRC, biz-017 Brink's, biz-018 dispensary manager Maya Okonkwo, biz-019 Cresco; `gmail-calendar.json` GCAL-02/03/09. **Sufficient to be the Phase 5 entity-scoped proof agent.**
- **Wall enforcement today:** `demoInbox` gov-default (`demo/index.ts:328-353`), `demoRetrieve` never includes BUSINESS (:375-407), `demoEmail` resolves `biz-*` only on direct drill-in (:232-241). One deliberate exception: `demoEvents()` folds gmail calendar into the consolidated calendar (:81-89) — see §6.3.
- **Hero scenarios present** (fixture IDs verified): 2218 Bohland flooding (multi-thread arc + curated answer), Gloria Bennett (7-contact history, live storm-drain thread `<3f209918174003cb@…>`), St. Charles noise precedent (Pawlak `<now-e5f25a1e000e75d5@…>` + El Faro blotter history), Eleanor Meyer saga (5 threads + live `<now-4719fd94f5ae0394@…>`), police blotter (750 watch-commander rows), Taste of Bellwood (912 hits). The three seeded drafts (`drafts.json`): demo-draft-1 Meyer, demo-draft-2 Bennett, demo-draft-3 Pawlak — all `pending`, ready to seed the Queue.
- **Dual-domain proof material for Phase 1d exists:** Pawlak bar-noise (Resident stream → constituent) + police blotter/El Faro CIT items (Police stream) share the St. Charles nightlife issue.

### Discrepancies found (§6.1 asks for your call)

1. The gov corpus and all three drafts are signed **"Mayor Daniel R. Okonkwo"** at `mayor@bellwood-demo.gov` (`drafts.json:9,21,33`); the mailbox registry says `villageofbellwood.gov`; the configurable persona default is **"Mayor Harvey"** (`lib/morning.ts:22`, `lib/tenant.ts:34`); "Merrill Bellwood" exists only on the Gmail side.
2. Domain split: email search index uses `@bellwood-demo.gov`; corpus docs + mailbox registry use `@villageofbellwood.gov`. `deriveStream` (`topics.ts:16`) keys on `@bellwood-demo.gov` — mail from the registry domain would classify as **Resident**, not Interdepartmental.

---

## 6. Findings that need Robert's eyes (before/during Phase 1-2)

1. **Persona naming.** Recommend: fixtures standardize on Mayor Merrill Bellwood (drafts re-signed in Phase 1d when the constituent agent adopts them); keep "Mayor Harvey" only as the configurable live-persona default. Zero UI work — fixture edits only.
2. **Demo "today".** Recommend Phase 2 add a single `demoToday()` (anchored to newest fixture date, e.g. max date in brief.json) used by *every* demo computation, and the Wall renders dates relative to it — the drift bug becomes impossible by construction. Real-clock `new Date()` remains only for theme/greeting hour.
3. **Walled calendar tension.** Today's consolidated calendar deliberately folds gmail events into the whole-day view (2026-06-27 decision), but the rebuild's rule says business content appears only inside the harbor-wellness card. Proposed line: *personal/social* gmail items (birthday, Rotary, gala) may appear in the schedule agent; *Harbor Wellness operational* items (P&L, Brink's, IDFPR deadline) stay walled to its card. Confirm or tighten.
4. **Voice depends on OPENAI_API_KEY** (`/api/transcribe` 503s keyless — no demo branch). Fix-it mic (P3) and Ask hold-to-talk (P4) inherit this. Key is already in Vercel env, so the deployed demo works; a strictly keyless run degrades to typed input. Acceptable, or add a demo transcription stub in P3?
5. **Legacy `/hub` app** (own Ask/entity/dashboard screens) is unreachable from the Mayor UI except via `/email`'s "Back to the Hub" link, which dies in P4 anyway; `/api/list` already 500s in demo. Proposal: leave the code untouched, out of scope; nothing relocates because nothing Mayor-facing references it.
6. **Registry naming collision.** `web/lib/routines.ts` and Admin already use "Routines"; the rebuild's domain agents will run via cron (P5). P5 should model agent-runs as a Routine per DEC-10 rather than a parallel mechanism.

---

*Sources: full-file reads of CLAUDE.md, PROJECT.md, topics.ts, mailboxes.ts, cos-agents.ts (via survey), demo/index.ts; component surveys of MobileApp.tsx, ChiefApp.tsx, TodayScreen.tsx; route-by-route read of web/app/api/**. Key hardcoded values re-verified by direct read.*
