-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — agent skills (FEAT-21: uploadable rules, referenced by agents)
-- Target: the pilot Supabase project (docs/GO_LIVE_PLAN.md — never the demo).
--
-- RD 2026-07-05: "skills are the way to have specific rules for each agent" —
-- a skill is an operator-uploaded markdown module (voice guide, rules,
-- checklist) stored versioned in the DB, never code. Agents REFERENCE skills
-- through app.agent_skills; the runner injects attached skill content into
-- that agent's prompt. The constitution still binds — a skill can shape
-- voice and judgment, never grant autonomy (send stays human-gated in code).
--
-- Deny-all RLS, self-contained like 011. Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.skills (
    skill_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    kind        text NOT NULL DEFAULT 'rules',   -- 'rules' | 'voice' | 'checklist' | 'knowledge'
    content     text NOT NULL,                   -- the uploaded skill.md body
    version     int  NOT NULL DEFAULT 1,         -- bumped on re-upload of the same name
    updated_by  text,                            -- session email of the uploader
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.agent_skills (
    agent_key   text NOT NULL,
    skill_id    uuid NOT NULL REFERENCES app.skills(skill_id) ON DELETE CASCADE,
    attached_by text,
    attached_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_key, skill_id)
);

CREATE INDEX IF NOT EXISTS agent_skills_agent_idx ON app.agent_skills (agent_key);

ALTER TABLE app.skills       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agent_skills ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
        EXECUTE format('REVOKE ALL ON app.skills FROM %I', r);
        EXECUTE format('REVOKE ALL ON app.agent_skills FROM %I', r);
    END LOOP;
END $$;
