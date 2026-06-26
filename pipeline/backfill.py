#!/usr/bin/env python3
"""
backfill.py — Mode-A backfill of the synthetic corpus into the canonical store.

  python -m pipeline.backfill --yes               # land → stage → canonicalize → embed
  python -m pipeline.backfill --limit 500 --yes   # a subset (fast smoke)
  python -m pipeline.backfill --no-embed          # build canonical, skip the costly embed tail
  python -m pipeline.backfill --rebuild-from-raw --yes   # rebuild canonical from immutable RAW (no re-pull)
  python -m pipeline.backfill --fresh --yes       # wipe RAW+canonical and re-land from the seed

Checkpointed via pipeline.ingest_log.state — a killed run resumes; re-running is
idempotent. "Full rebuild from RAW" is a routine, tested op (--rebuild-from-raw).
"""
from __future__ import annotations

import argparse

import config
import db
from ingest.synthetic_email import SyntheticEmailConnector
from pipeline import medallion, voyage_embed

CANON_TABLES = (
    "canonical.entities, canonical.entity_aliases, canonical.issues, canonical.threads, "
    "canonical.messages, canonical.message_topics, canonical.edges, canonical.commitments, "
    "canonical.events, canonical.chunks"
)


def _truncate_canonical(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(f"TRUNCATE {CANON_TABLES} CASCADE")
        cur.execute("TRUNCATE pipeline.staged_messages, pipeline.review_queue CASCADE")
    conn.commit()


def _reset_log_to_landed(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE pipeline.ingest_log SET state='landed', error=NULL, updated_at=NOW()")
    conn.commit()


def _summary(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT state, count(*) FROM pipeline.ingest_log GROUP BY state ORDER BY 2 DESC")
        states = cur.fetchall()
        cur.execute(
            "SELECT (SELECT count(*) FROM canonical.messages), (SELECT count(*) FROM canonical.threads), "
            "(SELECT count(*) FROM canonical.issues), (SELECT count(*) FROM canonical.entities), "
            "(SELECT count(*) FROM canonical.edges), (SELECT count(*) FROM canonical.commitments), "
            "(SELECT count(*) FROM canonical.chunks WHERE embedding IS NOT NULL), "
            "(SELECT count(*) FROM pipeline.review_queue WHERE status='pending')"
        )
        m, t, i, e, ed, c, ce, rq = cur.fetchone()
    print("\n" + "═" * 60)
    print("  CANONICAL STORE")
    print(f"    messages {m} · threads {t} · issues {i} · entities {e}")
    print(f"    edges {ed} · commitments {c} · embedded chunks {ce}")
    print(f"    review queue (pending) {rq}")
    print("    ingest_log: " + ", ".join(f"{s}={n}" for s, n in states))
    print("═" * 60)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="skip the pre-embedding spend pause")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--fresh", action="store_true", help="wipe RAW + canonical and re-land")
    ap.add_argument("--rebuild-from-raw", action="store_true", help="rebuild canonical from RAW, no re-pull")
    ap.add_argument("--no-embed", action="store_true", help="build canonical but skip the Voyage embed tail")
    args = ap.parse_args()

    config.require("DATABASE_URL", config.DATABASE_URL)
    if not config.SEED_FILE.exists():
        raise SystemExit(f"Seed file missing: {config.SEED_FILE}. Run generate_corpus.py first.")

    conn = db.connect_canonical()
    try:
        connector = SyntheticEmailConnector(limit=args.limit)

        if args.fresh:
            print("FRESH: truncating RAW + canonical, re-landing from seed …")
            with conn.cursor() as cur:
                cur.execute(f"TRUNCATE {CANON_TABLES} CASCADE")
                cur.execute("TRUNCATE pipeline.raw_objects, pipeline.staged_messages, "
                            "pipeline.ingest_log, pipeline.review_queue CASCADE")
            conn.commit()
            print("LAND …"); medallion.land(conn, connector)
        elif args.rebuild_from_raw:
            print("REBUILD FROM RAW: truncating canonical, re-staging from immutable RAW …")
            _truncate_canonical(conn)
            _reset_log_to_landed(conn)
        else:
            print("LAND …"); medallion.land(conn, connector)

        print("STAGE …"); medallion.stage(conn, connector)
        print("CANONICALIZE …"); medallion.canonicalize(conn)
        if args.no_embed:
            print("(skipping embed — run again without --no-embed to fill canonical.chunks.embedding)")
        else:
            print("EMBED (Voyage) …"); voyage_embed.embed_pending(conn, yes=args.yes)
        _summary(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
