-- ════════════════════════════════════════════════════════════════════════
-- Bellwood Hub — access-telemetry indexes (top-risk directive)
-- Target: the pilot Supabase project (bellwood-mayor), after 009_audit_guard.sql
--
-- Telemetry rides in app.audit_log.meta (no new table): web/lib/audit.ts
-- merges requestMeta {ip, ua, device, city, country, region} into meta for
-- every audited action, and middleware posts an 'access.page' row per
-- authenticated page view. The usage pattern is predictable (RD's phone +
-- desktop, later the Mayor's), so the Sentinel's watch is baseline vs.
-- deviation: new IP? new device class? actor active at an odd hour? These
-- expression indexes make those queries cheap on an ever-growing ledger.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- Expression indexes on the telemetry keys inside meta
-- ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS audit_log_meta_ip_idx     ON app.audit_log ((meta->>'ip'));
CREATE INDEX IF NOT EXISTS audit_log_meta_device_idx ON app.audit_log ((meta->>'device'));

-- ────────────────────────────────────────────────────────────────────────
-- Per-actor recency — "what did this identity touch, newest first"
-- ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS audit_log_actor_at_idx    ON app.audit_log (actor, at DESC);
