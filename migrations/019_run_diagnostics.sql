-- ════════════════════════════════════════════════════════════════════════
-- 019 — Show the work (run diagnostics)
--
-- "To overcome agent anxiety, you must show the agent work" (RD 2026-07-21).
-- Every run now records its own execution: the model, the timing, the token
-- usage, exactly what it read (slice/focus/related/memory counts + the derived
-- query), the FULL prompt and raw response, and what validation dropped.
-- An eval surface inside the application — rendered as the "Show the work"
-- panel on the digest sheet, and honest enough to debug a desk from.
--
-- One nullable jsonb column on the existing runs table: runs from before this
-- migration simply have no recorded work (the panel says so), and the table's
-- RLS deny-all posture (BUG-3 guard) already covers the new column.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE canonical.agent_runs
    ADD COLUMN IF NOT EXISTS diagnostics jsonb;

COMMENT ON COLUMN canonical.agent_runs.diagnostics IS
  'Execution record: model, ms, tokens, inputs read, full prompt/response, validation drops. Null = run predates 019.';
