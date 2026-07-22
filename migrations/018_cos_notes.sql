-- ════════════════════════════════════════════════════════════════════════
-- 018 — The Mayor's own notes (walk-ins, off-email follow-ups)
--
-- The record so far only knew what arrived by wire (email, calendar, Drive).
-- But a mayor's day is full of WALK-INS: a resident stops him at the counter
-- about a tree on Forrest Street, and that promise lives nowhere the Chief of
-- Staff can see. This table is the capture point — one spoken (or typed)
-- sentence, landed as an open follow-up the morning briefing folds in.
--
-- Deliberately tiny. A note is not an Envelope: no sender, no thread, no
-- embedding. It is the mayor telling his own staff something. If a note later
-- needs the full treatment (drafting, history), that's an agent reading this
-- table — not this table growing columns.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.cos_notes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant     text NOT NULL,
    body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    source     text NOT NULL DEFAULT 'voice' CHECK (source IN ('voice', 'text')),
    status     text NOT NULL DEFAULT 'open'  CHECK (status IN ('open', 'done')),
    created_at timestamptz NOT NULL DEFAULT now(),
    done_at    timestamptz
);
CREATE INDEX IF NOT EXISTS cos_notes_open_idx
    ON app.cos_notes (tenant, status, created_at DESC);

-- Same deny-all posture as every table since 003: RLS on, zero policies,
-- REVOKE from anon/authenticated — the BYPASSRLS service role is the only
-- reader (BUG-3 guard; each migration carries its own).
ALTER TABLE app.cos_notes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON app.cos_notes FROM %I', r);
        END IF;
    END LOOP;
END $$;
