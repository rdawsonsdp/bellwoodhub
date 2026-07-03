-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — the send cage lands (GO_LIVE_PLAN L1.7; RD go 2026-07-03)
-- Target: the pilot Supabase project (docs/GO_LIVE_PLAN.md — never the demo).
--
-- Approve now really sends — but ONLY through the cage (SEND_ENABLED=1 AND
-- recipient ∈ SAFE_SEND_ALLOWLIST, both env-scoped per deployment). The
-- drafts table records the outcome: sent_at when the provider accepted the
-- message, send_error when the attempt failed (draft stays 'approved' either
-- way — the human decision and the transmission are separate facts).
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE app.drafts
    ADD COLUMN IF NOT EXISTS sent_at    timestamptz,
    ADD COLUMN IF NOT EXISTS send_error text;
