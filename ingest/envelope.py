"""
envelope.py — the single normalized shape every connector produces (step 2), and
the ingest-key that makes the medallion pipeline idempotent.

ingest_key = deterministic hash(source + source_ref). It is the dedup key at Land,
the resume checkpoint key, and the basis for messages.UNIQUE(source, source_ref).
Same record in twice → same key → no duplicate.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
from dataclasses import dataclass, field
from typing import Any

import config

_SEP = "\x00"


def ingest_key(source: str, source_ref: str) -> str:
    """Stable content-addressed id for a unit of source data."""
    return hashlib.sha256(f"{source}{_SEP}{source_ref}".encode("utf-8")).hexdigest()


def checksum(payload: str) -> str:
    """Checksum of a raw payload — distinguishes 'redelivered same' (skip) from
    'changed' (version, don't overwrite)."""
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass
class Envelope:
    """Normalized message. The STAGED representation: who/what/when/where/source."""
    source: str
    source_ref: str
    ingest_key: str
    direction: str                      # inbound | outbound | internal
    sent_at: _dt.datetime
    thread_ref: str                     # upstream thread id
    clean_body: str                     # quotes/sig/disclaimer stripped (re-derivable)
    subject: str | None = None
    from_name: str | None = None
    from_email: str | None = None
    to_email: str | None = None
    cc: str | None = None
    department: str | None = None
    topic: str | None = None
    sensitivity: str = "internal"       # public | internal | restricted (set in classify)
    pii_flags: dict[str, Any] = field(default_factory=dict)
    tenant_id: str = config.DEFAULT_TENANT_ID
    raw_ref: str | None = None          # pointer to the immutable RAW object
    # Fold inputs (issue/event derivation) — carried, not stored on messages directly.
    seq: int | None = None              # ordering within a thread
    openness: str | None = None         # open | resolved | info | None (the issue-state seam)
    provenance: dict[str, Any] = field(default_factory=dict)  # _scenario/_source/etc.

    @staticmethod
    def make(source: str, source_ref: str, **kw: Any) -> "Envelope":
        return Envelope(source=source, source_ref=source_ref,
                        ingest_key=ingest_key(source, source_ref), **kw)
