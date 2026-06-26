"""
medallion.py — the RAW → STAGED → CANONICAL state machine.

  land(conn, connector)       RAW landing (immutable, dedup by ingest_key+checksum)
  stage(conn, connector)      normalize + classify → pipeline.staged_messages
  canonicalize(conn)          resolve + fold + chunk → canonical.* (embedding NULL)
  (embedding is filled separately by voyage_embed.embed_pending — the costly tail)

ingest_log.state IS the checkpoint: every stage advances state only after a
durable write, so a killed run resumes by re-selecting rows not yet advanced.
Per-thread canonicalization is serial (shared identities), so events append in
order; a thread that throws is dead-lettered, never silently dropped.
"""
from __future__ import annotations

import json
from collections import defaultdict

from psycopg.types.json import Jsonb

import config
from ingest.base import RawItem
from ingest.classify import classify
from ingest.envelope import Envelope, checksum, ingest_key
from ingest.resolve import EntityResolver
from ingest import fold
from extract_entities import extract_one
from normalize import normalize_address
from load_embed import chunk

TENANT = config.DEFAULT_TENANT_ID

STAGED_COLS = (
    "ingest_key", "source", "source_ref", "thread_ref", "direction", "sent_at",
    "subject", "from_name", "from_email", "to_email", "cc", "department", "topic",
    "clean_body", "sensitivity", "pii_flags", "seq", "openness", "provenance", "raw_ref",
)


# ─────────────────────────── state helpers ───────────────────────────
def _set_state(conn, ik: str, state: str, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE pipeline.ingest_log SET state=%s, error=%s, updated_at=NOW() WHERE ingest_key=%s",
            (state, error, ik),
        )


def _dead_letter(conn, ik: str, error: str) -> None:
    _set_state(conn, ik, "dead_lettered", error[:1000])


# ─────────────────────────── 1. LAND ───────────────────────────
def land(conn, connector) -> dict:
    counts = {"landed": 0, "skipped": 0, "versioned": 0}
    with conn.cursor() as cur:
        for raw in connector.pull():
            key = ingest_key(raw.source, raw.source_ref)
            chk = checksum(json.dumps(raw.payload, sort_keys=True, default=str))
            cur.execute(
                "SELECT raw_id, checksum, version FROM pipeline.raw_objects "
                "WHERE ingest_key=%s ORDER BY version DESC LIMIT 1",
                (key,),
            )
            row = cur.fetchone()
            if row and row[1] == chk:
                counts["skipped"] += 1
                continue
            version = (row[2] + 1) if row else 1
            if row:
                counts["versioned"] += 1
            cur.execute(
                "INSERT INTO pipeline.raw_objects "
                "(tenant_id, ingest_key, source, source_ref, version, checksum, payload) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING raw_id",
                (TENANT, key, raw.source, raw.source_ref, version, chk, Jsonb(raw.payload)),
            )
            raw_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO pipeline.ingest_log (ingest_key, tenant_id, source, source_ref, state, raw_ref) "
                "VALUES (%s,%s,%s,%s,'landed',%s) "
                "ON CONFLICT (ingest_key) DO UPDATE SET raw_ref=EXCLUDED.raw_ref, state='landed', updated_at=NOW()",
                (key, TENANT, raw.source, raw.source_ref, raw_id),
            )
            counts["landed"] += 1
            if counts["landed"] % 500 == 0:
                conn.commit()
                print(f"    landed {counts['landed']}", end="\r", flush=True)
    conn.commit()
    print(f"    landed {counts['landed']} (skipped {counts['skipped']}, versioned {counts['versioned']})")
    return counts


