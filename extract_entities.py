#!/usr/bin/env python3
"""
extract_entities.py — populate poc.email_entities (addresses / people / phones /
businesses), normalized for lookup. This is what powers query.py --address and
--person.

Extraction runs over the subject + the message's OWN content and signature
(quoted reply history is excluded so we don't mis-attribute other people's
details). Findings are then propagated across each thread: every address seen
anywhere in a thread, and the thread's originating resident, are attached to
ALL messages in that thread — so an address/person lookup returns the whole
conversation, not just the one message that spelled it out.

Idempotent: ON CONFLICT DO NOTHING.
"""
from __future__ import annotations

import re
from collections import defaultdict

import config
import db
from clean_text import _ATTRIBUTION
from corpus import personas
from normalize import (normalize_address, normalize_business, normalize_person,
                       normalize_phone)

# Known recurring streets that may appear without a house number.
NAMED_STREETS = [
    "St. Charles Rd", "Mannheim Rd", "25th Ave", "Washington Blvd", "Bohland Ave",
    "Eastern Ave", "Marshall Ave", "Geneva Ave", "Rice Ave", "Bellwood Ave",
    "50th Ave", "Frederick Ave", "Granville Ave", "Hirsch Ave", "Harvard Ave",
    "Morris Ave", "Englewood Ave", "19th Ave", "St. Paul Ave", "Monroe St", "Madison St",
]
_NAMED_RE = [(s, re.compile(r"\b" + re.escape(s) + r"\b", re.IGNORECASE)) for s in NAMED_STREETS]

_NUM_ADDR = re.compile(
    r"\b\d{1,5}\s+(?:[A-Z0-9][\w.'-]*\s+){0,3}"
    r"(?:Ave|Avenue|Rd|Road|St|Street|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|"
    r"Pl|Place|Ter|Terrace|Way|Hwy|Highway|Pkwy|Parkway|Cir|Circle)\b\.?"
)
_PHONE = re.compile(r"\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b")
_HONORIFIC = re.compile(r"\b(?:Mr|Ms|Mrs|Dr|Officer|Mayor|Director)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?")
_GENERIC_BIZ = re.compile(
    r"\b[A-Z][\w&'.-]+(?:\s+[A-Z0-9][\w&'.-]+){0,3}\s+"
    r"(?:Bar|Grill|Lounge|Cantina|Restaurant|Tavern|Pub|Cafe|Café|Diner|"
    r"Landscaping|Excavating|Bakery|Salon|Auto|Motors|Roofing|Plumbing|"
    r"LLC|Inc|Co|Company|Store|Shop|Market|Cleaners|Hardware)\b"
)

# Cast names / businesses we always want recognized.
_CAST_NAMES = [p["name"] for p in personas.PERSONAS.values()]
_KNOWN_BIZ = [p["business"] for p in personas.PERSONAS.values() if p.get("business")] + \
             ["Russo Landscaping", "Verdi Excavating & Drainage"]
_STAFF_DOMAIN = config.STAFF_DOMAIN
_EMAIL_TO_ROLE = {p["email"]: p["role"] for p in personas.PERSONAS.values()}


def own_with_sig(body_raw: str) -> str:
    """The message's own text + signature, with quoted reply history removed."""
    lines = body_raw.splitlines()
    cut = len(lines)
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith(">") or _ATTRIBUTION.match(s):
            cut = i
            break
    return "\n".join(lines[:cut])


def is_resident(from_email: str) -> bool:
    role = _EMAIL_TO_ROLE.get(from_email)
    if role is not None:
        return role in ("resident", "business")
    return not (from_email or "").endswith(_STAFF_DOMAIN)


