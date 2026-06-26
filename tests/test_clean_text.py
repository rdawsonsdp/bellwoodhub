#!/usr/bin/env python3
"""Tests for clean_text.clean() — quote/sig/disclaimer stripping across clients.
Run standalone (`python tests/test_clean_text.py`) or via pytest."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from clean_text import clean  # noqa: E402

BODY = "The catch basin at 2218 Bohland Ave is overflowing again after last night's storm."


def _check(name: str, raw: str, must_have: str = BODY, must_not: str | None = None) -> None:
    out = clean(raw)
    assert must_have in out, f"[{name}] expected body kept, got:\n{out!r}"
    if must_not is not None:
        assert must_not not in out, f"[{name}] expected {must_not!r} stripped, got:\n{out!r}"


def test_synthetic_signoff_and_disclaimer():
    _check("synthetic",
           f"{BODY}\n\nWarm regards,\nGloria Bennett\n\nCONFIDENTIALITY NOTICE: this message ...",
           must_not="Gloria Bennett")


def test_gmail_attribution():
    _check("gmail",
           f"{BODY}\n\nOn Mon, Jun 1, 2026 at 9:00 AM Public Works <pw@village.gov> wrote:\n> earlier text",
           must_not="earlier text")


def test_gmail_wrapped_attribution():
    _check("gmail-wrapped",
           f"{BODY}\n\nOn Mon, Jun 1, 2026 at 9:00 AM Public Works Director\n<pw@village.gov> wrote:\n> earlier",
           must_not="earlier")


def test_outlook_original_message():
    _check("outlook-orig",
           f"{BODY}\n\n-----Original Message-----\nFrom: PW\nSent: Monday\nearlier text",
           must_not="earlier text")


def test_outlook_header_block():
    _check("outlook-hdr",
           f"{BODY}\n\nFrom: Public Works <pw@village.gov>\nSent: Monday, June 1, 2026 9:00 AM\nTo: Mayor\nSubject: RE: drainage\n\nearlier text",
           must_not="earlier text")


def test_outlook_underscores():
    _check("outlook-underscores",
           f"{BODY}\n\n________________________________\nFrom: PW\nSubject: RE:\nearlier",
           must_not="earlier")


def test_forwarded():
    _check("forwarded",
           f"{BODY}\n\n---------- Forwarded message ----------\nFrom: resident\nearlier",
           must_not="earlier")


def test_quoted_chain():
    _check("quoted", f"{BODY}\n> On earlier you wrote\n> more quoted", must_not="quoted")


def test_mobile_footer():
    _check("mobile", f"{BODY}\n\nSent from my iPhone", must_not="iPhone")


def test_idempotent_clean_body():
    # cleaning an already-clean body is a no-op
    assert clean(BODY) == BODY


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ✓ {fn.__name__}")
    print(f"\n{len(fns)} clean_text tests passed.")
