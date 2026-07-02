# Email Ingestion — Microsoft Outlook (Graph) + Gmail connectors

> Spec for review (RD, 2026-07-02). Replaces the synthetic seed with the
> Mayor's real mail, flowing through the EXISTING 5-step connector contract
> into canonical — on the walls and sensitivity rules already enforced.
> Read-only forever: these connectors never gain a send scope.
> Supersedes/absorbs backlog items TASK-1 (capture Outlook) and #3 (first
> real connector). Companion specs: docs/agents/email-outlook-agent.md,
> docs/agents/email-gmail-agent.md, docs/rebuild/AGENT_FACTORY.md
> (`email-ingest` type — the interview that will one day create these
> connector configs is the same shape this spec hand-builds).

---

## 1. The Connector Delivery Process (reusable — this is the process)

Every connector — these two and every future one — moves through ten stages.
A stage is DONE only when its gate holds. This is the same gate discipline as
the Look·Act·Know rebuild: branch per phase, `tsc` + build + eval green,
PROJECT.md updated, RD reviews at each gate.

| # | Stage | What happens | Gate (the proof) |
|---|---|---|---|
| 1 | **Spec** | This document; scopes + mappings agreed | RD sign-off on §8 decisions |
| 2 | **Consent** | App registrations, OAuth flows, tokens to the vault | Creds never touch the repo; scopes are read-only; RD approves the consent screens |
| 3 | **Pull** | Dry-run CLI lists newest N headers, writes nothing | Both providers listing; throttling honored |
| 4 | **Land** | Raw payloads → pipeline RAW (medallion), idempotent by source_ref | Re-runs are no-ops; counts match provider |
| 5 | **Normalize** | Raw → Envelope via `clean_text` (already hardened for real Outlook/Gmail) | Parity evals on real-format fixtures |
| 6 | **Canonicalize** | Identity resolution, topics, mailbox stamp, **the wall** | Zero `biz` rows reachable from default search; RLS on |
| 7 | **Index** | Chunks + Voyage embeddings | Ask answers real questions with correct citations |
| 8 | **Verify** | Reconciliation: provider count = landed = canonical = embedded; sampled content diff | Numbers agree; RD spot-checks 10 answers |
| 9 | **Schedule** | A Routine (DEC-10) binds the pull to cron + scope | 48-hour soak, zero missed messages |
| 10 | **Monitor** | Sources screen health goes real; stall alerting | lastSynced/counts/errors are live data, not fixtures |

**Standing rules through every stage:** DEMO stays the deployed default until
cutover is a deliberate decision; nothing renders on a Mayor surface until
stage 8 passes; the ingest ledger (`pipeline.ingest_log`) records every run
(ISS-5); canonical rows are never deleted (public-record posture).

## 2. Blocking prerequisites (from the risk register)

- **ISS-4** — enable RLS on the exposed tables **before the first real message lands**.
- **ISS-5** — audit trail for ingest + access (the ledger above is the ingest half).
- **TASK-7** — rotate all keys; new provider tokens go to the vault only.
- **Access**: M365 admin consent for `villageofbellwood.gov` (or the mayor's
  delegated consent — §8.2) and a Google Cloud project for the Gmail OAuth client.
