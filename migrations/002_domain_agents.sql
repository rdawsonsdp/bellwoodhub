-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — domain agents: per-agent memory + run ledger
-- Target: Supabase project "BellwoodHub" (canonical schema already applied)
--
-- Backs the Look·Act·Know rebuild's domain-agent cabinet (web/lib/
-- domain-agents.ts). DEMO mode never touches these tables — fixtures in
-- web/lib/demo/data/ serve instead; the Phase 5 orchestrator
-- (/api/cron/agent-runs) is the writer.
--
-- The commitment rule — a memory item of kind 'commitment' may only be
-- closed by evidence (source_message_ids) or explicit mayor action — is
-- enforced in the runner (web/lib/agent-run.ts applyMemoryOps), not here.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS canonical;

-- ────────────────────────────────────────────────────────────────────────
-- canonical.agent_memory — one row per remembered item, per agent namespace
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.agent_memory (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_key           text NOT NULL,                -- registry key ('constituent', 'police', …)
    kind                text NOT NULL CHECK (kind IN ('open_issue', 'commitment', 'pattern', 'entity_note')),
    canonical_entity_id uuid,                         -- optional link into canonical.entities
    title               text NOT NULL,                -- upsert identity = (agent_key, kind, title)
    body                text,
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    occurrence_count    int  NOT NULL DEFAULT 1,      -- "3rd complaint at this address this quarter"
    source_message_ids  uuid[] NOT NULL DEFAULT '{}', -- canonical.messages ids (evidence trail)
    first_seen          timestamptz NOT NULL DEFAULT now(),
    last_seen           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agent_key, kind, title)
);

CREATE INDEX IF NOT EXISTS agent_memory_agent_status_idx
    ON canonical.agent_memory (agent_key, status);

-- ────────────────────────────────────────────────────────────────────────
-- canonical.agent_runs — the run ledger; the Wall reads each agent's latest
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.agent_runs (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_key text NOT NULL,
    ran_at    timestamptz NOT NULL DEFAULT now(),
    output    jsonb NOT NULL                          -- zod-validated AgentRunOutput
);

CREATE INDEX IF NOT EXISTS agent_runs_agent_ran_idx
    ON canonical.agent_runs (agent_key, ran_at DESC);
