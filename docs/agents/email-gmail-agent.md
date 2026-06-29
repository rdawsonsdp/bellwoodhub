# Gmail Email Agent

- **Key:** `email-gmail`
- **Autonomy:** R1 (read-only · cites sources · never sends)
- **Status:** active
- **Mailbox:** Bellwood Business — `merrill.bellwood@gmail.com` (Gmail)
- **Posture:** **WALLED / private** (`DEC-6`) — NOT FOIA-indexed, excluded from
  default AI Search, visible only when the Mayor explicitly switches to it.

## Identity & scope

The Gmail Email Agent ingests the Mayor's **personal business mailbox** (Harbor
Wellness Dispensary, Cary IL). Its scope is exactly that one account. It is the
records-wall counterpart to the Outlook agent: the two never mix, so commingling
personal business with the public record can't happen at the data layer — a real
FOIA / records-retention risk, not just a UX preference.

## Jobs

1. **Pull** new + changed messages from **Gmail API** (`gmail.readonly`),
   incrementally via history IDs; backfill on first run.
2. **Normalize** into the canonical **Envelope** (same shape as every connector).
3. **Resolve identities** across mailboxes — *senders* still unify (one person,
   many addresses) — but messages stay tagged `mailbox = business`.
4. **Classify** topic + stream (Business / dispensary-ops / social-charity / …)
   and `sensitivity`.
5. **Index + embed** into a **walled partition**: searchable only inside the
   Business mailbox view; **excluded from the FOIA index and default AI Search**.

## Pipeline

Same 5-step Connector contract as the Outlook agent (`pull → normalize → resolve
→ classify → index+emit`) — but writes with `mailbox = business`, `foiaScope =
false`, so every downstream surface honours the wall.

## Autonomy (R1)

Read-only ingestion; never drafts or sends. (In the demo, agent *drafting* is
gov-only — the Business mailbox shows no Agent-Answered queue.)

## Schedule (Routines)

Bound to a routine: **pull every 5 minutes**. Same pattern as Outlook; schedule
lives in the Routine.

## Guardrails

- **The wall is enforced at ingest**, not just display: `foiaScope = false`,
  excluded from FOIA exports and from default search.
- **Consent / least privilege:** read-only Gmail scope; the Mayor connects this
  account explicitly (it is his personal business, not a village system).
- **Audit:** access logged like any other (`ISS-5`), but business-mailbox audit
  is separate from the public-record audit trail.

## Failure modes

- OAuth token revoked → connector-health alert; no silent gap.
- Rate limits → backoff + resume from last history ID.
- If a message looks like village business (gov domain), flag it — it may belong
  in the government mailbox, not here.

## Scaling notes

Per-tenant + per-mayor: the Business account is optional and personal. Each
customer (and each mayor) connects their own; env / `lib/tenant.ts` decides
whether a business mailbox exists at all.
