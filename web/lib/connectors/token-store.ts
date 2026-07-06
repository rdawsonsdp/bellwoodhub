/*
 * token-store.ts — OAuth refresh tokens in Supabase Vault (Gap 5.3,
 * docs/EMAIL_INGESTION.md §8.5). Tokens are encrypted at rest with keys held
 * OUTSIDE the database; pipeline.connector_accounts.refresh_token_ref holds
 * the vault.secrets id (migrations/007_token_vault.sql). The legacy plaintext
 * refresh_token column is rollback-only and MUST hold NULL going forward —
 * nothing here ever writes a token to it. Read-only scopes forever; this
 * module stores/reads credentials, it never talks to a provider.
 */
import { query } from "../db";

const secretName = (provider: string, address: string) => `connector:${provider}:${address}`;

/** vault.update_secret ships with supabase_vault v0.3.1, but guard anyway —
 *  a vault without it gets delete + re-create under the same name instead. */
async function hasUpdateSecret(): Promise<boolean> {
  const rows = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'vault' AND p.proname = 'update_secret') AS ok`,
  );
  return !!rows[0]?.ok;
}

/**
 * Upsert the connector_accounts row and put the refresh token in the vault —
 * create on first consent, rotate in place on re-consent. The plaintext
 * refresh_token column is never written (it is NULLed alongside setting the
 * ref, enforcing the 007 invariant even on pre-migration rows).
 */
export async function storeRefreshToken({
  provider,
  address,
  mailboxId,
  token,
}: {
  provider: "outlook" | "gmail";
  address: string;
  mailboxId?: string; // lib/mailboxes.ts stamp; omitted = keep existing / default 'gov'
  token: string;
}): Promise<void> {
  // Account row first: status stays 'pending' on insert — an operator flips
  // it to 'active' before the ingest cron will touch it (006_connectors.sql).
  // Re-consent HEALS an errored row (fresh token = the fix for invalid_grant,
  // e.g. Google's 7-day Testing-mode expiry) — but never skips the pending
  // gate: only 'error' flips back to 'active'.
  const rows = await query<{ id: string; refresh_token_ref: string | null }>(
    `INSERT INTO pipeline.connector_accounts (provider, address, mailbox_id)
     VALUES ($1, $2, COALESCE($3, 'gov'))
     ON CONFLICT (provider, address) DO UPDATE
        SET mailbox_id = COALESCE($3, pipeline.connector_accounts.mailbox_id),
            status = CASE WHEN pipeline.connector_accounts.status = 'error'
                          THEN 'active' ELSE pipeline.connector_accounts.status END,
            last_error = NULL
     RETURNING id, refresh_token_ref`,
    [provider, address, mailboxId ?? null],
  );
  const accountId = rows[0].id;

  // Resolve the target secret: the row's ref, else a same-named secret left
  // by a prior partial run (vault secret names are unique).
  let secretId = rows[0].refresh_token_ref;
  if (!secretId) {
    const stale = await query<{ id: string }>(
      `SELECT id FROM vault.secrets WHERE name = $1`,
      [secretName(provider, address)],
    );
    secretId = stale[0]?.id ?? null;
  }

  if (secretId && (await hasUpdateSecret())) {
    // Rotate in place — the ref stays stable.
    await query(`SELECT vault.update_secret($1::uuid, $2::text)`, [secretId, token]);
  } else {
    if (secretId) {
      // No update_secret in this vault: replace under the same name.
      await query(`DELETE FROM vault.secrets WHERE id = $1`, [secretId]);
    }
    const created = await query<{ id: string }>(
      `SELECT vault.create_secret($1::text, $2::text) AS id`,
      [token, secretName(provider, address)],
    );
    secretId = created[0].id;
  }

  await query(
    `UPDATE pipeline.connector_accounts
        SET refresh_token_ref = $2, refresh_token = NULL WHERE id = $1`,
    [accountId, secretId],
  );
}

interface AccountTokenRow {
  id: string;
  provider: string;
  address: string;
  refresh_token_ref: string | null;
  refresh_token: string | null;
}

/**
 * Read a refresh token back: by connector_accounts id, or by
 * (provider, address). Vault ref is the source of truth; the legacy
 * plaintext column is consulted ONLY when the ref is null (pre-007 rows)
 * and warns loudly — a plaintext read after go-live means 007 hasn't run.
 * Returns null when there is nothing on file.
 */
export async function getRefreshToken(
  account: string | { provider: string; address: string },
): Promise<string | null> {
  const rows =
    typeof account === "string"
      ? await query<AccountTokenRow>(
          `SELECT id, provider, address, refresh_token_ref, refresh_token
             FROM pipeline.connector_accounts WHERE id = $1`,
          [account],
        )
      : await query<AccountTokenRow>(
          `SELECT id, provider, address, refresh_token_ref, refresh_token
             FROM pipeline.connector_accounts WHERE provider = $1 AND address = $2`,
          [account.provider, account.address],
        );
  const row = rows[0];
  if (!row) return null;

  if (row.refresh_token_ref) {
    const secret = await query<{ decrypted_secret: string }>(
      `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1`,
      [row.refresh_token_ref],
    );
    return secret[0]?.decrypted_secret ?? null;
  }

  if (row.refresh_token) {
    console.warn(
      `[token-store] ${row.provider}:${row.address} read from the legacy plaintext column — run migrations/007_token_vault.sql`,
    );
    return row.refresh_token;
  }
  return null;
}
