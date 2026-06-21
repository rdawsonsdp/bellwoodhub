#!/usr/bin/env python3
"""
load_embed.py — load the seed corpus, clean it, chunk it, embed it.

Pipeline (idempotent / resumable, tuned for the 10k corpus):
  1. (--fresh) optionally TRUNCATE poc.emails CASCADE so the DB matches the seed.
  2. Upsert poc.emails in batched multi-row INSERTs (body_clean re-derived from
     body_raw by the cleaner — a real cleaning step).
  3. Chunk body_clean into ~300-500 token windows (overlap ~50) with tiktoken.
  4. Print a running count + an embedding-call/cost ESTIMATE, then PAUSE for
     confirmation before spending anything.
  5. Embed missing chunks with text-embedding-3-small (batched) and insert into
     poc.email_chunks in batched multi-row INSERTs.

Flags: --yes (skip the pause; required when stdin isn't a TTY), --fresh
(truncate first), --reembed (re-embed everything), --limit N (subset).
"""
from __future__ import annotations

import argparse
import json
import math
import sys

import tiktoken
from openai import OpenAI

import config
import db
from clean_text import clean

_enc = tiktoken.get_encoding(config.EMBED_ENCODING)

EMAIL_COLS = ("message_id", "thread_id", "direction", "from_name", "from_email",
              "to_email", "cc", "subject", "date_sent", "body_raw", "body_clean",
              "topic", "is_synthetic")
INS_BATCH = 200       # emails per multi-row INSERT
CHUNK_INS_BATCH = 128  # chunks per multi-row INSERT (also the embed batch)


def chunk(text: str) -> list[tuple[str, int]]:
    toks = _enc.encode(text)
    if len(toks) <= config.CHUNK_MAX_TOKENS:
        return [(text, len(toks))] if text.strip() else []
    out: list[tuple[str, int]] = []
    step = config.CHUNK_MAX_TOKENS - config.CHUNK_OVERLAP_TOKENS
    start = 0
    while start < len(toks):
        window = toks[start:start + config.CHUNK_MAX_TOKENS]
        out.append((_enc.decode(window), len(window)))
        if start + config.CHUNK_MAX_TOKENS >= len(toks):
            break
        start += step
    if len(out) >= 2 and out[-1][1] < config.CHUNK_MIN_TOKENS:
        merged = out[-2][0] + "\n" + out[-1][0]
        out[-2] = (merged, len(_enc.encode(merged)))
        out.pop()
    return out


def upsert_emails(conn, emails) -> dict[str, str]:
    """Batched upsert; returns message_id -> id. Caches cleaned body on each dict."""
    id_by_msg: dict[str, str] = {}
    placeholder = "(" + ",".join(["%s"] * len(EMAIL_COLS)) + ")"
    set_clause = ", ".join(f"{c}=EXCLUDED.{c}" for c in EMAIL_COLS if c != "message_id")
    with conn.cursor() as cur:
        for i in range(0, len(emails), INS_BATCH):
            batch = emails[i:i + INS_BATCH]
            params = []
            for e in batch:
                e["_clean"] = clean(e["body_raw"])
                params.extend([
                    e["message_id"], e["thread_id"], e["direction"], e["from_name"],
                    e["from_email"], e["to_email"], e.get("cc") or None, e["subject"],
                    e["date_sent"], e["body_raw"], e["_clean"], e["topic"],
                    bool(e.get("is_synthetic", True)),
                ])
            sql = (
                f"INSERT INTO poc.emails ({', '.join(EMAIL_COLS)}) VALUES "
                + ", ".join([placeholder] * len(batch))
                + f" ON CONFLICT (message_id) DO UPDATE SET {set_clause} "
                + "RETURNING id, message_id"
            )
            cur.execute(sql, params)
            for _id, mid in cur.fetchall():
                id_by_msg[mid] = _id
            print(f"    upserted {min(i + INS_BATCH, len(emails))}/{len(emails)} emails", end="\r", flush=True)
    conn.commit()
    print()
    return id_by_msg


