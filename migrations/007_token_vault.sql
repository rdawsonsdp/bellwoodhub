-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — connector refresh tokens → Supabase Vault (Gap 5.3,
-- docs/EMAIL_INGESTION.md §8.5; supabase_vault v0.3.1 is pre-installed).
-- Target: the pilot Supabase project (docs/GO_LIVE_PLAN.md — never the demo).
--
-- Tokens now live in Supabase Vault — encrypted at rest with keys held
-- OUTSIDE the database — read back through vault.decrypted_secrets by the
-- uuid stored in refresh_token_ref (web/lib/connectors/token-store.ts).
-- The legacy plaintext refresh_token column is RETAINED for rollback and
-- MUST hold NULL going forward; token-store never writes it.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE pipeline.connector_accounts
    ADD COLUMN IF NOT EXISTS refresh_token_ref uuid;  -- vault.secrets id

-- ────────────────────────────────────────────────────────────────────────
-- Backfill: move any plaintext token still in the legacy column into the
-- vault (name 'connector:'||provider||':'||address) and NULL the column.
-- Guarded: skips when the vault schema is absent (plain Postgres / local
-- dev), reuses + refreshes a same-named secret left by a prior partial
-- run, and matches zero rows once the column is NULL — idempotent.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    acct record;
    sid  uuid;
BEGIN
    IF to_regclass('vault.secrets') IS NULL THEN
        RAISE NOTICE '007_token_vault: vault schema absent — skipping token backfill';
        RETURN;
    END IF;

    FOR acct IN
        SELECT id, provider, address, refresh_token
          FROM pipeline.connector_accounts
         WHERE refresh_token IS NOT NULL
    LOOP
        -- vault secret names are unique: reuse (and refresh) one left behind
        -- by a prior partial run rather than colliding on create.
        SELECT s.id INTO sid FROM vault.secrets s
         WHERE s.name = 'connector:' || acct.provider || ':' || acct.address;
        IF sid IS NULL THEN
            sid := vault.create_secret(
                acct.refresh_token,
                'connector:' || acct.provider || ':' || acct.address);
        ELSE
            PERFORM vault.update_secret(sid, acct.refresh_token);
        END IF;
        UPDATE pipeline.connector_accounts
           SET refresh_token_ref = sid,
               refresh_token     = NULL
         WHERE id = acct.id;
    END LOOP;
END $$;
