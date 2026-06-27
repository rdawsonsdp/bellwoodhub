# Product Spec — The Mayor's AI Chief of Staff

**Prepared by:** SDP Chicago (Strategic Data Products) · **Status:** working demo (Next.js + Supabase/pgvector), mobile + desktop

> Use this as the brief. It defines what the product is, who it's for, the core jobs, the agent model, the architecture, and the roadmap — enough for Claude to outline or extend the application.

---

## 1. One-liner
**One place for the mayor to look at, search, and build his day** — an agent-organized inbox, a consolidated calendar, and plain-English search across the entire institutional record, with a growing team of AI staff agents on top. Agents draft and organize; every action that leaves the building is a human decision.

## 2. The problem
- **Institutional memory walks out the door** at every election and staff change. Who promised what, how an issue was handled before, who to call — all lost.
- **Volume is unmanageable.** Hundreds of emails a day across years of threads, police/fire reports, and resident complaints.
- **Search isn't enough.** The need is *completeness* — "every conversation about flooding, in order, with who promised what and whether it happened" — not "find me something similar."

Reference corpus: ~70,000 emails of a sitting mayor (≈30k active inbox + ≈40k recovered-from-deleted). Demo runs on a synthetic 30k-email seed (real geography, invented people/addresses).

## 3. User & primary jobs-to-be-done
**User:** the mayor (≈80% mobile), plus an operator/technical team who configures agents.

| Job | What it is |
|---|---|
| **Triage my inbox** | Dense, scalable inbox; an agent sorts mail into **Urgent · Important · Social · Spam · Inbox** (configurable). Agent-drafted replies wait for **Approve & send**. Drill to the full source on every message. |
| **Confirm my day** | A **consolidated calendar** across the mayor's accounts (see §5), forward-looking, with action items folded from correspondence. |
| **Ask the record anything** | Natural-language **broad search over the whole corpus** — email **and** documents (fire/EMS, police, permits, inspections, minutes, FOIA) — every answer **cites its sources**, clickable to the original. Voice input supported. |
| **Know anyone/anything's history** | Every person, business, and property with a complete timeline across every stream; reversible identity resolution. |
| **Add a source** | Agent-assisted **document ingestion**: upload a file → agent extracts fields, entities, topic → human confirms → it's searchable. |
| **See the agents work** | A Staff Agents page + activity/audit trail so the mayor trusts what the agents do. |

## 4. The agent model — "agents draft, the mayor decides"
Graduated autonomy is the core trust mechanism:
- **R1** read-only, cites sources · **R2** suggests, ambiguous calls → human review queue · **R3** drafts replies/actions but **never sends** (human gate on every send) · **R4** proactive digests that **state their gaps**.
- The team is **open-ended and grows**: today email + ingestion; next HR/time-cards, etc. New agents are added by the technical team, not the mayor. Long-term: **agent-to-agent / MCP**.

## 5. Multiple mailboxes & the consolidated day
The mayor has more than one account; each is a **Mailbox** (the filterable "source system"), distinct from the connector type:
- **Government** — Outlook (`@villageofbellwood.gov`): the public record, FOIA-scoped, default-visible.
- **Business** — personal Gmail: **walled** — private, **not FOIA-indexed**, excluded from default search; visible only when explicitly switched to. (Commingling personal business with public records is a real legal risk; the wall is a records boundary, not just UX.)
- **Calendar is consolidated** across both (Outlook + Gmail) into one day view with per-event source badges and an All/Government/Business filter — exactly what a chief of staff does. Same email in two mailboxes = a copy per mailbox; sender identity still unifies across them.

## 6. Architecture (why it's more than a chatbot)
- **Three planes:** Ingestion (many connectors, one 5-step contract: pull → land → normalize → canonicalize → embed) → **Canonical store** (one normalized, entity-resolved, event-sourced Postgres) → **Capability** (the staff agents). Adding a source makes every agent smarter and touches no agent code.
- **One Postgres, three access patterns:** relational filters + `pgvector` similarity + a graph (`edges`) traversal, fused via **Reciprocal Rank Fusion**. Completeness first (explicit topic/issue index), vectors as the recall safety net.
- **Event-sourced issues + reversible identity ledger:** a late email can re-open a "resolved" issue; a bad identity merge is instantly reversible.
- **Ingestion is uniform:** every email AND every uploaded document becomes one canonical record + embedded chunks, so search spans the whole corpus automatically. Sensitive documents (e.g., police/CJIS) route their original to a **secured external store** (pointer only); the app holds searchable metadata, not the file.
- **Hosting:** Vercel + Supabase today; lifts to Aurora-in-VPC with a byte-identical schema if procurement requires isolation. **Cost ≈ $50–120/mo per village**, < 1¢/question (model routing Haiku/Sonnet/Opus 70/20/10).

## 7. Security & compliance
- **Audit trail (go-live requirement):** meet **NIST SP 800-53 Rev 5 "AU"** and **CJIS §5.4** — log every retrieval/draft/approval/access, tamper-evident, ≥365-day retention, weekly review.
- RBAC (Postgres RLS), PII tagging at ingestion, least-privilege per pipeline stage, encryption in transit/at rest, read-only OAuth per mailbox.
- FOIA / Open Meetings / records-retention need municipal counsel; pre-go-live security audit gates production with real mailbox data.

## 8. Roadmap (prioritized)
1. **Agent Activity view + Audit Agent** (the trust surface) on an **immutable audit trail**.
2. **Real connectors:** MS Outlook (Graph) + Gmail — live mail *and* calendar, replacing synthetic data.
3. **Configurable Area views** (Firehouse, Police, Public Works) — one workspace per domain with an agent-built summary.
4. **Send capability (R3)** — wire approvals to a real send connector, human gate intact.
5. Secured external document store; canonical-backend cutover for true graph-augmented retrieval; expand eval harness.

## 9. Demo status
Live, public, mobile + desktop, keyless over the 30k seed. Includes: agent-sorted inbox, two mailboxes (gov Outlook + walled business Gmail), consolidated calendar, broad corpus search with citations + voice, agent document ingestion with progress, Staff Agents, Admin console (models/cost/themes), theme switcher. All demo data is synthetic — no real personal information.
