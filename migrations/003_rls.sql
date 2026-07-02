-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — row-level security lockdown (ISS-4, Go-Live L0.3)
-- Target: Supabase project "BellwoodHub" and the pilot project — every
-- table this project creates across the poc / canonical / pipeline / app
-- schemas (001_init_poc, canonical/0001, pipeline/0002, canonical/0003_app,
-- 002_domain_agents).
--
-- Posture: DENY-ALL. RLS is enabled on every table and NO policies are
-- created — with RLS on and zero policies, non-bypass roles see nothing.
-- ALL privileges are additionally REVOKEd from the Supabase `anon` and
-- `authenticated` roles. The app connects with the service role, which
-- has BYPASSRLS — nothing breaks for the app; the anon-key hole closes.
--
-- FORCE ROW LEVEL SECURITY is deliberately NOT applied: the table owner
-- (service role) must keep bypassing RLS.
--
-- canonical.issue_state is a VIEW (a fold over canonical.events), so RLS
-- cannot be enabled on it; the schema-wide REVOKE below covers it, and its
-- base table canonical.events is locked like every other table.
--
-- Every table is guarded with to_regclass so the file applies cleanly on
-- environments where some tables are missing (e.g. a fresh pilot project
-- before 002 has run). Idempotent: safe to re-run — and MUST be re-run
-- after any later migration that adds a table to these schemas.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- Enable RLS on every project table that exists
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        -- poc.* (migrations/001_init_poc.sql)
        'poc.emails',
        'poc.email_chunks',
        'poc.email_entities',
        -- canonical.* (canonical/0001_init_canonical.sql)
        'canonical.tenants',
        'canonical.entities',
        'canonical.entity_aliases',
        'canonical.issues',
        'canonical.threads',
        'canonical.messages',
        'canonical.message_topics',
        'canonical.edges',
        'canonical.commitments',
        'canonical.events',
        'canonical.chunks',
        -- canonical.* (migrations/002_domain_agents.sql)
        'canonical.agent_memory',
        'canonical.agent_runs',
        -- canonical.mailboxes is planned (FEAT-12, per-mailbox OAuth); the
        -- guard skips it until its migration lands — re-run this file then.
        'canonical.mailboxes',
        -- pipeline.* (pipeline/0002_pipeline.sql)
        'pipeline.raw_objects',
        'pipeline.ingest_log',
        'pipeline.staged_messages',
        'pipeline.review_queue',
        -- app.* (canonical/0003_app.sql)
        'app.drafts'
    ]
    LOOP
        IF to_regclass(t) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        END IF;
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- Deny-all: no CREATE POLICY anywhere in this file — that absence IS the
-- posture. Belt + braces, revoke the grants too, so even a future
-- permissive policy can't reopen the anon-key path by itself.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    s text;
    r text;
BEGIN
    FOREACH s IN ARRAY ARRAY['poc', 'canonical', 'pipeline', 'app'] LOOP
        -- Schema may not exist yet (fresh pilot project mid-bootstrap).
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s);
        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            -- Supabase roles; absent on plain Postgres (local dev).
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
            -- ALL TABLES includes views — this is what covers issue_state.
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', s, r);
        END LOOP;
    END LOOP;
END $$;
