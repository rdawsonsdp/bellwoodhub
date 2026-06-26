"""
synthetic_email.py — the one Phase-0 connector. Reads corpus/seed_emails.json
(the JSON, not poc.emails — only the JSON carries _openness/_seq/_scenario, the
issue-state seam) and normalizes each record to an Envelope.

It assigns messages.source to the MUNICIPAL STREAM (resident/interdept/police/
fire/business/civic), modelling the fact that — in the real system — police and
fire daily reports arrive from distinct RMS/CAD connectors, not the email box.
This is what lets the cross-source proof (demo Q7) span every stream.

Reuses clean_text.clean() verbatim (R1-safe pure function).
"""
from __future__ import annotations

import datetime as _dt
import json
from typing import Iterator

import config
from clean_text import clean
from corpus import personas

from .base import Connector, RawItem
from .envelope import Envelope

# Sender email → persona (staff identification + department).
_EMAIL_TO_PERSONA = {p["email"].lower(): (key, p)
                     for key, p in personas.PERSONAS.items()}

STREAMS = ("resident", "interdept", "police", "fire", "business", "civic")


def derive_stream(rec: dict) -> str:
    """Map a seed record to one municipal source stream."""
    topic = rec.get("topic")
    src = str(rec.get("_source") or "")
    frm = (rec.get("from_email") or "").lower()
    if topic == "public_safety" or src.startswith("police"):
        return "police"
    if topic == "fire_ems" or src.startswith("fire"):
        return "fire"
    if topic == "business":
        return "business"
    if topic == "foia" or "civic" in src or "regional" in src:
        return "civic"
    staff = frm.endswith(config.STAFF_DOMAIN)
    if staff:
        return "interdept"
    return "resident"


def _department(from_email: str | None) -> str | None:
    hit = _EMAIL_TO_PERSONA.get((from_email or "").lower())
    if not hit:
        return None
    key, p = hit
    return key if p.get("role") not in ("resident", "business") else None


class SyntheticEmailConnector(Connector):
    source = "synthetic_email"
    owns_sources = STREAMS  # report_health spans every stream it lands

    def __init__(self, seed_file=None, limit: int = 0):
        self.seed_file = seed_file or config.SEED_FILE
        self.limit = limit

    # ── step 1 ──
    def pull(self) -> Iterator[RawItem]:
        records = json.loads(self.seed_file.read_text())
        if self.limit:
            records = records[: self.limit]
        for rec in records:
            yield RawItem(
                source=derive_stream(rec),
                source_ref=rec["message_id"],
                payload=rec,
            )

    # ── step 2 ──
    def normalize(self, raw: RawItem) -> Envelope:
        rec = raw.payload
        sent_at = _dt.datetime.fromisoformat(rec["date_sent"]) if rec.get("date_sent") else None
        return Envelope.make(
            source=raw.source,
            source_ref=raw.source_ref,
            direction=rec.get("direction") or "inbound",
            sent_at=sent_at,
            thread_ref=rec.get("thread_id") or raw.source_ref,
            subject=rec.get("subject"),
            from_name=rec.get("from_name"),
            from_email=rec.get("from_email"),
            to_email=rec.get("to_email"),
            cc=rec.get("cc"),
            department=_department(rec.get("from_email")),
            topic=rec.get("topic"),
            clean_body=clean(rec.get("body_raw") or ""),
            seq=rec.get("_seq"),
            openness=rec.get("_openness"),
            provenance={
                "_scenario": rec.get("_scenario"),
                "_source": rec.get("_source"),
                "_seq": rec.get("_seq"),
                "_openness": rec.get("_openness"),
                "_address_hint": rec.get("_address_hint"),
                "is_synthetic": rec.get("is_synthetic", True),
            },
        )
