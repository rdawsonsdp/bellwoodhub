# Bellwood Hub — Feature Summary

**Product:** The Mayor's AI Chief of Staff
**For:** proposal development
**Prepared by:** SDP Chicago (Strategic Data Products)
**Date:** June 27, 2026
**Status:** Working demo deployed (Next.js on Vercel, Supabase + pgvector); ~30k synthetic emails; mobile + desktop.

---

## 1. The one-paragraph pitch

A municipality's email is dead storage today — and it walks out the door at every election and staff departure. **Bellwood Hub turns the mayor's mailbox into a living institutional memory with a team of AI staff agents on top of it.** It is one place for the mayor to **look, search, and build his day**: an agent-organized inbox, an agent-confirmed calendar, plain-English search across the entire record with citations, and summaries by area of the village. Agents draft and organize — but every action that leaves the building is a human decision. The reference corpus is ~70,000 of a sitting mayor's emails (30k active inbox + ~40k recovered-from-deleted).

## 2. The problem it solves

- **Institutional memory is lost.** Knowledge of who promised what, how an issue was handled before, and who to call walks out at every transition. The village buys a memory that doesn't leave.
- **Volume is unmanageable.** Hundreds of emails a day; the mayor can't triage, and context is scattered across years of threads, police blotters, and fire/EMS reports.
- **Search isn't enough.** The need is *completeness* — "every conversation about flooding, in order, with who promised what and whether it happened" — not "find me something similar."

## 3. Core capabilities (built — in the live demo)

The app is organized around **jobs to be done**, not features. Bottom nav (mobile) / sidebar (desktop):

### Emails — the inbox as tasks
- A **dense, scalable inbox** (not cards) that handles hundreds of messages a day.
- **Agent-sorted categories** the staff agent assigns and labels: **Urgent · Important · Social · Spam · Inbox**. Categories are **configurable** (operator turns tabs on/off).
- **Agent Answered** — reply drafts the agent has prepared, awaiting the mayor's *Approve & send* or *Discard*. Nothing sends on its own.
- Every email **drills down to the full source document**.