# ─────────────────────────── 2. STAGE ───────────────────────────
def stage(conn, connector) -> dict:
    counts = {"staged": 0, "dead_lettered": 0}
    with conn.cursor() as cur:
        cur.execute(
            "SELECT l.ingest_key, r.payload, l.source, l.source_ref, l.raw_ref "
            "FROM pipeline.ingest_log l JOIN pipeline.raw_objects r ON r.raw_id = l.raw_ref "
            "WHERE l.state = 'landed'"
        )
        rows = cur.fetchall()
    for ik, payload, source, source_ref, raw_ref in rows:
        try:
            env = classify(connector.normalize(RawItem(source=source, source_ref=source_ref, payload=payload)))
            if not (env.clean_body or "").strip():
                _dead_letter(conn, ik, "empty clean_body after cleaning")
                counts["dead_lettered"] += 1
            else:
                _upsert_staged(conn, ik, env, raw_ref)
                _set_state(conn, ik, "staged")
                counts["staged"] += 1
        except Exception as e:  # noqa: BLE001 — gate, route to review, never drop
            _dead_letter(conn, ik, f"stage: {e}")
            counts["dead_lettered"] += 1
        conn.commit()
    print(f"    staged {counts['staged']} (dead-lettered {counts['dead_lettered']})")
    return counts


def _upsert_staged(conn, ik: str, env: Envelope, raw_ref) -> None:
    vals = (
        ik, env.source, env.source_ref, env.thread_ref, env.direction, env.sent_at,
        env.subject, env.from_name, env.from_email, env.to_email, env.cc, env.department, env.topic,
        env.clean_body, env.sensitivity, Jsonb(env.pii_flags), env.seq, env.openness,
        Jsonb(env.provenance), raw_ref,
    )
    placeholders = ",".join(["%s"] * len(STAGED_COLS))
    setc = ", ".join(f"{c}=EXCLUDED.{c}" for c in STAGED_COLS if c != "ingest_key")
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO pipeline.staged_messages ({', '.join(STAGED_COLS)}) VALUES ({placeholders}) "
            f"ON CONFLICT (ingest_key) DO UPDATE SET {setc}",
            vals,
        )


