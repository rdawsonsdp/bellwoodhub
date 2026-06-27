# Bellwood Hub — Business Rules by Screen

**Mayor's AI Chief of Staff · Village of Bellwood**
Audience: CTO / product / stakeholders. Purpose: define, per screen, **what it shows, how an item qualifies to appear there, how its status is derived, what actions exist, and where the data comes from.**

> Demo note: today the screens run on the **JSON demo path** (`DEMO_MODE=1`) — deterministic content derived from the 30,641-email seed corpus, no live feeds. The *business rules below are identical* in the live path; only the data source changes (Postgres/pgvector instead of fixtures). Full email bodies on drill-in already come from Postgres.

---

## 0. The governing principle — graduated autonomy

Every screen obeys an autonomy ladder. **Agents draft; the Mayor decides.**

| Level | Rule | Where it shows |
|---|---|---|
| **R1 — read-only** | Reads the record, answers with citations. No writes, no actions. | Search, History, Source |
| **R2 — suggest + queue** | May propose entity merges into a human review queue. No silent hard-merge; every assertion reversible. | Source → review queue |
| **R3 — draft, never send** | Drafts replies/actions but never executes. Every send/approve is a human gate. | **Approvals**, Emails → Queued to go |
| **R4 — honest-gap digest** | Summarizes proactively, but states empty sections rather than omitting, and cites sources. | Brief / Emails → Needs attention |

Cross-cutting rule: **every email or document reference is clickable down to the actual source email** (`/api/email` → full body from Postgres).

---

## 1. Emails  *(mobile home screen)*

**Job:** the inbox as tasks — what's *queued to go* and what *needs your attention*.

### Queued to go
- **What qualifies:** a draft reply that an agent has prepared and that is **awaiting the Mayor's approval** (status = `pending`).
- **How it got there:** the **Drafting agent (R3)** generated a reply to an inbound email that needs a response (see §6 Approvals). It is **never auto-sent** — it waits here.
- **Actions:** **Approve & send** (records the human decision) · **Discard** (removes it). *Phase 0: "approve" records the decision; an actual send connector is deliberately not wired (R3).*
- **Source:** `GET /api/approvals` (status = pending).

### Needs attention
- **What qualifies (two rules, deduped):**
  1. **Awaiting your reply** — the thread's **most recent message is inbound** (the ball is in the Mayor's court).
  2. **High-sensitivity** — inbound on a sensitive topic (**FOIA** or **public-safety**), surfaced regardless of age.
- **Ordering:** newest first; duplicates across the two rules removed.
- **Actions:** tap → opens the **full source email**.
- **Source:** `GET /api/brief` (`awaitingReply`, `highSensitivity`).

---

## 2. Brief  *(desktop equivalent of Emails)*

