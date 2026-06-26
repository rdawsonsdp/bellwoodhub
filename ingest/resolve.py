"""
resolve.py — step 3, the assertion-ledger entity resolver (R2 / AD-6).

Contract (never violated):
  * Email address = identity. Deterministic, confidence 1.0, reversible.
  * A name/address/business variant is asserted as a REVERSIBLE alias. If a
    DIFFERENT identity already actively owns that normalized alias, it is NOT
    merged — it goes to pipeline.review_queue with both candidates. No silent
    hard-merges.
  * Edges (built by the medallion writer) reference alias_id, never entity_id,
    so a false assertion is undone by stamping retracted_at — the graph is
    never corrupted.
  * unmerge() (the reversal) is implemented BEFORE any probabilistic merge path.

Single-process during backfill: resolution is SELECT-then-INSERT and shares
identities (addresses, personas) across threads, so the canonicalizer runs it
serially. Embedding — the parallel/batch part — happens separately.
"""
from __future__ import annotations

from typing import Optional

import config
from corpus import personas
from normalize import (normalize_address, normalize_business, normalize_person,
                       normalize_phone)

from .envelope import Envelope

_STAFF_DOMAIN = config.STAFF_DOMAIN
_RESIDENT_ROLES = {"resident", "business"}
_EMAIL_TO_PERSONA = {p["email"].lower(): p for p in personas.PERSONAS.values()}


def _entity_type_for(from_email: str, persona: Optional[dict]) -> str:
    if persona is not None:
        return "person" if persona.get("role") in _RESIDENT_ROLES else "official"
    return "person"


