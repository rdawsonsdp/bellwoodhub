# Connector dry-run — stage 3 of docs/EMAIL_INGESTION.md

The stage-3 gate: both providers listing newest-N headers, writing nothing.
Everything below runs on the **live pilot** path only (`DATABASE_URL` set,
`DEMO_MODE!=1`) — the keyless demo has no connectors and needs none.

## 0. Prerequisites

- Env (in `web/.env.local` or the pilot Vercel Preview env — never committed):
  - Outlook: `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`
  - Gmail: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
  - `DATABASE_URL` (pilot Supabase, Session Pooler host), `CRON_SECRET`
- Migration applied: `migrations/006_connectors.sql` (after any migration that
  adds tables, re-run `003_rls.sql` — 006 self-encloses its RLS, so no re-run
  is needed for 006 alone).
- A refresh token on file: sign in once on the pilot (the OAuth grant doubles
  as mail consent — lib/auth.ts upserts `pipeline.connector_accounts` with
  status `'pending'`). Verify:

  ```sql
  SELECT provider, address, mailbox_id, status,
         (refresh_token IS NOT NULL) AS has_token, cursor, last_synced_at
    FROM pipeline.connector_accounts;
  ```

## 1. Dry-run `listNewest` (writes nothing)

Create a scratch file `web/scripts/dryrun.ts` (delete after; never commit a
pasted token):

```ts
import { query } from "../lib/db";
import { graphConnector } from "../lib/connectors/graph";
import { gmailConnector } from "../lib/connectors/gmail";

const provider = process.argv[2] as "outlook" | "gmail"; // e.g. npx tsx scripts/dryrun.ts outlook
const rows = await query<{ address: string; refresh_token: string }>(
  `SELECT address, refresh_token FROM pipeline.connector_accounts
    WHERE provider = $1 AND refresh_token IS NOT NULL LIMIT 1`, [provider]);
if (!rows[0]) throw new Error(`no ${provider} account with a token on file`);

const c = provider === "gmail" ? gmailConnector(rows[0].address) : graphConnector(rows[0].address);
const { accessToken } = await c.refreshAccessToken(rows[0].refresh_token);
const msgs = await c.listNewest(accessToken, 10);
console.table(msgs.map((m) => ({ at: m.sentAt.slice(0, 16), from: m.fromEmail, subject: m.subject?.slice(0, 60) })));
process.exit(0);
```

Run it (from `web/`, so env + relative imports resolve):

```sh
npx tsx --env-file=.env.local scripts/dryrun.ts outlook
npx tsx --env-file=.env.local scripts/dryrun.ts gmail
```

Gate: 10 real headers per provider, correct order, no writes anywhere
(`SELECT count(*) FROM pipeline.raw_objects` unchanged).

## 2. Flip an account live (stage 4)

Operator decision, per account — set the mailbox stamp first (Gmail = the
walled `biz` mailbox, DEC-6):

```sql
UPDATE pipeline.connector_accounts SET mailbox_id = 'biz'
 WHERE provider = 'gmail' AND address = '<addr>';
UPDATE pipeline.connector_accounts SET status = 'active'
 WHERE provider = '<provider>' AND address = '<addr>';
```

## 3. Trigger the ingest cron

```sh
curl -s "https://<pilot-deployment>/api/cron/ingest-email?k=$CRON_SECRET" | jq .
```

- First run: pulls up to 200 newest (Gmail) / full inbox delta pages (Graph),
  lands RAW → staged → canonical, stores the cursor.
- Second run immediately after: `landed: 0, skipped: N` or `pulled: 0` —
  idempotency is the stage-4 gate.
- Failures flip the row to `status='error'` with `last_error`; fix, then set
  `status='active'` again. Run counts land in `app.audit_log`
  (`action = 'ingest.run'`).
