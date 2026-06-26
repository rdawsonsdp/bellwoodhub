"""
classify.py — step 4. Department/topic/urgency/sensitivity/PII.

Phase 0 keeps the seed `topic` (already curated) and adds the security-relevant
flags that drive RLS later: sensitivity + PII. Urgency/topic re-classification
via Claude Haiku Batch is additive and lives in /pipeline (not load-bearing for
the slice). Kept deterministic here so it is replayable from STAGED with no API.
"""
from __future__ import annotations

import re

from .envelope import Envelope

_PHONE = re.compile(r"\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_ADDR = re.compile(r"\b\d{1,5}\s+[A-Z0-9][\w.'-]*(?:\s+\w+){0,3}\s+"
                   r"(?:Ave|Avenue|Rd|Road|St|Street|Blvd|Dr|Drive|Ln|Lane|Ct|Pl|Ter|Way)\b", re.I)

# Streams whose content is operationally/personally sensitive by default.
_RESTRICTED_STREAMS = {"police", "fire"}


def classify(env: Envelope) -> Envelope:
    """Mutate + return the envelope with sensitivity + pii_flags set."""
    body = env.clean_body or ""
    env.pii_flags = {
        "phone": bool(_PHONE.search(body)),
        "email": bool(_EMAIL.search(body)),
        "address": bool(_ADDR.search(body)),
    }
    if env.source in _RESTRICTED_STREAMS:
        env.sensitivity = "restricted"
    else:
        env.sensitivity = "internal"
    return env
