-- ════════════════════════════════════════════════════════════════════════
-- App state (migration 0003). Schema `app` — operational UI state that is NOT
-- knowledge (so it stays out of canonical.*). Phase 0: the drafts/approvals
-- queue behind the Approvals screen + the draft_reply tool.
--
-- R3: a draft is NEVER auto-sent. 'approved' records the human decision; actual
-- sending stays a deliberate, out-of-band step (no send connector in Phase 0).
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.drafts (
    draft_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    agent         TEXT NOT NULL DEFAULT 'drafting',   -- drafting | board_prep | grant_radar
    kind          TEXT NOT NULL DEFAULT 'reply',
    to_message_id TEXT,                                -- source_ref of the message being answered
    recipients    TEXT,
    subject       TEXT,
    body          TEXT NOT NULL,
    rationale     TEXT,
    status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','discarded')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON app.drafts (tenant_id, status, created_at DESC);