# ─────────────────────────── 3. CANONICALIZE ───────────────────────────
def canonicalize(conn) -> dict:
    resolver = EntityResolver(conn)
    resolver.seed_personas()
    counts = defaultdict(int)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT " + ", ".join(f"s.{c}" for c in STAGED_COLS) + " "
            "FROM pipeline.staged_messages s JOIN pipeline.ingest_log l USING (ingest_key) "
            "WHERE l.state = 'staged' ORDER BY s.thread_ref, s.seq NULLS LAST, s.sent_at"
        )
        rows = cur.fetchall()
    threads: dict[str, list] = defaultdict(list)
    for r in rows:
        threads[r[3]].append(r)  # index 3 == thread_ref
    for thread_ref, group in threads.items():
        try:
            _canonicalize_thread(conn, resolver, thread_ref, group, counts)
            conn.commit()
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            for r in group:
                _dead_letter(conn, r[0], f"canonicalize: {e}")
            conn.commit()
            counts["dead_lettered"] += len(group)
    print("    canonical: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    return dict(counts)


def _env_from_row(r) -> Envelope:
    (ik, source, source_ref, thread_ref, direction, sent_at, subject, from_name,
     from_email, to_email, cc, department, topic, clean_body, sensitivity, pii_flags,
     seq, openness, provenance, raw_ref) = r
    return Envelope(
        source=source, source_ref=source_ref, ingest_key=ik, direction=direction,
        sent_at=sent_at, thread_ref=thread_ref, clean_body=clean_body, subject=subject,
        from_name=from_name, from_email=from_email, to_email=to_email, cc=cc,
        department=department, topic=topic, sensitivity=sensitivity,
        pii_flags=pii_flags or {}, tenant_id=TENANT,
        raw_ref=str(raw_ref) if raw_ref else None, seq=seq, openness=openness,
        provenance=provenance or {},
    )


def _canonicalize_thread(conn, resolver: EntityResolver, thread_ref, group, counts) -> None:
    envs = [_env_from_row(r) for r in group]
    source = envs[0].source
    sent = [e.sent_at for e in envs if e.sent_at]
    first_seen = min(sent) if sent else None
    last_seen = max(sent) if sent else None
    subject_root = next((e.subject for e in envs if e.subject), None)
    thread_id = _upsert_thread(conn, source, thread_ref, subject_root, first_seen, last_seen)
    counts["threads"] += 1

    msg_ids: list = []
    sender_aliases: list = []
    addr_aliases: set = set()
    for env in envs:
        sa = resolver.resolve_sender(env)
        sender_aliases.append(sa)
        message_id = _upsert_message(conn, thread_id, env, sa)
        msg_ids.append(message_id)
        counts["messages"] += 1
        if env.topic:
            _insert_topic(conn, message_id, env.topic)
        if sa and env.from_name:
            ent = resolver.entity_of_alias(sa)
            if ent:
                resolver.assert_name_alias(ent, env.from_name, message_id)
        if sa:
            _edge(conn, sa, "alias", "authored", message_id, "message", message_id, counts)
        for value, _norm in _addresses_for(env):
            aid = resolver.resolve_address(value, message_id)
            if aid:
                addr_aliases.add(aid)
                _edge(conn, message_id, "message", "about_property", aid, "alias", message_id, counts)
                if sa:
                    _edge(conn, sa, "alias", "concerns_address", aid, "alias", message_id, counts)
        for value, _norm in extract_one(env.subject or "", env.clean_body or "", env.from_name or "").get("business", []):
            bid = resolver.resolve_business(value, message_id)
            if bid:
                _edge(conn, message_id, "message", "mentions", bid, "alias", message_id, counts)
        counts["chunks"] += _insert_chunks(conn, message_id, env.clean_body)
        _set_state(conn, env.ingest_key, "canonical")

    deriv = fold.derive_thread(envs)
    if not deriv:
        return
    issue_id = _upsert_issue(conn, thread_id, deriv, source)
    counts["issues"] += 1
    _edge(conn, issue_id, "issue", "discussed_in", thread_id, "thread", None, counts)
    for aid in addr_aliases:
        _edge(conn, issue_id, "issue", "about_property", aid, "alias", None, counts)
    for ev in deriv.events:
        mid = msg_ids[ev.msg_index] if 0 <= ev.msg_index < len(msg_ids) else None
        if _insert_event(conn, issue_id, mid, ev.event_type, ev.occurred_at):
            counts["events"] += 1
    for i, env in enumerate(envs):
        for ctext in fold.derive_commitments(env):
            owner = resolver.entity_of_alias(sender_aliases[i]) if sender_aliases[i] else None
            cid = _insert_commitment(conn, ctext, owner, issue_id, msg_ids[i])
            counts["commitments"] += 1
            _edge(conn, issue_id, "issue", "has_commitment", cid, "commitment", msg_ids[i], counts)
    _refresh_issue_status(conn, issue_id)


# ─────────────────────────── canonical writers ───────────────────────────
def _upsert_thread(conn, source, thread_ref, subject, first_seen, last_seen) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO canonical.threads (tenant_id, source, source_thread_ref, subject, first_seen, last_seen) "
            "VALUES (%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (tenant_id, source, source_thread_ref) DO UPDATE "
            "SET last_seen=GREATEST(canonical.threads.last_seen, EXCLUDED.last_seen), "
            "    subject=COALESCE(canonical.threads.subject, EXCLUDED.subject) "
            "RETURNING thread_id",
            (TENANT, source, thread_ref, subject, first_seen, last_seen),
        )
        return cur.fetchone()[0]


def _upsert_message(conn, thread_id, env: Envelope, sender_alias) -> str:
    cols = ("tenant_id", "thread_id", "source", "source_ref", "ingest_key", "sender_alias_id",
            "sent_at", "direction", "subject", "from_name", "from_email", "to_email", "cc",
            "department", "clean_body", "raw_ref", "pii_flags", "sensitivity", "is_synthetic", "provenance")
    vals = (TENANT, thread_id, env.source, env.source_ref, env.ingest_key, sender_alias,
            env.sent_at, env.direction, env.subject, env.from_name, env.from_email, env.to_email, env.cc,
            env.department, env.clean_body, env.raw_ref, Jsonb(env.pii_flags), env.sensitivity,
            bool(env.provenance.get("is_synthetic", True)), Jsonb(env.provenance))
    setc = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols if c not in ("source", "source_ref"))
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO canonical.messages ({', '.join(cols)}) VALUES ({','.join(['%s'] * len(cols))}) "
            f"ON CONFLICT (source, source_ref) DO UPDATE SET {setc} RETURNING message_id",
            vals,
        )
        return cur.fetchone()[0]


