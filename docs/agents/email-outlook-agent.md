# Outlook Email Agent

- **Key:** `email-outlook`
- **Autonomy:** R1 (read-only · cites sources · never sends)
- **Status:** active
- **Mailbox:** Bellwood Government — `mayor@villageofbellwood.gov` (Outlook)
- **Posture:** **Public record** — FOIA-scoped, default-visible, part of AI Search.

## Identity & scope

The Outlook Email Agent is the ingestion worker for the Mayor's **government
mailbox**. Its scope is exactly that one account: it does not read, write, or
mix with the walled Business (Gmail) account — that is the Gmail Email Agent's
job. Keeping one agent per mailbox preserves the gov/business records wall
(`DEC-6`) at the agent boundary, not just the UI.

## Jobs

1. **Pull** new + changed messages from Outlook via **Microsoft Graph**
   (`Mail.Read`), incrementally via delta tokens; backfill on first run.
2. **Normalize** each message into the canonical **Envelope** (clean headers,
   strip quoted/forwarded chains, extract attachments → `raw_ref`).
3. **Resolve identities** through the reversible assertion ledger
   (`entity_aliases`) — e.g. `G. Bennett → Gloria Bennett` — never a silent
   hard-merge; ambiguous cases go to the review queue.
4. **Classify** topic + **stream** (Police / Fire-EMS / Resident / Civic-FOIA / …)
   and `sensitivity` (public / internal / restricted).
5. **Index + embed** — write `canonical.messages`, `message_topics`, and Voyage
   chunks so the message is searchable the moment it lands.

## Pipeline

Implements the 5-step Connector contract (`ingest/base.py`):
`pull → normalize → resolve → classify → index+emit`. Output lands in the same
canonical store every other connector writes to; nothing about this agent is
special-cased downstream.

## Autonomy (R1)

Read-only. It ingests and indexes; it **never drafts or sends**. Reply drafting
is the Drafting Agent's job (R3, human-gated). The Mayor sees its output as the
**Government** inbox and as cited sources in AI Search.

## Schedule (Routines)

Bound to a routine (see `web/lib/routines.ts`): **pull every 5 minutes** during
the day. One agent can carry more routines (e.g. a nightly full reconcile) —
the schedule lives in the Routine, not in this agent.

## Guardrails

- **FOIA scope:** everything it ingests is public record and FOIA-indexed.
- **PII/sensitivity** tagged at ingest; `restricted` originals route to the
  secured store (`FEAT-11`), never into the app DB.
- **Audit:** every pull/access is logged (`ISS-5` — NIST 800-53 AU / CJIS §5.4).
- **Least privilege:** read-only Graph scope; no mailbox write permission.

## Failure modes

- Token expiry / consent revoked → surfaces a connector-health alert on Sources.
- Rate limits → backoff + resume from the last delta token (no double-ingest).
- Malformed/encrypted message → quarantine + flag, don't drop silently.

## Scaling notes

Per-tenant: each customer points this agent at **their** Exchange tenant via
env / `lib/tenant.ts` (its own app registration + admin consent). Adding a third
mailbox = a new agent + spec file, not a fork.
