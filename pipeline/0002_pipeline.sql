-- ════════════════════════════════════════════════════════════════════════
-- Medallion pipeline bookkeeping (migration 0002). Schema `pipeline`.
--   RAW (immutable landing)  → pipeline.raw_objects
--   STAGED (normalized)      → pipeline.staged_messages
--   checkpoint/state machine → pipeline.ingest_log  (state IS the checkpoint)
--   ambiguous merges         → pipeline.review_queue (no silent hard-merge)
-- CANONICAL is canonical.* (migration 0001). RAW is the source of truth for
-- replay; CANONICAL is the source of truth for answers. Full rebuild from RAW
-- is a routine op (truncate canonical.* + pipeline.staged_messages, re-run).
--
-- Phase 0 lands RAW in Postgres for runnability; swap to Cloudflare R2 /
-- Supabase Storage behind the same raw_ref pointer later.
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS pipeline;

-- Immutable RAW landing. Same key + matching checksum → skip; differing
-- checksum → new version (never overwrite).
CREATE TABLE IF NOT EXISTS pipeline.raw_objects (
    raw_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    ingest_key TEXT NOT NULL,
    source     TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    version    INT  NOT NULL DEFAULT 1,
    checksum   TEXT NOT NULL,
    payload    JSONB NOT NULL,
    landed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_raw_version UNIQUE (ingest_key, version)
);

-- The checkpoint. Every unit is in exactly one known state — no silent drops.
CREATE TABLE IF NOT EXISTS pipeline.ingest_log (
    ingest_key TEXT PRIMARY KEY,
    tenant_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    source     TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    state      TEXT NOT NULL DEFAULT 'landed'
                   CHECK (state IN ('landed','staged','canonical','dead_lettered')),
    raw_ref    UUID REFERENCES pipeline.raw_objects(raw_id) ON DELETE SET NULL,
    error      TEXT,
    landed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingest_state  ON pipeline.ingest_log (state);
CREATE INDEX IF NOT EXISTS idx_ingest_source ON pipeline.ingest_log (source);

-- STAGED: the normalized envelope, unresolved. Postgres (not object store)
-- because resolution joins against it.
CREATE TABLE IF NOT EXISTS pipeline.staged_messages (
    ingest_key  TEXT PRIMARY KEY REFERENCES pipeline.ingest_log(ingest_key) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    source      TEXT NOT NULL,
    source_ref  TEXT NOT NULL,
    thread_ref  TEXT NOT NULL,
    direction   TEXT NOT NULL,
    sent_at     TIMESTAMPTZ,
    subject     TEXT,
    from_name   TEXT,
    from_email  TEXT,
    to_email    TEXT,
    cc          TEXT,
    department  TEXT,
    topic       TEXT,
    clean_body  TEXT NOT NULL,
    sensitivity TEXT NOT NULL DEFAULT 'internal',
    pii_flags   JSONB NOT NULL DEFAULT '{}'::jsonb,
    seq         INT,
    openness    TEXT,
    provenance  JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_ref     UUID
);
CREATE INDEX IF NOT EXISTS idx_staged_thread ON pipeline.staged_messages (thread_ref);

-- Ambiguous entity assertions parked for human review (R2: no silent hard-merge).
CREATE TABLE IF NOT EXISTS pipeline.review_queue (
    review_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    kind               TEXT NOT NULL,        -- name_collision | address_collision | ...
    alias_norm         TEXT,
    alias_value        TEXT,
    incoming_entity_id UUID,
    existing_entity_id UUID,
    evidence_message_id UUID,
    confidence         NUMERIC(3,2),
    status             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','merged','rejected')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_review UNIQUE (kind, alias_norm, incoming_entity_id, existing_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_review_status ON pipeline.review_queue (status);
