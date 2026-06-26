"""
voyage_embed.py — Voyage embeddings for the canonical store (voyage-4-large @
1024). Documents use input_type="document", queries "query" (the asymmetry the
old symmetric OpenAI path missed). Embedding is the one expensive step, so it is
batched, cost-gated (estimate + pause-before-spend, like load_embed.py), and
RESUMABLE — it only fills chunks whose embedding IS NULL, committing per batch.
"""
from __future__ import annotations

import sys

import config

VOYAGE_BATCH = 128


def voyage_client():
    import voyageai
    config.require("VOYAGE_API_KEY", config.VOYAGE_API_KEY)
    return voyageai.Client(api_key=config.VOYAGE_API_KEY)


def _embed(client, texts: list[str], input_type: str) -> list[list[float]]:
    resp = client.embed(
        texts,
        model=config.CANONICAL_EMBED_MODEL,
        input_type=input_type,
        output_dimension=config.CANONICAL_EMBED_DIM,
    )
    return resp.embeddings


def embed_documents(client, texts: list[str]) -> list[list[float]]:
    return _embed(client, texts, config.VOYAGE_INPUT_DOCUMENT)


def embed_query(client, text: str) -> list[float]:
    return _embed(client, [text], config.VOYAGE_INPUT_QUERY)[0]


def count_pending(conn) -> tuple[int, int]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*), COALESCE(sum(token_count),0) "
            "FROM canonical.chunks WHERE embedding IS NULL"
        )
        n, tokens = cur.fetchone()
    return n, int(tokens or 0)


def embed_pending(conn, yes: bool = False) -> int:
    """Cost-gated, resumable embed of every NULL-embedding chunk."""
    n, tokens = count_pending(conn)
    cost = tokens / 1_000_000 * config.VOYAGE_PRICE_PER_1M_TOKENS
    print("\n" + "─" * 60)
    print("  EMBEDDING ESTIMATE (Voyage)")
    print(f"    model           : {config.CANONICAL_EMBED_MODEL} ({config.CANONICAL_EMBED_DIM} dims)")
    print(f"    chunks to embed : {n}")
    print(f"    tokens to embed : {tokens:,}")
    print(f"    est. cost       : ${cost:.4f}")
    print("─" * 60)
    if n == 0:
        print("Nothing to embed — canonical chunks already up to date.")
        return 0
    if not yes:
        if not sys.stdin.isatty():
            raise SystemExit("Pre-embedding pause: re-run with --yes to proceed.")
        if input(f"Proceed and embed {n} chunks? [y/N] ").strip().lower() not in ("y", "yes"):
            raise SystemExit("Aborted before embedding. Nothing spent.")

    client = voyage_client()
    done = 0
    while True:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT chunk_id, chunk_text FROM canonical.chunks "
                "WHERE embedding IS NULL ORDER BY chunk_id LIMIT %s",
                (VOYAGE_BATCH,),
            )
            batch = cur.fetchall()
        if not batch:
            break
        vecs = embed_documents(client, [b[1] for b in batch])
        with conn.cursor() as cur:
            for (chunk_id, _txt), vec in zip(batch, vecs):
                cur.execute(
                    "UPDATE canonical.chunks SET embedding=%s WHERE chunk_id=%s",
                    (vec, chunk_id),
                )
        conn.commit()
        done += len(batch)
        print(f"    embedded {done}/{n} chunks", end="\r", flush=True)
    print()
    return done
