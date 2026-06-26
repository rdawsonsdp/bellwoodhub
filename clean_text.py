"""
clean_text.py — derive body_clean from a raw email body.

Strips quoted reply history, signatures, legal disclaimers and mobile-footer
noise. Written as general heuristics (not tied to our exact generator) so it is
a genuine cleaning step that works on real top-posted mail.

Phase-1 hardening (OQ-2): real Outlook / Gmail / Apple Mail / forwarded chains —
"-----Original Message-----", Outlook underscore rules and "From:/Sent:/To:"
quoted-header blocks, wrapped "On … wrote:" attributions, "---------- Forwarded
message ----------". Additive: synthetic bodies don't contain these markers, so
the existing corpus cleans identically; `canonical.clean_body` is a re-derivable
view of immutable RAW, so improving this and replaying from RAW costs no re-pull.
"""
from __future__ import annotations

import re

_ATTRIBUTION = re.compile(r"^On\b.+\bwrote:\s*$")          # "On <date>, X <e> wrote:"
_WROTE_TAIL = re.compile(r"\bwrote:\s*$")                  # wrapped attribution ending in "wrote:"
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
    "this e-mail and any attachments",
)
_MOBILE = re.compile(r"^(sent from my .+|get outlook for .+)$", re.IGNORECASE)

# Real-client quoted-history markers.
_ORIG_MSG = re.compile(r"^\s*-{2,}\s*original message\s*-{2,}\s*$", re.IGNORECASE)
_FORWARDED = re.compile(r"^\s*-{3,}\s*forwarded message\s*-{2,}", re.IGNORECASE)
_UNDERSCORES = re.compile(r"^_{5,}\s*$")                   # Outlook divider line
# Start of an Outlook/Exchange quoted header block (multilingual-ish).
_HDR_FROM = re.compile(r"^\s*(from|de|von|van)\s*:\s*\S", re.IGNORECASE)
_HDR_NEXT = re.compile(r"^\s*(sent|date|to|cc|subject|gesendet|envoyé|verzonden)\s*:\s*", re.IGNORECASE)


def _is_terminator(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if (_SIG_DELIM.match(s) or _ATTRIBUTION.match(s) or _WROTE_TAIL.search(s)
            or _ORIG_MSG.match(s) or _FORWARDED.match(s) or _UNDERSCORES.match(s)
            or _MOBILE.match(s)):
        return True
    if s.startswith(">"):
        return True
    low = s.lower()
    if any(h in low for h in _DISCLAIMER_HINTS):
        return True
    return False


def _outlook_header_block(lines: list[str], i: int) -> bool:
    """True if line i starts an Outlook-style quoted header block (From: … then
    one of Sent/Date/To/Subject within the next few lines)."""
    if not _HDR_FROM.match(lines[i]):
        return False
    for j in range(i + 1, min(i + 5, len(lines))):
        if _HDR_NEXT.match(lines[j]):
            return True
    return False


def clean(body_raw: str) -> str:
    """Return the message body with signature / disclaimer / quoted-chain removed."""
    if not body_raw:
        return ""
    lines = body_raw.splitlines()

    # 1) Cut at the first hard terminator (sig delimiter, quote attribution,
    #    quoted line, disclaimer, mobile footer, or an Outlook quoted-header block).
    cut = len(lines)
    for i, ln in enumerate(lines):
        if _is_terminator(ln) or _outlook_header_block(lines, i):
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