**Job:** "Needs You Today" digest. **R4 honest-gap** — empty sections are stated, not hidden; every line cites its source.
- **Sections & rules:** *Awaiting your reply* (thread's latest message inbound) · *Open issues* (actionable inbound folded from events) · *High sensitivity* (FOIA / public-safety inbound).
- **Source:** `GET /api/brief`.

---

## 3. Events

**Job:** the things the Mayor actually has to *do* — folded from the correspondence, not hand-entered.

- **What qualifies:** a **thread on an actionable topic** — drainage, code enforcement, complaint, roads, permits, water billing, sanitation, public safety — with activity in the **last 60 days**.
- **How status is derived (folded from the thread):**
  | Thread state | Event status |
  |---|---|
  | Latest message is **outbound** (you replied) | **Done** |
  | Latest is **inbound**, **> 5 days** old | **Overdue** |
  | Latest is **inbound**, recent (≤ 5 days) | **Open** |
- **Ordering:** Overdue → Open → Done, then newest first. Counts shown as headline stats (open / overdue / done).
- **Actions:** tap → the **source email** that drives the event. Filter by status (All / Open / Overdue / Done).
- **Source:** `GET /api/events`.

---

## 4. Search  *(the "Ask" omnibox / center button)*

**Job:** ask the institutional record anything, in plain English. **R1 read-only**, always cited.

- **Mode detection (business rule):**
  - *"who emails me the most…"* → **aggregate**: ranked sender counts.
  - *"what's still open / outstanding / needs a reply…"* → **open-items** list.
  - otherwise → **RAG** answer.
- **RAG rules:**
  1. **Retrieve** — keyword scoring over the corpus index (subject hits weighted higher) → top-k source emails.
  2. **Answer** — a **curated narrative** for known showpiece questions (e.g., Gloria Bennett history, Bohland flooding, St. Charles noise precedent); **otherwise OpenAI synthesis grounded *only* in the retrieved sources**, with inline `[n]` citations.
  3. **Cross-source flag** — set when the answer spans **≥ 3 different streams** (e.g., resident + police + code enforcement).
- **Voice:** mic → OpenAI Whisper transcription → fills the query → runs the search.
- **Actions:** every cited source → the **full source email**.
- **Source:** `POST /api/ask`, `POST /api/transcribe`.

---

## 5. History  *(formerly "Memory")*

**Job:** the full record on every person and property. **R1 read-only.**

- **What qualifies:** any resolved entity (person / business / address) with at least one message. Hero constituents are surfaced first.
- **Drill-in rules:** selecting an entity returns its **complete timeline across every stream** (inbound + outbound), plus stats — message count, issues, commitments. Entity identity is resolved via an **assertion ledger** (an alias maps to an identity; a false merge is reversible — AD-6).
- **Actions:** search the list → open an entity → tap any timeline item → the **source email**.
- **Source:** `GET /api/memory`, `GET /api/memory?value=<name>`.

---

## 6. Approvals  *(your example — "how do these get here?")*

**Job:** draft replies the Mayor must decide on. **R3 — agents draft, the Mayor decides.**

**How an item arrives (the lifecycle):**
1. An **inbound email needs a response** (e.g., a resident escalation).
2. The **Drafting agent** composes a reply **in the Mayor's voice** — warm but busy, sets expectations, routes to the right department — using **only** the known context for that thread (it won't invent facts; if it lacks one, it says what it would need).
3. The draft is stored as **`pending`** with: recipient, subject, body, and the agent's **rationale** (why it drafted this).
4. It appears here (and under Emails → *Queued to go*).
5. The Mayor **Approves** (records the human decision — *Phase 0 does not transmit; sending is a deliberate out-of-band step, R3*) or **Discards** (removes it).

- **Demo content:** three curated drafts to real inbound emails — Eleanor Meyer (basement-flooding regrade date), Gloria Bennett (storm-drain catch-basin inspection), Diane Pawlak (St. Charles operating-hours review).
- **Source:** `GET /api/approvals` (pending) · `POST /api/approvals {action: approve|discard}`.

---

## 7. Source

**Job:** where the record comes from — connector health (the ingestion plane).

- **What it shows:** each connector with **total messages, % canonicalized, last-synced, health** (healthy / syncing / degraded). The mailbox carries the **~70,000** institutional-memory total (30,641 active inbox + ~39,790 recovered-from-deleted).
- **Review queue (R2):** ambiguous entity merges are parked here for a human — **no silent hard-merge**; both candidates are shown; merges are reversible.
- **Actions:** Merge / Reject a review item; open Admin.
- **Source:** `GET /api/sources`, `POST /api/sources {action: merge|reject}`.

---

## 8. Admin  *(operator console)*

**Job:** configure the system. Reads real config; operator overrides persist to the browser (`localStorage`) and **do not** rewrite server config.

- **Appearance** — colour scheme (4 accessible themes).
- **Models** — the routing tiers (Haiku classify/triage, Sonnet synthesize/draft, Opus flagship-behind-eval) + pipeline models. Rule: graduated-autonomy 70/20/10 split.
- **API Cost** — per-model rates, projection, cost levers.
- **Agent Rules** — the R1–R4 autonomy ladder, with editable operator notes.
- **Skills** — the capability-agent catalog (Morning Brief, Memory, Commitment Tracker, Drafting built; Compliance / Board Prep / Grant Radar / Intelligence planned), with enable toggles.
- **Sources** — enable/schedule connectors; add new ones.

---

## Cross-cutting business rules

- **Drill-to-source everywhere** — any email/document reference resolves to the actual source email body (Postgres; seed-snippet fallback).
- **Citations always** — every Search answer cites the sources it used; nothing is asserted without provenance.
- **Honest gaps (R4)** — digests state what's empty or missing rather than omitting it.
- **Human-in-the-loop (R3)** — nothing sends or acts without an explicit human approval.
- **Reversibility (AD-6 / R2)** — identity merges and entity assertions are reversible; the graph is protected from transitive-merge corruption.
- **Retention / audit (post-go-live)** — an immutable audit trail of every retrieval, draft, and approval is required before real mailbox data (NIST 800-53 AU + CJIS §5.4) — tracked as ISS-5.

---

*Bellwood Hub · business rules v1 · 2026-06-27. Reflects the implemented behaviour of the demo and the intended live behaviour (identical rules, live data source).*