class EntityResolver:
    def __init__(self, conn, tenant_id: str = config.DEFAULT_TENANT_ID):
        self.conn = conn
        self.tenant_id = tenant_id

    # ── ledger primitives ────────────────────────────────────────────────
    def _active_alias(self, alias_type: str, norm: str):
        with self.conn.cursor() as cur:
            cur.execute(
                """SELECT alias_id, entity_id FROM canonical.entity_aliases
                   WHERE tenant_id=%s AND alias_type=%s AND alias_norm=%s
                     AND retracted_at IS NULL LIMIT 1""",
                (self.tenant_id, alias_type, norm),
            )
            return cur.fetchone()

    def _new_entity(self, entity_type: str, name: str, confidence: float = 1.0) -> str:
        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO canonical.entities (tenant_id, entity_type, canonical_name, confidence)
                   VALUES (%s,%s,%s,%s) RETURNING entity_id""",
                (self.tenant_id, entity_type, name[:300], confidence),
            )
            return cur.fetchone()[0]

    def _insert_alias(self, entity_id: str, alias_type: str, value: str, norm: str,
                      source: str, evidence: Optional[str], confidence: float) -> Optional[str]:
        """Insert an alias if no active one already holds this (type, norm).
        Returns the alias_id, or None if it lost the race to an existing one."""
        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO canonical.entity_aliases
                     (tenant_id, entity_id, alias_type, alias_value, alias_norm,
                      source, source_message_id, confidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (tenant_id, alias_type, alias_norm)
                     WHERE retracted_at IS NULL DO NOTHING
                   RETURNING alias_id""",
                (self.tenant_id, entity_id, alias_type, value[:300], norm[:300],
                 source, evidence, confidence),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def _review(self, kind: str, norm: str, incoming_entity: str, existing_entity: str,
                value: str, evidence: Optional[str], confidence: float) -> None:
        """Park an ambiguous assertion for human review — never auto-merge."""
        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO pipeline.review_queue
                     (tenant_id, kind, alias_norm, alias_value, incoming_entity_id,
                      existing_entity_id, evidence_message_id, confidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT DO NOTHING""",
                (self.tenant_id, kind, norm[:300], value[:300], incoming_entity,
                 existing_entity, evidence, confidence),
            )

    # ── the reversal path (built before any merge) ───────────────────────
    def unmerge(self, alias_id: str) -> None:
        """Retract an alias assertion. The alias row is preserved (audit); only
        retracted_at is stamped, so the graph edges that referenced it become
        inert and the identity it implied is instantly undone."""
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE canonical.entity_aliases SET retracted_at=NOW() "
                "WHERE alias_id=%s AND retracted_at IS NULL",
                (alias_id,),
            )

    # ── resolution entry points ──────────────────────────────────────────
    def resolve_sender(self, env: Envelope) -> Optional[str]:
        """Email-as-identity. Returns the sender's email alias_id (the graph
        anchor). Idempotent: same address → same entity, no merge."""
        email = (env.from_email or "").strip().lower()
        if not email:
            return None
        hit = self._active_alias("email", email)
        if hit:
            entity_id = hit[1]
        else:
            persona = _EMAIL_TO_PERSONA.get(email)
            entity_id = self._new_entity(
                _entity_type_for(email, persona),
                (persona or {}).get("name") or env.from_name or email,
            )
        alias_id = (self._active_alias("email", email) or (None, None))[0]
        if alias_id is None:
            alias_id = self._insert_alias(entity_id, "email", env.from_email or email,
                                          email, "email_header", None, 1.0)
            if alias_id is None:  # lost a race — re-read
                alias_id = (self._active_alias("email", email) or (None, None))[0]
        # Note: the sender's display-name alias and address/business edges are
        # asserted by the canonicalizer AFTER the message row exists, so their
        # evidence_message_id points at a real canonical message.
        return alias_id

    def assert_name_alias(self, entity_id: str, name: str, evidence: Optional[str],
                          confidence: float = 0.9) -> Optional[str]:
        norm = normalize_person(name)
        if not norm:
            return None
        existing = self._active_alias("name_variant", norm)
        if existing:
            if existing[1] == entity_id:
                return existing[0]            # already ours — no-op
            # Same name, different identity → ambiguous. Park it; DO NOT merge.
            self._review("name_collision", norm, entity_id, existing[1], name,
                         evidence, confidence)
            return None
        return self._insert_alias(entity_id, "name_variant", name, norm,
                                  "own_text", evidence, confidence)

    def resolve_address(self, value: str, evidence: Optional[str]) -> Optional[str]:
        """A parcel/address is its own identity (shared across residents)."""
        norm = normalize_address(value)
        if not norm:
            return None
        hit = self._active_alias("address", norm)
        if hit:
            return hit[0]
        entity_id = self._new_entity("parcel", value)
        return self._insert_alias(entity_id, "address", value, norm,
                                  "own_text", evidence, 1.0)

    def resolve_business(self, value: str, evidence: Optional[str]) -> Optional[str]:
        norm = normalize_business(value)
        if not norm:
            return None
        hit = self._active_alias("business_name", norm)
        if hit:
            return hit[0]
        entity_id = self._new_entity("organization", value)
        return self._insert_alias(entity_id, "business_name", value, norm,
                                  "own_text", evidence, 0.95)

    def entity_of_alias(self, alias_id: str) -> Optional[str]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT entity_id FROM canonical.entity_aliases WHERE alias_id=%s",
                        (alias_id,))
            row = cur.fetchone()
            return row[0] if row else None

    # ── deterministic seed from the authoritative persona registry ───────
    def seed_personas(self) -> int:
        """Pre-load known name↔email identities (authoritative by construction).
        Makes staff/hero identities high-confidence before any extraction."""
        n = 0
        for p in personas.PERSONAS.values():
            email = (p.get("email") or "").strip().lower()
            if not email:
                continue
            hit = self._active_alias("email", email)
            if hit:
                entity_id = hit[1]
            else:
                entity_id = self._new_entity(
                    _entity_type_for(email, p), p.get("name") or email)
                self._insert_alias(entity_id, "email", p["email"], email,
                                   "persona_registry", None, 1.0)
                n += 1
            if p.get("name"):
                self.assert_name_alias(entity_id, p["name"], None, confidence=1.0)
        self.conn.commit()
        return n