- **Canonical cutover (#2)** is *downstream*: ingestion writes canonical
  regardless; the read path flips (`RETRIEVAL_BACKEND=canonical`) at stage 8.

## 3. Architecture — what already exists does the work

- **Mailbox registry** (`lib/mailboxes.ts`): `gov` = Outlook, public record,
  FOIA-scoped, default; `biz` = Gmail, **walled** (DEC-6). Connectors stamp
  `mailbox_id`; the same email in both accounts = one copy per mailbox.
- **Routines** (DEC-10, `lib/routines.ts` rt-outlook / rt-gmail already model
  this): agent = what/scope, routine = when. Incremental pulls run as Vercel
  cron routes (CRON_SECRET-gated, like agent-runs).
- **Worker split (recommended, §8.4):** TypeScript serverless connectors for
  incremental sync (consistent with the cron fleet); the existing Python
  `pipeline/` for the one-shot historical backfill (long-running, batchy).
- **5-step contract** unchanged: pull → land (RAW) → normalize (Envelope via
  `clean_text`) → canonicalize (resolver, topics; streams stay read-time) →
  embed (Voyage 1024-d chunks).

## 4. Microsoft Outlook — Graph connector (`gov`)

- **Auth**: Entra ID app registration. Recommend **delegated** `Mail.Read` +
  `offline_access` — the Mayor consents once for his own mailbox; no org-wide
  application grant needed. (Application permission + ApplicationAccessPolicy
  is the fallback if IT prefers admin-managed consent.) Refresh token → vault.
- **Backfill**: `GET /me/messages` paged (`$top=100`, `$select` the envelope
  fields, ordered by `receivedDateTime`), window per §8.1.
- **Incremental**: `/me/mailFolders/{inbox,sentitems}/messages/delta` with
  persisted delta tokens (webhook change-notifications are a post-MVP upgrade).
- **Mapping** → Envelope: `internetMessageId` → `source_ref` ·
  `conversationId` + `internetMessageHeaders` (References/In-Reply-To) →
  threading · from/to/cc → parties (resolver unifies identities across
  mailboxes per DEC-6) · `receivedDateTime` → `sent_at` · HTML body →
  `clean_text` → body_clean · folder (Inbox/Sent) → direction ·
  `hasAttachments` recorded; attachment bodies out of MVP scope (§8.3, DEC-4
  routing when they come).
- **Limits**: ~10k requests/10 min per mailbox — honor `Retry-After`, page politely.

## 5. Gmail connector (`biz` — the walled account)

- **Auth**: Google Cloud OAuth client; consumer account → external consent
  screen with the Mayor as test user; scope **`gmail.readonly`** only.
  Refresh token → vault.
- **Backfill**: `users.messages.list` (+ `q` date window) → `messages.get`
  (full) in batches.
- **Incremental**: `users.history.list` from a persisted `historyId`
  (`users.watch` + Pub/Sub is the post-MVP upgrade).
- **Mapping**: `Message-ID` header → `source_ref` · `threadId` → threading ·
  `labelIds` (INBOX/SENT) → direction · MIME walk → text → `clean_text`.
- **THE WALL is stamped at ingest** (DEC-6, enforced at the agent boundary):
  `mailbox='biz'`, `foia_scope=false`, excluded from every default index/search
  path. The existing walled-rule evals must pass against **real** rows before
  stage 8 closes. Sender identity resolution still unifies people across
  mailboxes — the content is walled, not the address book.
- **Limits**: 250 quota units/user/sec (`messages.get` = 5) — batch + backoff.

## 6. Sync semantics

- **Idempotency**: upsert on (`mailbox_id`, `source_ref`); re-running any
  stage is safe.
- **Moves/deletes**: ignored — canonical is a record, not a mirror (flag for
  counsel review with the FOIA/retention question, §8.6).
- **Reconciliation** (stage 8, then continuously): provider message count vs
  RAW vs canonical vs embedded, surfaced on the Sources screen — which stops
  being fixture data at stage 10.

## 7. Security & compliance posture

- Read-only scopes; a send scope is never requested by ANY connector.
- Tokens in the vault (Vercel encrypted env now; Supabase Vault at
  multi-tenant), referenced by name — never in the repo, registry, or logs
  (the DEC-12 connections rule).
- RLS before real data (ISS-4); every run in the ingest ledger (ISS-5).
- Sensitivity defaults `internal`; tagged senders (PD/CJIS) route `restricted`
  per DEC-4. Gov mailbox is public record; `biz` is never FOIA-indexed.

## 8. Decisions needed from RD before ING-1 starts

1. **Backfill window** — recommend 12 months first, 3-year batch later.
2. **Graph consent model** — recommend delegated (Mayor consents personally).
3. **Attachments** — recommend metadata-only for MVP; bodies with DEC-4 storage later.
4. **Worker split** — recommend TS serverless incremental + Python backfill.
5. **Vault** — recommend Vercel encrypted env now, Supabase Vault at FEAT-14.
6. **First mailbox** — recommend a **test M365 mailbox before the Mayor's real
   one** (privacy + a safe rehearsal of the whole process), and counsel's read
   on retention/holds before the real account connects.

## 9. Workstream (PROJECT.md: ING-1 … ING-5)

| Phase | Delivers | Ends at process stages |
|---|---|---|
| ING-1 | Registrations, OAuth, vault, dry-run pull CLI (both providers) | 2–3 |
| ING-2 | Backfill → RAW + Envelope normalize, parity evals | 4–5 |
| ING-3 | Canonical writes, identity + wall, RLS on, audit rows | 6 |
| ING-4 | Embeddings + Ask over real mail, reconciliation, backend smoke | 7–8 |
| ING-5 | Cron routines, live Sources health, 48h soak | 9–10 |
