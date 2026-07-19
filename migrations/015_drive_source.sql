-- ════════════════════════════════════════════════════════════════════════
-- 015 — Google Drive as a data source (the first non-email connector)
--
-- Two changes to pipeline.connector_accounts:
--
--   1. provider gains 'gdrive'. The original CHECK allowed only outlook|gmail
--      because email was the only source; that constraint is now the thing
--      standing between the product and every other source.
--
--   2. a `config` jsonb. Email connectors need no per-account configuration —
--      a mailbox is a mailbox. A Drive connection does: WHICH file types to
--      pull, and which shared drives. Those answers come from the operator
--      during the interview, so they belong on the account row, not in code.
--
-- WHAT DOESN'T CHANGE, and this is the point: a Drive file lands in
-- canonical.messages exactly as an email does — filename as subject, owner as
-- sender, modified time as its date, extracted text as the body, folder as the
-- thread. Focus retrieval, the agents, Ask, and citations are all untouched and
-- work on Drive files the day they land. `provenance._source = 'gdrive'` marks
-- them so a screen can filter documents out of a mail list later without a
-- migration.
--
-- ACCESS. The connector reads only what the connected Google account can
-- already open: shared drives it belongs to, and items shared directly with it.
-- Not public links, and not the user's own private My Drive. Revoking access in
-- Drive revokes it here on the next sync — the permission stays the user's.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE pipeline.connector_accounts
    DROP CONSTRAINT IF EXISTS connector_accounts_provider_check;

ALTER TABLE pipeline.connector_accounts
    ADD CONSTRAINT connector_accounts_provider_check
    CHECK (provider IN ('outlook', 'gmail', 'gdrive'));

-- Per-account connector settings. For gdrive: {fileTypes: [...], scope: "..."}.
-- Email rows keep an empty object and ignore it.
ALTER TABLE pipeline.connector_accounts
    ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN pipeline.connector_accounts.config IS
  'Per-connector settings answered during the interview. gdrive: fileTypes[] + scope (shared|sharedWithMe|both).';
