-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — calendar events (Go-Live: the pilot's Google Calendar)
-- Target: the pilot Supabase project (docs/GO_LIVE_PLAN.md — never the demo).
--
-- app.calendar_events — a rolling read-only mirror of the connected Google
-- account's primary calendar (−7d … +60d), refreshed by the ingest-calendar
-- cron (web/app/api/cron/ingest-calendar). One row per event occurrence;
-- the cron replaces the window wholesale per account, so cancellations and
-- reschedules never linger. Feeds /api/events and the Wall's "Coming up"
-- card. Scope calendar.readonly forever — no connector ever writes back.
--
-- Deny-all RLS, self-contained like 006: only the BYPASSRLS service role
-- the app connects with can read the rows.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.calendar_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        text NOT NULL DEFAULT 'gcal',
    account_address text NOT NULL,                     -- the connected account's email
    event_ref       text NOT NULL,                     -- Google Calendar event id
    title           text,                              -- event summary
    starts_at       timestamptz NOT NULL,
    ends_at         timestamptz,
    all_day         boolean NOT NULL DEFAULT false,    -- date-only start (start.date, not start.dateTime)
    status          text NOT NULL DEFAULT 'confirmed', -- Google status: confirmed / tentative / cancelled
    location        text,
    raw             jsonb NOT NULL DEFAULT '{}',       -- the provider event, verbatim (replay/debug)
    synced_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, account_address, event_ref)
);

-- ────────────────────────────────────────────────────────────────────────
-- Index — every reader (agenda, "Coming up") scans by start time
-- ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS calendar_events_starts_at_idx ON app.calendar_events (starts_at);

-- ────────────────────────────────────────────────────────────────────────
-- Deny-all RLS (ISS-4 posture, self-contained so 003 needs no re-run):
-- RLS on, zero policies — non-bypass roles see nothing. Belt + braces,
-- revoke the grants from the Supabase API roles too.
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE app.calendar_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        -- Supabase roles; absent on plain Postgres (local dev).
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
        EXECUTE format('REVOKE ALL ON app.calendar_events FROM %I', r);
    END LOOP;
END $$;
