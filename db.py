"""Shared Postgres connection helper (psycopg3 + pgvector)."""
from __future__ import annotations

from urllib.parse import unquote, urlparse

import psycopg
from pgvector.psycopg import register_vector

import config


def connect() -> psycopg.Connection:
    """Open a connection to the Supabase Postgres, with pgvector registered and
    a search_path that resolves the `poc` tables and the `vector` type/operators
    (pgvector lives in the `extensions` schema on Supabase).

    Parses DATABASE_URL into components and connects via keyword args so special
    characters in the password (e.g. '!') are handled regardless of encoding,
    and forces SSL (required by Supabase)."""
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
    conn.execute("SET search_path TO poc, extensions, public")
    register_vector(conn)
    return conn