### Calendar — confirm the day
- A **horizontal calendar** (date strip → that day's events). Intended to **sync from the mayor's MS Outlook calendar**.
- Action items folded from correspondence with status (open / overdue / done).

### AI Search — ask the record anything
- Natural-language questions over the entire archive; **every answer cites its sources** and the **cited sources are clickable to the original email**.
- **Voice search** (speak the query → transcribed → answered).
- **Recent searches** (the mayor's own history, not canned examples).
- Aggregates ("who emails me most", "what's still open") and cross-source answers (resident complaint + police blotter + code-enforcement resolution, together).

### History — the full record on anyone / anything
- Every person, business, and property with their complete **timeline across every stream**, plus issue and commitment counts. Identity resolution is reversible (no corrupting merges).

### Sources — confirm the data is flowing
- Per-connector **health** (synced, % canonicalized) and an **activity / sync log** (nightly loads, row counts, failures) — the operational proof that data sources are loading across the app.

### Staff Agents — the team that does the work
- A **landing page that shows and tracks** the mayor's team of agents and their **recent activity** (click an agent → what it's been doing). The team is **open-ended and grows over time** — today it handles email; tomorrow it could approve time cards or onboard staff (an HR agent is already on the roster).
- Read-only view for the mayor; agents are configured and tested by the technical team, not the mayor.

### Admin — operator console
- Model routing (graduated autonomy), **API cost** (bold monthly figure + projection), agent rules, skills, sources, email-tab config, and **theme/color schemes** (4 accessible schemes — light/dark/dim/high-contrast).

### Cross-cutting
- **Drill-to-source everywhere** — any email reference opens the actual document.
- **Citations always** — nothing asserted without provenance.
- **Mobile-first** — ~80% of use is mobile; dedicated mobile UI, installable to the home screen (American-flag app icon), with the desktop experience unchanged.

## 4. The agent model — "agents draft, the mayor decides"

Graduated autonomy reduces the central adoption risk (distrust of agents acting unprompted):

| Level | Rule |
|---|---|
| **R1** | Read-only; cites sources. |
| **R2** | Suggests; ambiguous decisions go to a human review queue (no silent action). |
| **R3** | Drafts replies/actions but **never sends** — every send is a human gate. |
| **R4** | Proactive digests that **state their gaps** rather than omitting. |

**Trust mechanism (in build):** an **Agent Activity** view logging every agent action — approved *and* automated — sorted by date, with time, agent, and detail, linking back to the agent and its logs, on top of an **immutable audit trail**.

## 5. The unifying vision — configurable Area views

The North Star is **one place to look, search, and build the day**, with **summaries by area**. The next major capability is **configurable Area tabs** — a single workspace per domain that brings together that area's contacts, calendar, emails, notices, and tasks with an agent-built summary. Examples: **Firehouse** (contacts · events · tasks), **Police** (emails · notices · tasks), **Public Works**. Configurable by the operator; built up over time. Longer term, this becomes an **agent that connects to other agents** (agent-to-agent / MCP).

## 6. Architecture (why it's more than a chatbot)

- **Three planes:** Ingestion (many connectors, one 5-step contract) → Canonical (one normalized, entity-resolved, event-sourced store) → Capability (the staff agents). Adding a source makes every agent smarter and touches no agent code.
- **One Postgres, three access patterns:** relational filters + `pgvector` similarity + a graph (`edges`) traversal. Small data at municipal scale — cheap and fast.
- **Completeness, not just similarity:** an explicit topic/issue model is the primary index; the vector store is the recall safety net; results fuse via Reciprocal Rank Fusion.
- **Event-sourced issues + reversible identity ledger** — a late email can legitimately re-open a "resolved" issue; a bad identity merge is instantly reversible.
- **Hosting:** Vercel + Supabase today; lifts to Aurora-in-VPC with a byte-identical schema if a buyer's procurement requires isolation.

## 7. Security & compliance posture

- **Audit trail (go-live requirement):** must meet **NIST SP 800-53 Rev 5 "AU" (Audit & Accountability)** and **CJIS Security Policy §5.4** (police data is Criminal Justice Information) — log every retrieval/draft/approval, tamper-evident, ≥365-day retention, weekly review.
- **Access & data:** row-level RBAC (Postgres RLS), PII detection/tagging at ingestion, least-privilege per pipeline stage, encryption in transit and at rest.
- **Governance:** FOIA / Open Meetings / records-retention need municipal counsel — indexing the mayor's email can change its records posture.
- A **pre-go-live security audit / penetration test** gates production with real mailbox data.

## 8. Cost (one municipality, steady state)

- **~$50–120 / month all-in**, blended **< 1¢ per question**.
- One-time backfill of the full ~70k corpus: **~$30–80** (Batch API + Voyage embeddings).
- Model routing (Haiku/Sonnet/Opus, 70/20/10) keeps blended cost low; cost is almost entirely margin and engineering time.

## 9. Roadmap (planned, prioritized)

1. **Agent Activity** view + Audit Agent that flags issues (the trust surface).
2. **MS Outlook connector** (Microsoft Graph) — real mail **and** calendar ingestion, replacing synthetic data.
3. **Configurable Area views** (Firehouse, Police, Public Works…).
4. **Immutable audit trail** + RLS enforcement + **pre-go-live security audit** (compliance track).
5. **Send capability (R3)** — wire approvals to an actual send connector with the human gate intact.
6. Calendar **save-layout** (the mayor's persisted morning view); expand the **eval harness**; canonical-backend cutover for true graph-augmented retrieval.

## 10. Demo status

- **Live, public, mobile + desktop**, running on a bulletproof keyless path over the 30k-email seed; deployed to Vercel and installable to a phone home screen.
- Every screen runs on real seed-derived data; AI Search uses live model synthesis with citations.
- Safe to demo end-to-end; no live mailbox data is required.

---

*All corpus data in the demo is synthetic — real Bellwood, IL geography; every person, address, business, and case number is invented. No real personal information.*
