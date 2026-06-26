"""Shared Postgres connection helper (psycopg3 + pgvector)."""
from __future__ import annotations

from urllib.parse import unquote, urlparse

import psycopg
from pgvector.psycopg import register_vector

import config


def _connect(search_path: str) -> psycopg.Connection:
    """Open a Supabase Postgres connection with pgvector registered and the given
    search_path. Parses DATABASE_URL into components and connects via keyword
    args so special characters in the password (e.g. '!') are handled regardless
    of encoding, and forces SSL (required by Supabase)."""
    url = config.require("DATABASE_URL", config.DATABASE_URL)
    u = urlparse(url)
    conn = psycopg.connect(
        host=u.hostname,
        port=u.port or 5432,
        user=unquote(u.username or "postgres"),
        password=unquote(u.password or ""),
        dbname=(u.path.lstrip("/") or "postgres"),
        sslmode="require",
        autocommit=False,
    )
    conn.execute(f"SET search_path TO {search_path}")
    register_vector(conn)
    return conn


def connect() -> psycopg.Connection:
    """Connection resolving the `poc` tables + the `vector` type (extensions)."""
    return _connect("poc, extensions, public")


def connect_canonical() -> psycopg.Connection:
    """Connection resolving the `canonical` + `pipeline` schemas (AI Chief of
    Staff) and the `vector` type. Used by /ingest and /pipeline; never touches
    `poc` so the strangler-fig cutover keeps the live POC serving."""
    return _connect("canonical, pipeline, extensions, public")
