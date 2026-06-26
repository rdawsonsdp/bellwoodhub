"""
base.py — the Connector contract. A connector owns only the source-specific
steps (pull + normalize). Resolution, classification, folding, chunking and the
canonical write are shared services the pipeline applies uniformly, so adding a
source is mostly configuration (R1 decoupling).

Connector health is a product surface (design §5): report_health() exposes
last-synced + coverage so the front end can show per-source freshness.
"""
from __future__ import annotations

import datetime as _dt
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterator

from .envelope import Envelope


@dataclass
class RawItem:
    """A unit of untouched source data, ready to Land in RAW."""
    source: str
    source_ref: str
    payload: dict        # the original record, stored verbatim and immutable
    received_at: _dt.datetime | None = None


@dataclass
class SourceHealth:
    source: str
    last_synced_at: _dt.datetime | None
    units_seen: int
    units_canonical: int
    units_dead_lettered: int


class Connector(ABC):
    """One connector per source stream. Implements steps 1–2; the pipeline runs
    3–5 via the shared services so capability code never changes when a source
    is added."""

    #: stable source label, also messages.source and the RAW partition.
    source: str = "abstract"

    @abstractmethod
    def pull(self) -> Iterator[RawItem]:
        """Step 1 — acquire raw units (API/IMAP/CSV/file-drop/scrape). Yields the
        untouched payloads to Land. Must be safe to re-run (idempotency is
        enforced downstream by ingest_key, but a connector should not duplicate
        within a single pull)."""

    @abstractmethod
    def normalize(self, raw: RawItem) -> Envelope:
        """Step 2 — map one raw unit to the canonical Envelope. The only place
        source-specific field knowledge lives."""

    def report_health(self, conn) -> SourceHealth:
        """Connector health for the product surface. Reads pipeline.ingest_log."""
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT max(landed_at),
                       count(*),
                       count(*) FILTER (WHERE state = 'canonical'),
                       count(*) FILTER (WHERE state = 'dead_lettered')
                FROM pipeline.ingest_log WHERE source = %s
                """,
                (self.source,),
            )
            last, seen, canon, dead = cur.fetchone()
        return SourceHealth(self.source, last, seen or 0, canon or 0, dead or 0)
