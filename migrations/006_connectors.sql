-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — email connector accounts (ING-1, Go-Live L1.1/L1.4)
-- Target: the pilot Supabase project (docs/GO_LIVE_PLAN.md — never the demo).
--
-- pipeline.connector_accounts — one row per connected mailbox (Graph/Gmail).
-- The sign-in grant (web/lib/auth.ts) writes the row with status 'pending';
-- an operator flips it to 'active' before the ingest cron will touch it.
--
-- TOKENS LIVE HERE, service-role-only under RLS: deny-all posture (RLS on,
-- NO policies — same as 003_rls.sql), so only the BYPASSRLS service role the
-- app connects with can read them. Supabase Vault is the planned upgrade
-- (docs/EMAIL_INGESTION.md §8.5). Scopes are read-only forever (Mail.Read /
-- gmail.readonly) — no connector ever holds a send scope.
--
-- `cursor` holds the incremental sync position: the Graph deltaLink
-- (provider 'outlook') or the Gmail historyId (provider 'gmail').
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS pipeline;

CREATE TABLE IF NOT EXISTS pipeline.connector_accounts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider       text NOT NULL CHECK (provider IN ('outlook','gmail')),
    address        text NOT NULL,                     -- the connected account's email
    mailbox_id     text NOT NULL DEFAULT 'gov',       -- lib/mailboxes.ts stamp: gov = public record, biz = walled (DEC-6)
    refresh_token  text,                              -- OAuth refresh token; service-role-only under RLS
    cursor         text,                              -- Graph deltaLink / Gmail historyId
    status         text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','active','error','paused')),
    last_error     text,
    last_synced_at timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, address)
);

-- ────────────────────────────────────────────────────────────────────────
-- Deny-all RLS (ISS-4 posture, self-contained so 003 needs no re-run):
-- RLS on, zero policies — non-bypass roles see nothing. Belt + braces,
-- revoke the grants from the Supabase API roles too.
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE pipeline.connector_accounts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        -- Supabase roles; absent on plain Postgres (local dev).
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
        EXECUTE format('REVOKE ALL ON pipeline.connector_accounts FROM %I', r);
    END LOOP;
END $$;
