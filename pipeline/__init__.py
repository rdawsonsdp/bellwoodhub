"""
pipeline/ — the medallion load (RAW → STAGED → CANONICAL), Voyage embedding, and
the Mode-A backfill runner. Checkpointed + idempotent + replayable; durable
orchestration (Inngest / Vercel Workflows) is deferred to Phase 1 incremental
ingest, where out-of-order live arrival actually needs it.
"""