def plan_chunks(conn, emails, id_by_msg, reembed, fresh):
    existing = set()
    if not (reembed or fresh):
        with conn.cursor() as cur:
            cur.execute("SELECT email_id, chunk_index FROM poc.email_chunks WHERE embedding IS NOT NULL")
            existing = {(str(a), b) for a, b in cur.fetchall()}
    to_embed, total_chunks, total_tokens = [], 0, 0
    for e in emails:
        eid = id_by_msg[e["message_id"]]
        chunks = chunk(e.get("_clean") or clean(e["body_raw"]))
        total_chunks += len(chunks)
        for idx, (ctext, ntok) in enumerate(chunks):
            if (str(eid), idx) in existing:
                continue
            to_embed.append((eid, idx, ctext, ntok))
            total_tokens += ntok
    return to_embed, total_chunks, total_tokens


def embed_and_store(conn, client, to_embed):
    done = 0
    with conn.cursor() as cur:
        for i in range(0, len(to_embed), CHUNK_INS_BATCH):
            batch = to_embed[i:i + CHUNK_INS_BATCH]
            resp = client.embeddings.create(model=config.EMBED_MODEL, input=[c[2] for c in batch])
            params = []
            for (eid, idx, ctext, ntok), item in zip(batch, resp.data):
                params.extend([eid, idx, ctext, ntok, item.embedding])
            sql = (
                "INSERT INTO poc.email_chunks (email_id, chunk_index, chunk_text, token_count, embedding) VALUES "
                + ", ".join(["(%s,%s,%s,%s,%s)"] * len(batch))
                + " ON CONFLICT (email_id, chunk_index) DO UPDATE SET "
                "chunk_text=EXCLUDED.chunk_text, token_count=EXCLUDED.token_count, embedding=EXCLUDED.embedding"
            )
            cur.execute(sql, params)
            conn.commit()
            done += len(batch)
            print(f"    embedded {done}/{len(to_embed)} chunks", end="\r", flush=True)
    print()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--fresh", action="store_true", help="TRUNCATE poc.emails CASCADE first")
    ap.add_argument("--reembed", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    config.require("OPENAI_API_KEY", config.OPENAI_API_KEY)
    config.require("DATABASE_URL", config.DATABASE_URL)
    if not config.SEED_FILE.exists():
        raise SystemExit(f"Seed file missing: {config.SEED_FILE}. Run generate_corpus.py.")

    emails = json.loads(config.SEED_FILE.read_text())
    if args.limit:
        emails = emails[:args.limit]

    conn = db.connect()
    try:
        if args.fresh:
            print("Truncating poc.emails CASCADE ...")
            with conn.cursor() as cur:
                cur.execute("TRUNCATE poc.emails CASCADE")
            conn.commit()

        print(f"Loading {len(emails)} emails into poc.emails ...")
        id_by_msg = upsert_emails(conn, emails)
        print(f"  upserted {len(id_by_msg)} emails.")

        print("Planning chunks ...")
        to_embed, total_chunks, embed_tokens = plan_chunks(conn, emails, id_by_msg, args.reembed, args.fresh)
        calls = math.ceil(len(to_embed) / CHUNK_INS_BATCH) if to_embed else 0
        cost = embed_tokens / 1_000_000 * config.EMBED_PRICE_PER_1M_TOKENS

        print("\n" + "─" * 60)
        print("  EMBEDDING ESTIMATE")
        print(f"    model            : {config.EMBED_MODEL} ({config.EMBED_DIMS} dims)")
        print(f"    total chunks     : {total_chunks}")
        print(f"    chunks to embed  : {len(to_embed)}  (rest already embedded)")
        print(f"    tokens to embed  : {embed_tokens:,}")
        print(f"    API calls        : {calls}  (batch {CHUNK_INS_BATCH})")
        print(f"    est. cost        : ${cost:.4f}")
        print("─" * 60)

        if not to_embed:
            print("Nothing to embed — corpus already up to date.")
            return
        if not args.yes:
            if not sys.stdin.isatty():
                raise SystemExit("Pre-embedding pause: re-run with --yes to proceed.")
            if input(f"Proceed and embed {len(to_embed)} chunks? [y/N] ").strip().lower() not in ("y", "yes"):
                raise SystemExit("Aborted before embedding. Nothing spent.")

        client = OpenAI(api_key=config.OPENAI_API_KEY)
        print("Embedding ...")
        embed_and_store(conn, client, to_embed)

        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM poc.emails")
            ne = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM poc.email_chunks WHERE embedding IS NOT NULL")
            nc = cur.fetchone()[0]
        print(f"\nDone. poc.emails={ne}, embedded chunks={nc}.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
