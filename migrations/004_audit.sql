-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — audit ledger (ISS-5, Go-Live L0.4)
-- Target: the pilot Supabase project (applied at L1.2 alongside 002/003)
--
-- Every read and decision leaves a row: Ask queries, email opens,
-- approve/discard/fix-it, agent runs, queue reads. FOIA/Open Meetings +
-- the Mayor's own defense. web/lib/audit.ts is the only writer.
--
-- APPEND-ONLY BY CONVENTION: rows are INSERTed, never UPDATEd or DELETEd.
-- UPDATE/DELETE are revoked from PUBLIC and the Supabase API roles below;
-- a trigger/rule guard is deliberately omitted (the owning role could
-- bypass it anyway) — the revokes plus this stated convention are the
-- contract.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

-- ────────────────────────────────────────────────────────────────────────
-- app.audit_log — one row per audited action
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor       text,                                  -- session email; NULL until L0.1 auth threads it through
    action      text NOT NULL,                         -- dotted verb: 'ask.query', 'email.open', 'draft.approve', …
    object_type text,                                  -- kind of thing touched ('draft', 'message', …)
    object_ref  text,                                  -- its identity (draft_id, message_id, …)
    at          timestamptz NOT NULL DEFAULT now(),
    meta        jsonb NOT NULL DEFAULT '{}'            -- action-specific detail ({question}, {ran}, …)
);

-- ────────────────────────────────────────────────────────────────────────
-- Indexes — the ledger is read newest-first and filtered by action
-- ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS audit_log_at_idx     ON app.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON app.audit_log (action);

-- ────────────────────────────────────────────────────────────────────────
-- Append-only: no role may rewrite history
-- ────────────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON app.audit_log FROM PUBLIC;

-- Supabase API roles, when present (plain Postgres in dev won't have them).
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE UPDATE, DELETE ON app.audit_log FROM %I', r);
        END IF;
    END LOOP;
END $$;
