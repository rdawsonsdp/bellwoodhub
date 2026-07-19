-- ════════════════════════════════════════════════════════════════════════
-- 017 — Triage & "What Needs You" ranking
--
-- A system-level pass (NOT an agent) that sorts every thread into needs_reply /
-- awaiting_others / fyi and ranks the needs_reply items by named, explainable
-- rules. Reasons are templated from which rules fired — never model prose — so
-- "why did the AI rank this first" survives a FOIA request.
--
-- Three tables:
--   message_triage    — one current row per thread (keyed on its latest
--                       message), upserted each pass. Re-running REPLACES, never
--                       accumulates (BUG-2's idempotency lesson).
--   triage_corrections— append-only per-item exec overrides, applied at READ
--                       time so the computed triage stays pure and reversible.
--   important_senders — the tenant's "people whose mail matters" list. Seeded
--                       with defaults, but EDITABLE IN-APP so the exec can update
--                       it when a developer isn't available (RD directive).
--
-- BUG-3 GUARD: append-only is not private. All three tables get RLS enabled and
-- REVOKE from anon/authenticated in THIS migration (003_rls is not re-run for
-- new tables — 011/013/014/015/016 set the precedent). Verified: anon cannot
-- SELECT any of them.
-- ════════════════════════════════════════════════════════════════════════

-- ── message_triage ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.message_triage (
    message_id    uuid NOT NULL REFERENCES canonical.messages(message_id) ON DELETE CASCADE,
    tenant        text NOT NULL,
    bucket        text NOT NULL CHECK (bucket IN ('needs_reply','awaiting_others','fyi')),
    rank          int,                         -- order within needs_reply; null for other buckets
    score         numeric NOT NULL DEFAULT 0,  -- urgency score, drives rank
    signals       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- which named rules fired + detail
    reason        text NOT NULL DEFAULT '',    -- templated plain-English "why"
    classified_at timestamptz NOT NULL DEFAULT now(),
    -- one current row per message per tenant; the pass upserts on this key
    PRIMARY KEY (tenant, message_id)
);
CREATE INDEX IF NOT EXISTS message_triage_bucket_idx
    ON app.message_triage (tenant, bucket, rank);

-- ── triage_corrections (append-only) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.triage_corrections (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid NOT NULL,
    tenant      text NOT NULL,
    correction  text NOT NULL CHECK (correction IN ('not_important','bump_up','not_waiting_on_me')),
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
-- read path wants the LATEST correction per message fast
CREATE INDEX IF NOT EXISTS triage_corrections_latest_idx
    ON app.triage_corrections (tenant, message_id, created_at DESC);

-- ── important_senders (in-app editable) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS app.important_senders (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant     text NOT NULL,
    -- `match` is an email or a domain fragment; `label` is the name the exec
    -- recognizes (defensibility: an entry is a person, not a regex).
    match      text NOT NULL,
    label      text NOT NULL,
    seeded     boolean NOT NULL DEFAULT false,  -- true = shipped default, false = exec-added
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant, match)
);

-- ── RLS + REVOKE (deny-all posture; app connects as BYPASSRLS service role) ──
DO $$
DECLARE t text;
DECLARE r text;
BEGIN
    FOREACH t IN ARRAY ARRAY['message_triage','triage_corrections','important_senders'] LOOP
        EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
        FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
                EXECUTE format('REVOKE ALL ON app.%I FROM %I', t, r);
            END IF;
        END LOOP;
    END LOOP;
END $$;
