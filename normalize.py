"""Shared normalization helpers for entity values (used by extract + query)."""
from __future__ import annotations

import re

_SUFFIX = {
    "ave": "avenue", "av": "avenue", "avenue": "avenue",
    "rd": "road", "road": "road",
    "st": "street", "street": "street",
    "blvd": "boulevard", "boulevard": "boulevard",
    "dr": "drive", "drive": "drive",
    "ln": "lane", "lane": "lane",
    "ct": "court", "court": "court",
    "pl": "place", "place": "place",
    "ter": "terrace", "terr": "terrace", "terrace": "terrace",
    "way": "way", "hwy": "highway", "highway": "highway",
    "pkwy": "parkway", "parkway": "parkway", "cir": "circle", "circle": "circle",
}


def _collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def normalize_address(s: str) -> str:
    """'2218 Bohland Ave' -> '2218 bohland avenue'; 'St. Charles Rd' -> 'st charles road'."""
    s = s.lower().replace(".", " ")
    toks = _collapse(s).split()
    if toks and toks[-1] in _SUFFIX:
        toks[-1] = _SUFFIX[toks[-1]]
    return _collapse(" ".join(toks))


def normalize_text(s: str) -> str:
    return _collapse(re.sub(r"[^\w\s]", " ", s.lower()))


normalize_person = normalize_text
normalize_business = normalize_text


def normalize_phone(s: str) -> str:
    return re.sub(r"\D", "", s)
