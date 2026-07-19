-- ════════════════════════════════════════════════════════════════════════
-- 016 — Scope an agent to specific data sources
--
-- With one mailbox, "which source?" had one answer and the question was noise.
-- With a second mailbox and Google Drive, it becomes the difference between a
-- Public Works agent reading permit PDFs and the same agent also digesting
-- someone's personal inbox.
--
-- EMPTY MEANS EVERY SOURCE IN ITS LANE — the existing behaviour, so every agent
-- created before this migration keeps working unchanged. A non-empty array
-- narrows retrieval to those connector accounts.
--
-- This narrows WITHIN the mailbox wall; it never crosses it. A gov-lane agent
-- listing a biz-lane account still sees nothing from it: the lane filter in
-- lib/agent-focus.ts runs regardless, and this is an additional AND.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE app.agents
    ADD COLUMN IF NOT EXISTS sources text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app.agents.sources IS
  'Connector accounts this agent reads (provenance._account values). Empty = every source in its lane.';
