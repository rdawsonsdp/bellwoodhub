-- ════════════════════════════════════════════════════════════════════════
-- AI Chief of Staff — canonical knowledge model (migration 0001)
-- Target: Supabase project "emailagent" (same DB as the `poc` POC schema).
--
-- SAFETY: Everything lives in the dedicated `canonical` schema. The ONLY object
-- created outside it is the pgvector extension in Supabase's `extensions`
-- schema (already present from the poc migration; CREATE ... IF NOT EXISTS is a
-- harmless no-op). NOTHING in `poc` is read, dropped, or altered. This is the
-- additive half of the strangler-fig cutover: `poc` keeps serving the live
-- demo while `canonical` is populated alongside it.
--
-- Authoritative source: design doc §4 (v1.0). Deviations from §4, all additive:
--   * tenant_id on every table (multi-tenant from day one; single synthetic
--     tenant in Phase 0).
--   * entity_aliases carries alias_norm + retracted_at (reversible assertion
--     ledger — a false merge is undone by stamping retracted_at, never a DELETE).
--   * message_topics replaces a single topic column (M:N, confidence-scored).
--   * messages carries raw_ref (pointer to the immutable RAW object), plus
--     practical envelope columns (subject/from_*/department/ingest_key).
--   * chunks.embedding is vector(1024) (Voyage voyage-4-large), distinct from
--     poc.email_chunks vector(1536) (OpenAI). Never mix the two.
--
-- AD-5 / AD-6: edges reference IMMUTABLE alias_id (never mutable entity_id);
-- issue state is a FOLD over `events`, exposed as the canonical.issue_state
-- view — `issues.derived_status` is only a refreshable cache, never the truth.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS canonical;

