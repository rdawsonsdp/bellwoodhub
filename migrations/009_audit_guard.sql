-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — audit ledger trigger guard (compliance gap 5.6)
-- Target: the pilot Supabase project (bellwood-mayor), after 004_audit.sql
--
-- 004 made app.audit_log append-only by revokes + convention and
-- deliberately omitted a trigger ("the owning role could bypass it").
-- That was the gap: the app connects AS the table-owning service role,
-- so revokes never bound the one role that actually writes. This trigger
-- does — it fires for every role, owner included. The owner could still
-- DROP the trigger, but that is a visible DDL act in the Postgres logs,
-- not a silent row edit; the honest claim moves from "convention" to
-- "enforced at the DB, subvertible only by logged DDL".
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- Guard function — any UPDATE or DELETE on the ledger is an error
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.audit_log_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'app.audit_log is append-only';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- Trigger — BEFORE, so the write never happens
-- ────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_log_append_only ON app.audit_log;

CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON app.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION app.audit_log_guard();
