-- ════════════════════════════════════════════════════════════════════════
-- 014 — Agents you can CREATE (the Agent Factory, RB-6)
--
-- Until now an agent could only exist by being typed into the DOMAIN_AGENTS
-- array in lib/domain-agents.ts and deployed. That made "Add an agent" a
-- mockup: the sheet described an interview that no code could complete. It
-- also capped the product at seven desks, when the goal is one per department.
--
-- What made this possible tonight is FEAT-27 (focus): an agent's scope no
-- longer has to be a StreamKey enum value + a routing regex + a deploy. It can
-- be a sentence, resolved semantically. The google-security agent proved it —
-- `domains: []`, and its first live run produced 4 cited findings from 0
-- stream-routed messages. A created agent is that same shape, stored in a row.
--
-- WHAT STAYS IN CODE (deliberately — this table cannot express it):
--   * The autonomy ceiling. `autonomy` is CHECKed to observe|suggest|draft here
--     and re-validated in lib/agent-run.ts. There is no 'send'. A created agent
--     can never exceed what a code-defined one can do.
--   * The citation rules, the mailbox wall, and the send cage — all enforced in
--     the runner and the approvals path, not per-agent.
-- A row in this table adds a DESK. It cannot add a POWER.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.agents (
    agent_key    TEXT PRIMARY KEY
                 CHECK (agent_key ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
    name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    icon         TEXT NOT NULL DEFAULT 'smart_toy',
    color        TEXT NOT NULL DEFAULT '#7c8ca0',

    -- The one box. Plain English; the retrieval query is derived from it at
    -- save time and cached alongside (lib/agent-instruction.ts).
    instruction  TEXT NOT NULL CHECK (length(instruction) BETWEEN 1 AND 4000),
    focus_query  TEXT,
    focus_query_for TEXT,

    -- Constitution, not configuration. No 'send' value exists.
    autonomy     TEXT NOT NULL DEFAULT 'observe'
                 CHECK (autonomy IN ('observe', 'suggest', 'draft')),

    -- Which lane this desk reads: gov = public record, biz = walled private.
    -- Mirrors the provenance stamp so lib/agent-focus.ts can filter on it.
    mailbox      TEXT NOT NULL DEFAULT 'gov' CHECK (mailbox IN ('gov', 'biz')),

    active       BOOLEAN NOT NULL DEFAULT true,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agents_active_idx ON app.agents (active) WHERE active;

-- Same deny-all posture as every other table (003_rls.sql): the app connects
-- as the BYPASSRLS service role, so RLS with zero policies is the intent.
ALTER TABLE app.agents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON app.agents FROM %I', r);
        END IF;
    END LOOP;
END $$;