-- ────────────────────────────────────────────────────────────────────────
-- 0. Tenancy bootstrap. Phase 0 is one synthetic tenant; the column exists on
--    every table so a second tenant (or an Aurora-in-VPC move) is an op, not a
--    redesign.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.tenants (
    tenant_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    domains     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- internal-vs-constituent + stream derivation (replaces hard-coded *-demo.gov)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The single Phase-0 synthetic tenant. Fixed UUID so every DEFAULT below lines up.
INSERT INTO canonical.tenants (tenant_id, slug, display_name, domains)
VALUES ('00000000-0000-0000-0000-000000000001', 'bellwood-synthetic',
        'Village of Bellwood (synthetic)',
        '["bellwood-demo.gov","illinois-demo.gov","cookcounty-demo.gov"]'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

-- Convenience: the default tenant for single-tenant Phase-0 inserts.
DO $$ BEGIN PERFORM set_config('app.default_tenant',
    '00000000-0000-0000-0000-000000000001', false); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Identity assertion ledger (AD-6).
--    entities = mutable identity record. entity_aliases = the immutable,
--    reversible ledger that maps a normalized alias to an identity. A merge is
--    an alias re-assertion; an un-merge is a retracted_at stamp. Edges point at
--    alias_id so neither corrupts the graph.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.entities (
    entity_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                       REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    entity_type    TEXT NOT NULL,            -- person | parcel | organization | department | official | business
    canonical_name TEXT NOT NULL,
    attributes     JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence     NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.entity_aliases (
    alias_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                          REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    entity_id         UUID NOT NULL REFERENCES canonical.entities(entity_id) ON DELETE CASCADE,
    alias_type        TEXT NOT NULL,         -- email | name_variant | address | phone_string | business_name
    alias_value       TEXT NOT NULL,         -- as written
    alias_norm        TEXT NOT NULL,         -- normalize.py output (lookup key)
    source            TEXT NOT NULL,         -- email_header | own_text | persona_registry | 311_crm | gis_import
    source_message_id UUID,                  -- evidence (FK added after messages exists)
    confidence        NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    asserted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retracted_at      TIMESTAMPTZ            -- non-null => reversed; never hard-deleted
);
-- Exactly one ACTIVE identity per normalized alias per type per tenant. A
-- competing assertion can't silently hard-merge — it goes to the review queue.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alias_active
    ON canonical.entity_aliases (tenant_id, alias_type, alias_norm)
    WHERE retracted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alias_entity ON canonical.entity_aliases (entity_id);
CREATE INDEX IF NOT EXISTS idx_alias_norm   ON canonical.entity_aliases (tenant_id, alias_norm);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Controlled issue taxonomy. derived_status is a CACHE; the truth is the
--    fold (see canonical.issue_state view at the bottom).
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.issues (
    issue_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                       REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    issue_type     TEXT NOT NULL,            -- flooding | zoning | licensing | public_safety | water_billing | ...
    title          TEXT NOT NULL,
    derived_status TEXT NOT NULL DEFAULT 'open',  -- CACHE ONLY (open|in_progress|resolved|escalated)
    opened_at      TIMESTAMPTZ NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────
-- 3. Messaging foundations.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.threads (
    thread_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                          REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    source            TEXT NOT NULL,
    source_thread_ref TEXT NOT NULL,         -- upstream thread id (poc thr-xxxx)
    subject           TEXT,
    first_seen        TIMESTAMPTZ NOT NULL,
    last_seen         TIMESTAMPTZ NOT NULL,
    issue_id          UUID REFERENCES canonical.issues(issue_id) ON DELETE SET NULL,
    CONSTRAINT uq_thread_source UNIQUE (tenant_id, source, source_thread_ref)
);
CREATE INDEX IF NOT EXISTS idx_threads_issue ON canonical.threads (issue_id);

CREATE TABLE IF NOT EXISTS canonical.messages (
    message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                        REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    thread_id       UUID NOT NULL REFERENCES canonical.threads(thread_id) ON DELETE CASCADE,
    source          TEXT NOT NULL,           -- synthetic_email | email | 311 | voicemail | board_minutes ...
    source_ref      TEXT NOT NULL,           -- RFC Message-ID / ticket no. / file hash
    ingest_key      TEXT NOT NULL,           -- hash(source + source_ref); medallion dedup key
    sender_alias_id UUID REFERENCES canonical.entity_aliases(alias_id) ON DELETE SET NULL,
    sent_at         TIMESTAMPTZ NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
    subject         TEXT,
    from_name       TEXT,
    from_email      TEXT,
    to_email        TEXT,
    cc              TEXT,
    department      TEXT,
    clean_body      TEXT NOT NULL,           -- DELTA content only (quotes/sig/disclaimer stripped)
    raw_ref         TEXT,                    -- pointer to the immutable RAW object (re-derivable source of truth)
    pii_flags       JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensitivity     TEXT NOT NULL DEFAULT 'internal' CHECK (sensitivity IN ('public','internal','restricted')),
    is_synthetic    BOOLEAN NOT NULL DEFAULT true,
    provenance      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- _scenario/_source/_seq/_openness etc.
    CONSTRAINT unique_source_ref UNIQUE (source, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_sent ON canonical.messages (tenant_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_thread      ON canonical.messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender      ON canonical.messages (sender_alias_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction   ON canonical.messages (tenant_id, direction, sent_at);

-- Late FK: alias evidence points back at a message.
DO $$ BEGIN
    ALTER TABLE canonical.entity_aliases
        ADD CONSTRAINT fk_alias_evidence
        FOREIGN KEY (source_message_id) REFERENCES canonical.messages(message_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS canonical.message_topics (
    message_id        UUID NOT NULL REFERENCES canonical.messages(message_id) ON DELETE CASCADE,
    topic             TEXT NOT NULL,
    confidence        NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    classifier_version TEXT NOT NULL DEFAULT 'seed',
    PRIMARY KEY (message_id, topic)
);
CREATE INDEX IF NOT EXISTS idx_message_topics_topic ON canonical.message_topics (topic);

-- ────────────────────────────────────────────────────────────────────────
-- 4. Knowledge graph. src_id/dst_id are alias_id when the endpoint is an
--    entity (AD-6); for message/thread/issue endpoints they are those ids.
--    src_type/dst_type disambiguate. Every edge carries its citation.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.edges (
    edge_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                            REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    src_id              UUID NOT NULL,
    src_type            TEXT NOT NULL,       -- alias | message | thread | issue
    relation            TEXT NOT NULL,       -- authored | concerns_address | mentions | discussed_in | about_property | has_commitment | derived_from
    dst_id              UUID NOT NULL,
    dst_type            TEXT NOT NULL,
    evidence_message_id UUID REFERENCES canonical.messages(message_id) ON DELETE SET NULL,
    confidence          NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    asserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retracted_at        TIMESTAMPTZ,
    CONSTRAINT uq_edge UNIQUE (tenant_id, src_id, relation, dst_id)
);
CREATE INDEX IF NOT EXISTS idx_edges_src ON canonical.edges (src_id, relation);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON canonical.edges (dst_id, relation);

-- ────────────────────────────────────────────────────────────────────────
-- 5. Commitments + event log. Commitments reference entities (design §4);
--    events are append-only and are the source of truth for issue state.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.commitments (
    commitment_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                            REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    commitment_text     TEXT NOT NULL,
    owner_entity_id     UUID REFERENCES canonical.entities(entity_id) ON DELETE SET NULL,
    recipient_entity_id UUID REFERENCES canonical.entities(entity_id) ON DELETE SET NULL,
    issue_id            UUID REFERENCES canonical.issues(issue_id) ON DELETE CASCADE,
    source_message_id   UUID REFERENCES canonical.messages(message_id) ON DELETE CASCADE,
    due_at              TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','overdue','dropped')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commitments_issue  ON canonical.commitments (issue_id);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON canonical.commitments (tenant_id, status, due_at);

CREATE TABLE IF NOT EXISTS canonical.events (
    event_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                    REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    issue_id    UUID NOT NULL REFERENCES canonical.issues(issue_id) ON DELETE CASCADE,
    message_id  UUID REFERENCES canonical.messages(message_id) ON DELETE SET NULL,
    event_type  TEXT NOT NULL,               -- opened | reopened | update | note | commitment_made | resolved | escalated
    occurred_at TIMESTAMPTZ NOT NULL,        -- the fold orders by THIS (handles out-of-order arrival)
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Append-only + idempotent: replaying the pipeline never double-inserts.
    CONSTRAINT uq_event UNIQUE (issue_id, event_type, occurred_at, message_id)
);
CREATE INDEX IF NOT EXISTS idx_events_issue_occurred ON canonical.events (issue_id, occurred_at);

-- ────────────────────────────────────────────────────────────────────────
-- 6. Vector layer — Voyage voyage-4-large, dim 1024 (NOT comparable to the
--    poc 1536 OpenAI vectors; separate table, separate index).
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical.chunks (
    chunk_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                    REFERENCES canonical.tenants(tenant_id) ON DELETE CASCADE,
    message_id  UUID NOT NULL REFERENCES canonical.messages(message_id) ON DELETE CASCADE,
    chunk_index INT  NOT NULL,
    chunk_text  TEXT NOT NULL,
    token_count INT  NOT NULL,
    embedding   extensions.vector(1024),
    CONSTRAINT uq_chunk UNIQUE (message_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON canonical.chunks USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_message ON canonical.chunks (message_id);

-- ────────────────────────────────────────────────────────────────────────
-- 7. Issue state = FOLD over events (AD-5). The truth, computed read-time, so
--    a late/out-of-order message re-folds a "resolved" issue back open. The
--    last state-setting event by occurred_at wins; note/update don't set state.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW canonical.issue_state AS
SELECT
    i.issue_id,
    i.tenant_id,
    i.title,
    i.issue_type,
    i.opened_at,
    COALESCE((
        SELECT CASE
                 WHEN ev.event_type IN ('opened','reopened','update') THEN 'open'
                 WHEN ev.event_type = 'resolved'  THEN 'resolved'
                 WHEN ev.event_type = 'escalated' THEN 'escalated'
               END
        FROM canonical.events ev
        WHERE ev.issue_id = i.issue_id
          AND ev.event_type IN ('opened','reopened','update','resolved','escalated')
        ORDER BY ev.occurred_at DESC, ev.recorded_at DESC
        LIMIT 1
    ), 'open') AS state,
    (SELECT max(ev.occurred_at) FROM canonical.events ev WHERE ev.issue_id = i.issue_id) AS last_activity_at
FROM canonical.issues i;

-- ────────────────────────────────────────────────────────────────────────
-- 8. RLS STUBS. Enabled on every table so the structure is Phase-1-ready, but
--    permissive (single-tenant pass-through) in Phase 0.
--    ⚠ CAVEAT: the pipeline + web app connect as the table-owning DATABASE_URL
--    role, which BYPASSES RLS. These policies enforce NOTHING until a
--    non-bypass app role + `SET app.tenant_id` lands in Phase 1. Do not mistake
--    the stub for working isolation.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  -- NB: message_topics is intentionally excluded — it is a child of messages
  -- keyed by message_id with no tenant_id column, so a tenant_passthrough
  -- policy can't reference tenant_id (it would error: column does not exist).
  FOREACH t IN ARRAY ARRAY[
    'tenants','entities','entity_aliases','issues','threads','messages',
    'edges','commitments','events','chunks'
  ] LOOP
    EXECUTE format('ALTER TABLE canonical.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS tenant_passthrough ON canonical.%I;
      CREATE POLICY tenant_passthrough ON canonical.%I
        USING (current_setting('app.tenant_id', true) IS NULL
               OR tenant_id::text = current_setting('app.tenant_id', true));
    $p$, t, t);
  END LOOP;
END $$;