def _insert_topic(conn, message_id, topic) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO canonical.message_topics (message_id, topic, confidence, classifier_version) "
            "VALUES (%s,%s,1.0,'seed') ON CONFLICT (message_id, topic) DO NOTHING",
            (message_id, topic),
        )


def _edge(conn, src_id, src_type, relation, dst_id, dst_type, evidence, counts) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO canonical.edges (tenant_id, src_id, src_type, relation, dst_id, dst_type, evidence_message_id) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (tenant_id, src_id, relation, dst_id) DO NOTHING",
            (TENANT, src_id, src_type, relation, dst_id, dst_type, evidence),
        )
        counts["edges"] += cur.rowcount


def _insert_chunks(conn, message_id, clean_body) -> int:
    n = 0
    with conn.cursor() as cur:
        for idx, (ctext, ntok) in enumerate(chunk(clean_body or "")):
            cur.execute(
                "INSERT INTO canonical.chunks (tenant_id, message_id, chunk_index, chunk_text, token_count) "
                "VALUES (%s,%s,%s,%s,%s) "
                "ON CONFLICT (message_id, chunk_index) DO UPDATE SET "
                "  chunk_text=EXCLUDED.chunk_text, token_count=EXCLUDED.token_count, "
                "  embedding = CASE WHEN canonical.chunks.chunk_text IS DISTINCT FROM EXCLUDED.chunk_text "
                "                   THEN NULL ELSE canonical.chunks.embedding END",
                (TENANT, message_id, idx, ctext, ntok),
            )
            n += 1
    return n


def _upsert_issue(conn, thread_id, deriv, source) -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT issue_id FROM canonical.threads WHERE thread_id=%s", (thread_id,))
        existing = cur.fetchone()[0]
        if existing:
            cur.execute(
                "UPDATE canonical.issues SET title=%s, issue_type=%s, opened_at=%s, updated_at=NOW() WHERE issue_id=%s",
                (deriv.title, deriv.issue_type, deriv.opened_at, existing),
            )
            return existing
        cur.execute(
            "INSERT INTO canonical.issues (tenant_id, issue_type, title, opened_at) "
            "VALUES (%s,%s,%s,%s) RETURNING issue_id",
            (TENANT, deriv.issue_type, deriv.title, deriv.opened_at),
        )
        issue_id = cur.fetchone()[0]
        cur.execute("UPDATE canonical.threads SET issue_id=%s WHERE thread_id=%s", (issue_id, thread_id))
        return issue_id


def _insert_event(conn, issue_id, message_id, event_type, occurred_at) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO canonical.events (tenant_id, issue_id, message_id, event_type, occurred_at) "
            "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (issue_id, event_type, occurred_at, message_id) DO NOTHING",
            (TENANT, issue_id, message_id, event_type, occurred_at),
        )
        return cur.rowcount > 0


def _insert_commitment(conn, text, owner_entity_id, issue_id, source_message_id) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO canonical.commitments (tenant_id, commitment_text, owner_entity_id, issue_id, source_message_id) "
            "VALUES (%s,%s,%s,%s,%s) RETURNING commitment_id",
            (TENANT, text, owner_entity_id, issue_id, source_message_id),
        )
        return cur.fetchone()[0]


def _refresh_issue_status(conn, issue_id) -> None:
    """Refresh the derived_status CACHE from the fold view (truth = the view)."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE canonical.issues i SET derived_status=s.state, updated_at=NOW() "
            "FROM canonical.issue_state s WHERE s.issue_id=i.issue_id AND i.issue_id=%s",
            (issue_id,),
        )


def _addresses_for(env: Envelope):
    """Addresses from the message's own text + the _address_hint provenance."""
    out = list(extract_one(env.subject or "", env.clean_body or "", env.from_name or "").get("address", []))
    hint = (env.provenance or {}).get("_address_hint")
    if hint:
        out.append((hint, normalize_address(hint)))
    seen, res = set(), []
    for v, n in out:
        if n and n not in seen:
            seen.add(n)
            res.append((v, n))
    return res
