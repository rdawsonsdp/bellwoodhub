-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — cross-device user state + usage events (GO_LIVE_PLAN L2.3)
-- Target: Supabase project "bellwood-pilot" (applied after 002/003/004, L1.2)
--
-- One state of truth across phone and desktop. `app.user_state` replaces the
-- per-device localStorage keys (bw-queue-state / bw-operator-mode / persona)
-- once L0.1 auth supplies user_email; localStorage stays as the offline
-- write-through cache. `app.usage_events` replaces the bw-usage ring buffer
-- (web/lib/usage.ts); the four adoption metrics aggregate from here.
--
-- DEMO mode (no DATABASE_URL) never touches these tables — localStorage and
-- the console line serve instead.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

-- ────────────────────────────────────────────────────────────────────────
-- app.user_state — one row per (user, key); replaces localStorage
-- bw-queue-state / bw-operator-mode / persona once auth lands
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.user_state (
    user_email text NOT NULL,                     -- Auth.js session email (L0.1 allowlist identity)
    key        text NOT NULL,                     -- 'queue-state' | 'operator-mode' | 'persona' | …
    value      jsonb NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_email, key)                 -- upsert identity; last write wins
);

-- ────────────────────────────────────────────────────────────────────────
-- app.usage_events — append-only; replaces the bw-usage ring buffer; the
-- four adoption metrics (usageSummary) aggregate from here
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.usage_events (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email text,                              -- nullable: pre-auth / cron-emitted events
    t          text NOT NULL,                     -- app_open | first_tap | queue_clear | fixit_used | digest_open
    at         timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL DEFAULT '{}'        -- UsageEvent.data (ms, agentKey, …)
);

-- Metric aggregation scans by event type, newest first.
CREATE INDEX IF NOT EXISTS usage_events_t_at_idx
    ON app.usage_events (t, at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- RLS — enabled with NO policies (same posture as 003_rls.sql): anon and
-- authenticated roles see nothing; the app connects with the service role,
-- which bypasses RLS.
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE app.user_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.usage_events ENABLE ROW LEVEL SECURITY;
