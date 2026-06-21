-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Mayor's Office Email RAG POC — schema bootstrap
-- Target: Supabase project "emailagent" (ref rqbkxoniqmuyvvpjbegu)
--
-- SAFETY: Everything lives in the dedicated `poc` schema. The ONLY object
-- created outside `poc` is the pgvector extension, installed into Supabase's
-- standard `extensions` schema (required for vector columns; harmless if it
-- already exists). Nothing outside `poc` is dropped or altered.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- pgvector (vector type + hnsw/ivfflat access methods). Lives in `extensions`.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Dedicated schema — the only namespace this POC writes to.
CREATE SCHEMA IF NOT EXISTS poc;

-- ────────────────────────────────────────────────────────────────────────
-- poc.emails — one row per message
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poc.emails (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  text NOT NULL UNIQUE,                 -- stable RFC-style id; load key
    thread_id   text,                                 -- groups a reply chain
    direction   text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_name   text,
    from_email  text,
    to_email    text,
    cc          text,
    subject     text,
    date_sent   timestamptz,
    body_raw    text,                                 -- full body: sig + disclaimer + quoted history
    body_clean  text,                                 -- cleaned: sig/disclaimer/quotes stripped
    topic       text,                                 -- roads, water_billing, drainage, ...
    is_synthetic boolean NOT NULL DEFAULT true
);

-- ────────────────────────────────────────────────────────────────────────
-- poc.email_chunks — embedded slices of body_clean
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poc.email_chunks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id    uuid NOT NULL REFERENCES poc.emails(id) ON DELETE CASCADE,
    chunk_index int  NOT NULL,
    chunk_text  text NOT NULL,
    token_count int,
    embedding   extensions.vector(1536),              -- text-embedding-3-small
    UNIQUE (email_id, chunk_index)                     -- idempotent re-embed
);

-- ────────────────────────────────────────────────────────────────────────
-- poc.email_entities — extracted addresses / people / phones / businesses
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poc.email_entities (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id     uuid NOT NULL REFERENCES poc.emails(id) ON DELETE CASCADE,
    entity_type  text NOT NULL CHECK (entity_type IN ('address', 'person', 'phone', 'business')),
    entity_value text NOT NULL,                        -- as written in the email
    entity_norm  text NOT NULL,                        -- normalized for lookup
    UNIQUE (email_id, entity_type, entity_norm)        -- idempotent re-extract
);

-- ────────────────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────────────────

-- Approximate-NN over embeddings, cosine distance (pgvector HNSW).
CREATE INDEX IF NOT EXISTS email_chunks_embedding_hnsw
    ON poc.email_chunks
    USING hnsw (embedding extensions.vector_cosine_ops);

-- Lookups on emails.
CREATE INDEX IF NOT EXISTS emails_thread_id_idx  ON poc.emails (thread_id);
CREATE INDEX IF NOT EXISTS emails_from_email_idx ON poc.emails (from_email);
CREATE INDEX IF NOT EXISTS emails_date_sent_idx  ON poc.emails (date_sent);
CREATE INDEX IF NOT EXISTS emails_topic_idx      ON poc.emails (topic);

-- Entity lookups (address / person filters).
CREATE INDEX IF NOT EXISTS email_entities_norm_idx ON poc.email_entities (entity_norm);
CREATE INDEX IF NOT EXISTS email_entities_type_idx ON poc.email_entities (entity_type);
CREATE INDEX IF NOT EXISTS email_entities_email_id_idx ON poc.email_entities (email_id);
