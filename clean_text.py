"""
clean_text.py — derive body_clean from a raw email body.

Strips quoted reply history, signatures, legal disclaimers and mobile-footer
noise. Written as general heuristics (not tied to our exact generator) so it is
a genuine cleaning step: it would also work on real top-posted email.
"""
from __future__ import annotations

import re

_ATTRIBUTION = re.compile(r"^On\b.+\bwrote:\s*$")          # "On <date>, X <e> wrote:"
_SIG_DELIM = re.compile(r"^--\s*$")                        # standard "-- " sig delimiter
_SIGNOFF = re.compile(
    r"^(warm regards|kind regards|best regards|regards|sincerely|"
    r"respectfully|best|thanks again|many thanks|thank you|thanks|cheers)[,!.]?\s*$",
    re.IGNORECASE,
)
_DISCLAIMER_HINTS = (
    "confidentiality notice",
    "this message and any attachments",
    "this email and any attachments",
)
_MOBILE = re.compile(r"^sent from my .+$", re.IGNORECASE)


def _is_body_terminator(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if _SIG_DELIM.match(s):
        return True
    if _ATTRIBUTION.match(s):
        return True
    if s.startswith(">"):
        return True
    if _MOBILE.match(s):
        return True
    low = s.lower()
    if any(h in low for h in _DISCLAIMER_HINTS):
        return True
    return False


def clean(body_raw: str) -> str:
    """Return the message body with signature / disclaimer / quoted-chain removed."""
    if not body_raw:
        return ""
    lines = body_raw.splitlines()

    # 1) Cut at the first hard terminator (sig delimiter, quote attribution,
    #    quoted line, disclaimer, or mobile footer).
    cut = len(lines)
    for i, ln in enumerate(lines):
        if _is_body_terminator(ln):
            cut = i
            break
    body = lines[:cut]

    # 2) Drop a trailing sign-off + short name/signature block that some emails
    #    include without a "-- " delimiter (e.g. "Warm regards,\nGloria Bennett").
    while body and not body[-1].strip():
        body.pop()
    for i in range(len(body) - 1, max(-1, len(body) - 6), -1):
        if _SIGNOFF.match(body[i].strip()):
            body = body[:i]
            break

    while body and not body[-1].strip():
        body.pop()
    return "\n".join(body).strip()
