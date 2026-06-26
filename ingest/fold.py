"""
fold.py — issue / event / commitment derivation (AD-5, event-sourcing).

Issue state is NEVER stored as a latest-status field; it is a fold over `events`
(see the canonical.issue_state view). This module produces the events. Because
the view orders by occurred_at, a late/out-of-order message that we classify as
'reopened' correctly re-folds an already-'resolved' issue back open (R3 / OQ-8).

Phase-0 derivation is heuristic and scoped: an issue is created only for threads
that carry a real open/resolved signal (the synthetic corpus wasn't generated
with issue semantics, so pure info/thanks threads get messages but no issue).
The 11 authored hero/complex threads are the fold's ground truth.
"""
from __future__ import annotations

import datetime as _dt
import re
from collections import Counter
from dataclasses import dataclass, field

from .envelope import Envelope

# A future-tense promise from a staff/mayor message → a commitment (low recall OK).
_PROMISE = re.compile(
    r"\b("
    r"i['’]ll|we['’]ll|i will|we will|i'll have|we'll have|"
    r"will (?:have|send|get|follow up|forward|schedule|dispatch|arrange|ensure|"
    r"make sure|look into|circle back|reach out)|"
    r"by (?:end of|eod|cob|monday|tuesday|wednesday|thursday|friday|next week|"
    r"this week|tomorrow|friday)|"
    r"expect .* by|should have .* by"
    r")\b",
    re.IGNORECASE,
)

_STATE_OPEN = {"opened", "reopened", "update"}


@dataclass
class DerivedEvent:
    event_type: str
    occurred_at: _dt.datetime
    msg_index: int           # index into the sorted thread → resolve to message_id


@dataclass
class ThreadDerivation:
    issue_type: str
    title: str
    opened_at: _dt.datetime
    events: list[DerivedEvent] = field(default_factory=list)


def derive_thread(envs: list[Envelope]) -> ThreadDerivation | None:
    """Derive the issue + ordered events for one thread (envs in thread order).
    Returns None for threads with no open/resolved signal (no issue)."""
    has_signal = any(e.openness in ("open", "resolved") for e in envs)
    if not has_signal:
        return None

    ordered = sorted(
        enumerate(envs),
        key=lambda iv: (iv[1].seq if iv[1].seq is not None else 0,
                        iv[1].sent_at or _dt.datetime.min),
    )

    topic = Counter(e.topic for e in envs if e.topic).most_common(1)
    issue_type = topic[0][0] if topic else "general"
    title = next((e.subject for _, e in ordered if e.subject), "Untitled issue")
    opened_at = min((e.sent_at for e in envs if e.sent_at), default=None)
    if opened_at is None:
        return None

    deriv = ThreadDerivation(issue_type=issue_type, title=title[:300], opened_at=opened_at)

    state: str | None = None
    first = True
    for idx, e in ordered:
        if e.sent_at is None:
            continue
        et: str | None
        op = e.openness
        if op == "resolved":
            et, state = "resolved", "resolved"
        elif op == "open":
            if state == "resolved":
                et, state = "reopened", "open"   # the re-fold case (R3/OQ-8)
            elif state is None:
                et, state = "opened", "open"
            else:
                et = "update"                     # state stays open
        elif first and op is None:
            et, state = "opened", "open"
        else:
            et = "note"                           # info / non-signal
        if first and et == "update":
            et, state = "opened", "open"
        first = False
        deriv.events.append(DerivedEvent(et, e.sent_at, idx))
    return deriv


def derive_commitments(env: Envelope) -> list[str]:
    """Heuristic commitment text(s) from a staff/mayor outbound message."""
    if env.direction not in ("outbound", "internal"):
        return []
    out: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", env.clean_body or ""):
        if _PROMISE.search(sentence):
            out.append(sentence.strip()[:400])
    return out[:3]
