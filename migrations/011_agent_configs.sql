-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — agent configs (FEAT-19, first slice: the enable switch)
-- Target: the pilot Supabase project (docs/GO_LIVE_PLAN.md — never the demo).
--
-- RD 2026-07-03: agents are managed IN THE APP — first piece is the
-- disable toggle on each Staff Agents card. One row per agent key
-- (cos-agents roster and, as FEAT-19 lands fully, the domain registry);
-- absent row = enabled (code default). `overrides` is the future home of
-- in-app edits to goals / urgency rules / autonomy (never above the
-- constitution). Every flip is audited by the API route.
--
-- Deny-all RLS, self-contained like 006/008. Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.agent_configs (
    agent_key   text PRIMARY KEY,
    enabled     boolean NOT NULL DEFAULT true,
    overrides   jsonb NOT NULL DEFAULT '{}',   -- FEAT-19: goals/urgency/autonomy edits land here
    updated_by  text,                          -- session email of the last editor
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.agent_configs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
        EXECUTE format('REVOKE ALL ON app.agent_configs FROM %I', r);
    END LOOP;
END $$;