def extract_one(subject: str, body_raw: str, from_name: str) -> dict[str, list[tuple[str, str]]]:
    """Return {entity_type: [(value, norm), ...]} for a single email."""
    text = f"{subject}\n{own_with_sig(body_raw)}"
    found: dict[str, set] = defaultdict(set)

    # addresses
    for m in _NUM_ADDR.finditer(text):
        v = m.group(0).strip().rstrip(".")
        found["address"].add((v, normalize_address(v)))
    for raw, rx in _NAMED_RE:
        if rx.search(text):
            found["address"].add((raw, normalize_address(raw)))

    # phones
    for m in _PHONE.finditer(text):
        v = m.group(0).strip()
        found["phone"].add((v, normalize_phone(v)))

    # people: the sender, cast names mentioned, honorific names
    if from_name:
        found["person"].add((from_name, normalize_person(from_name)))
    for name in _CAST_NAMES:
        if name.split()[0] in text and name in text:
            found["person"].add((name, normalize_person(name)))
    for m in _HONORIFIC.finditer(text):
        v = m.group(0).strip()
        found["person"].add((v, normalize_person(v)))

    # businesses
    for name in _KNOWN_BIZ:
        if name.lower() in text.lower():
            found["business"].add((name, normalize_business(name)))
    for m in _GENERIC_BIZ.finditer(text):
        v = m.group(0).strip()
        found["business"].add((v, normalize_business(v)))

    return {k: list(v) for k, v in found.items()}


def main() -> None:
    config.require("DATABASE_URL", config.DATABASE_URL)
    conn = db.connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, thread_id, from_name, from_email, subject, body_raw, date_sent "
                "FROM poc.emails ORDER BY thread_id, date_sent"
            )
            rows = cur.fetchall()

        # Per-email raw extraction.
        per_email: dict[str, dict] = {}
        threads: dict[str, list] = defaultdict(list)
        for eid, tid, fname, femail, subject, body_raw, _dt in rows:
            ents = extract_one(subject or "", body_raw or "", fname or "")
            per_email[eid] = ents
            threads[tid].append((eid, fname, femail))  # date-ordered by query

        # Thread propagation: addresses + originating resident person.
        for tid, members in threads.items():
            addr_union = set()
            for eid, _, _ in members:
                addr_union.update(tuple(a) for a in per_email[eid].get("address", []))
            originator = None
            for eid, fname, femail in members:  # members already date/seq-ordered? ensure below
                if fname and is_resident(femail):
                    originator = (fname, normalize_person(fname))
                    break
            for eid, _, _ in members:
                if addr_union:
                    per_email[eid].setdefault("address", [])
                    have = {tuple(a) for a in per_email[eid]["address"]}
                    per_email[eid]["address"] = list(have | addr_union)
                if originator:
                    per_email[eid].setdefault("person", [])
                    have = {tuple(p) for p in per_email[eid]["person"]}
                    per_email[eid]["person"] = list(have | {originator})

        # Collect + de-dup rows, then batched multi-row insert.
        seen: set = set()
        rows: list = []
        for eid, ents in per_email.items():
            for etype, items in ents.items():
                for value, norm in items:
                    if not norm:
                        continue
                    key = (eid, etype, norm[:300])
                    if key in seen:
                        continue
                    seen.add(key)
                    rows.append((eid, etype, value[:300], norm[:300]))

        inserted = 0
        with conn.cursor() as cur:
            cur.execute("TRUNCATE poc.email_entities")
            for i in range(0, len(rows), 500):
                batch = rows[i:i + 500]
                params: list = []
                for r in batch:
                    params.extend(r)
                sql = (
                    "INSERT INTO poc.email_entities "
                    "(email_id, entity_type, entity_value, entity_norm) VALUES "
                    + ", ".join(["(%s,%s,%s,%s)"] * len(batch))
                    + " ON CONFLICT (email_id, entity_type, entity_norm) DO NOTHING"
                )
                cur.execute(sql, params)
                inserted += len(batch)
        conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                "SELECT entity_type, count(*) FROM poc.email_entities GROUP BY entity_type ORDER BY 2 DESC"
            )
            counts = cur.fetchall()
        print(f"Extracted entities for {len(per_email)} emails. Inserted {inserted} entity rows.")
        for t, c in counts:
            print(f"    {t:10s} {c}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
