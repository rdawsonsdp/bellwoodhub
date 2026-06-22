#!/usr/bin/env python3
"""
generate_corpus.py — assemble the canonical seed corpus from authored units.

The LLM authoring step (the Workflow) writes batches of *clean* email content
to corpus/authored/*.json. This script is the deterministic, seeded layer: it
places each message in time (seasonal + weekday biased), wires reply threads,
and builds realistic `body_raw` (clean body + signature + legal disclaimer +
nested quoted reply history) so the downstream cleaning step is non-trivial.

Output: corpus/seed_emails.json — one object per email, ready to load.

Deterministic: same authored inputs + RANDOM_SEED => identical seed file.
"""
from __future__ import annotations

import calendar
import datetime as dt
import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config
import synth
from corpus import personas

WINDOW_START = dt.datetime.combine(config.CORPUS_START, dt.time())
WINDOW_END = dt.datetime.combine(config.CORPUS_END, dt.time(23, 59))

SEASON_MONTHS = {
    "winter": [12, 1, 2],
    "spring": [3, 4, 5],
    "summer": [6, 7, 8],
    "fall": [9, 10, 11],
}

REQUIRED_KEYS = ("thread_key", "seq", "from_key", "direction", "topic", "subject", "body_clean")

MOBILE_TAG = "Sent from my iPhone"
COMMUNITY_EMAIL = "residents@bellwood-demo.gov"


# ───────────────────────────── loading ──────────────────────────────────────
def load_units() -> list[dict]:
    """Read every authored batch file, namespacing thread_keys by source file."""
    files = sorted(config.AUTHORED_DIR.glob("*.json"))
    if not files:
        raise SystemExit(
            f"No authored batches in {config.AUTHORED_DIR}. Run the authoring "
            f"workflow first."
        )
    units: list[dict] = []
    for f in files:
        try:
            data = json.loads(f.read_text())
        except Exception as e:  # noqa: BLE001
            print(f"  ! skipping unreadable {f.name}: {e}")
            continue
        if not isinstance(data, list):
            print(f"  ! skipping {f.name}: not a JSON array")
            continue
        kept = 0
        for raw in data:
            if not isinstance(raw, dict):
                continue
            if not all(k in raw and raw[k] not in (None, "") for k in REQUIRED_KEYS):
                continue
            u = _normalize(raw, source=f.stem)
            units.append(u)
            kept += 1
        print(f"  · {f.name}: {kept} units")
    return units


def _as_int(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _normalize(raw: dict, source: str) -> dict:
    return {
        "source": source,
        "scenario": str(raw.get("scenario") or ("hero" if source.startswith("hero") else "filler")),
        # Namespacing guarantees no cross-file thread collisions.
        "thread_key": f"{source}::{str(raw['thread_key']).strip()}",
        "seq": _as_int(raw["seq"], 1),
        "from_key": str(raw["from_key"]).strip(),
        "from_name": str(raw.get("from_name") or "").strip(),
        "from_email": str(raw.get("from_email") or "").strip(),
        "direction": str(raw["direction"]).strip().lower(),
        "topic": str(raw["topic"]).strip(),
        "season": str(raw.get("season") or "any").strip().lower(),
        "year_hint": _as_int(raw.get("year_hint"), 0),
        "month_hint": _as_int(raw.get("month_hint"), 0),
        "day_hint": _as_int(raw.get("day_hint"), 0),
        "hour_hint": _as_int(raw.get("hour_hint"), 0),
        "subject": str(raw["subject"]).strip(),
        "body_clean": str(raw["body_clean"]).strip(),
        "openness": str(raw.get("openness") or "info").strip().lower(),
        "address_hint": str(raw.get("address_hint") or "").strip(),
        "cc_keys": [str(c).strip() for c in raw.get("cc_keys", []) if str(c).strip()],
    }


# ───────────────────────────── identities ───────────────────────────────────
def identity(unit: dict) -> tuple[str, str, str]:
    """Return (name, email, role) for a unit's sender."""
    k = unit["from_key"]
    if personas.known(k):
        p = personas.get(k)
        return p["name"], p["email"], p["role"]
    name = unit["from_name"] or "Bellwood Resident"
    email = unit["from_email"] or _synth_email(name)
    return name, email, "resident"


def _synth_email(name: str) -> str:
    slug = "".join(ch for ch in name.lower() if ch.isalnum()) or "resident"
    return f"{slug}@example.com"


def resolve_direction(from_role: str, raw_direction: str) -> str:
    """Mayor's-office mail is outbound; residents/businesses/agencies inbound;
    department staff keep what the author intended (usually outbound replies)."""
    if from_role == "mayor":
        return "outbound"
    if from_role in ("resident", "business", "external"):
        return "inbound"
    return raw_direction if raw_direction in ("inbound", "outbound") else "inbound"


def cc_text(cc_keys: list[str]) -> str:
    parts = []
    for k in cc_keys:
        if personas.known(k):
            p = personas.get(k)
            parts.append(f"{p['name']} <{p['email']}>")
    return ", ".join(parts)


# ───────────────────────────── dating ───────────────────────────────────────
def place_date(unit: dict, rng: random.Random) -> dt.datetime:
    """Pick a datetime honoring year/month/(day) hints, inside the window,
    biased toward weekdays and daytime. An exact day_hint (daily reports) is
    honored precisely with no weekday nudging."""
    year = unit["year_hint"] if 2023 <= unit["year_hint"] <= 2026 else rng.choice([2023, 2024, 2025, 2026])
    month = unit["month_hint"] if 1 <= unit["month_hint"] <= 12 else None
    if month is None:
        season = unit["season"]
        month = rng.choice(SEASON_MONTHS[season]) if season in SEASON_MONTHS else rng.randint(1, 12)
    day_hint = unit.get("day_hint", 0)
    hour_hint = unit.get("hour_hint", 0)
    exact = 1 <= day_hint <= 31
    if exact:
        day = min(day_hint, calendar.monthrange(year, month)[1])
    else:
        day = rng.randint(1, 28)
    hour = hour_hint if 1 <= hour_hint <= 23 else rng.choice([8, 9, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20])
    minute = rng.randint(0, 59)
    cand = dt.datetime(year, month, day, hour, minute)

    # Slide into the window by whole years when possible. For a date that
    # overflows only within the boundary month (e.g. a late-June-2026 day past
    # the window end), clamp the day instead of sliding a whole year back — so
    # "latest" hero emails stay genuinely recent.
    while cand < WINDOW_START:
        cand = cand.replace(year=cand.year + 1)
    if cand > WINDOW_END:
        if (cand.year, cand.month) == (WINDOW_END.year, WINDOW_END.month):
            cand = cand.replace(day=min(cand.day, WINDOW_END.day))
        else:
            while cand > WINDOW_END:
                cand = cand.replace(year=cand.year - 1)
    if cand < WINDOW_START:
        cand = WINDOW_START + dt.timedelta(days=rng.randint(0, 20))

    # Weekday bias: nudge weekends onto a weekday most of the time (not for
    # fixed-date daily reports).
    if not exact and cand.weekday() >= 5 and rng.random() < 0.85:
        shift = -1 if cand.weekday() == 5 else (1 if rng.random() < 0.5 else -2)
        cand = cand + dt.timedelta(days=shift)
    # Clamp once more after nudging.
    if cand < WINDOW_START:
        cand = WINDOW_START + dt.timedelta(hours=rng.randint(8, 20))
    if cand > WINDOW_END:
        cand = WINDOW_END - dt.timedelta(days=rng.randint(0, 10))
    return cand


def reply_gap(rng: random.Random) -> dt.timedelta:
    hours = rng.choice([1, 2, 3, 5, 20, 26, 30, 48, 54, 72, 96])
    return dt.timedelta(hours=hours, minutes=rng.randint(0, 59))


# ───────────────────────────── body_raw ─────────────────────────────────────
def signature(unit: dict, name: str) -> str:
    k = unit["from_key"]
    if personas.known(k):
        return personas.get(k)["signature"]
    # one-off resident signature
    sig = name
    if unit["address_hint"]:
        sig += f"\n{unit['address_hint']}"
    return sig


def wants_disclaimer(unit: dict) -> bool:
    k = unit["from_key"]
    return personas.known(k) and bool(personas.get(k).get("disclaimer"))


def quote(prev_raw: str) -> str:
    return "\n".join("> " + ln for ln in prev_raw.splitlines())


def build_body_raw(unit: dict, name: str, sig: str, prev: dict | None, rng: random.Random) -> str:
    parts = [unit["body_clean"], "", "-- ", sig]
    if wants_disclaimer(unit):
        parts += ["", personas.DISCLAIMER]
    elif unit["from_key"] == "oneoff" and rng.random() < 0.15:
        parts += ["", MOBILE_TAG]
    body = "\n".join(parts)
    if prev is not None:
        header = (
            f"On {prev['date_sent']:%b %d, %Y at %I:%M %p}, "
            f"{prev['from_name']} <{prev['from_email']}> wrote:"
        )
        body = body + "\n\n" + header + "\n" + quote(prev["body_raw"])
    return body


def msg_id(thread_key: str, seq: int) -> str:
    h = hashlib.md5(f"{thread_key}|{seq}".encode()).hexdigest()[:16]
    return f"<{h}@mail.bellwood-demo.gov>"


def thread_id_of(thread_key: str) -> str:
    return "thr-" + hashlib.md5(thread_key.encode()).hexdigest()[:12]


# ───────────────────────────── assembly ─────────────────────────────────────
def assemble(units: list[dict], rng: random.Random) -> list[dict]:
    # Group into threads (stable order by thread_key).
    threads: dict[str, list[dict]] = defaultdict(list)
    for u in units:
        threads[u["thread_key"]].append(u)

    emails: list[dict] = []
    seen_mids: set = set()
    for tkey in sorted(threads):
        members = sorted(threads[tkey], key=lambda x: x["seq"])
        root_subject = members[0]["subject"]
        originator_name, originator_email, _ = identity(members[0])

        # Per-unit dates honoring hints, then force strictly increasing by seq.
        for m in members:
            m["_dt"] = place_date(m, rng)
        for i in range(1, len(members)):
            if members[i]["_dt"] <= members[i - 1]["_dt"]:
                members[i]["_dt"] = members[i - 1]["_dt"] + reply_gap(rng)
                if members[i]["_dt"] > WINDOW_END:
                    members[i]["_dt"] = WINDOW_END

        prev_assembled: dict | None = None
        for m in members:
            name, email, role = identity(m)
            direction = resolve_direction(role, m["direction"])
            sig = signature(m, name)
            raw = build_body_raw(m, name, sig, prev_assembled, rng)

            if m["seq"] == 1:
                subject = m["subject"]
            else:
                subject = root_subject if root_subject.lower().startswith("re:") else f"Re: {root_subject}"

            to_key = m.get("to_key")
            if to_key and personas.known(to_key):
                to_email = personas.get(to_key)["email"]
            elif direction == "outbound":
                to_email = originator_email if m["seq"] > 1 and originator_email != email else COMMUNITY_EMAIL
            else:
                to_email = config.MAYOR_EMAIL

            mid = msg_id(m["thread_key"], m["seq"])
            salt = 0
            while mid in seen_mids:
                salt += 1
                mid = msg_id(f"{m['thread_key']}~{salt}", m["seq"])
            seen_mids.add(mid)
            rec = {
                "message_id": mid,
                "thread_id": thread_id_of(m["thread_key"]),
                "direction": direction,
                "from_name": name,
                "from_email": email,
                "to_email": to_email,
                "cc": cc_text(m["cc_keys"]),
                "subject": subject,
                "date_sent": m["_dt"].isoformat(),
                "body_raw": raw,
                "body_clean": m["body_clean"],   # reference; loader re-derives from body_raw
                "topic": m["topic"],
                "is_synthetic": True,
                # ── reference metadata (not loaded into DB columns) ──
                "_scenario": m["scenario"],
                "_openness": m["openness"],
                "_address_hint": m["address_hint"],
                "_seq": m["seq"],
                "_source": m["source"],
            }
            emails.append(rec)
            m_for_prev = dict(rec)
            m_for_prev["date_sent"] = m["_dt"]
            prev_assembled = m_for_prev

    emails.sort(key=lambda r: r["date_sent"])
    return emails


def enforce_size(emails: list[dict], rng: random.Random) -> list[dict]:
    """Keep all genuine content (hero, complex threads, police/fire reports,
    authored filler); fill the rest from procedural (syn_*) volume to hit exactly
    CORPUS_SIZE, trimming/adding at whole-thread granularity."""
    target = config.CORPUS_SIZE
    protected = [e for e in emails if not e["_source"].startswith("syn_")]
    flex = [e for e in emails if e["_source"].startswith("syn_")]
    if len(protected) >= target:
        return sorted(protected, key=lambda r: r["date_sent"])[:target]

    by_thread: dict[str, list[dict]] = defaultdict(list)
    for e in flex:
        by_thread[e["thread_id"]].append(e)
    threads = list(by_thread.values())
    rng.shuffle(threads)

    chosen = list(protected)
    used = set()
    for i, t in enumerate(threads):
        if len(chosen) + len(t) <= target:
            chosen.extend(t)
            used.add(i)
    if len(chosen) < target:  # exact top-up using leftover single-message threads
        for i, t in enumerate(threads):
            if i in used or len(t) != 1:
                continue
            chosen.append(t[0])
            if len(chosen) >= target:
                break
    return sorted(chosen, key=lambda r: r["date_sent"])[:target]


# ───────────────────────────── stats ────────────────────────────────────────
BANKS_DIR = config.CORPUS_DIR / "banks"


def _family(src: str) -> str:
    if src.startswith("hero"):
        return "hero"
    if src.startswith("complex"):
        return "complex"
    if src in ("police", "fire"):
        return src
    if src.startswith("f-"):
        return "authored_filler"
    if src.startswith("syn_"):
        return "synth/" + src[4:]
    return src


def load_banks() -> tuple[list, list, dict]:
    """Load police/fire incident banks and category->templates from corpus/banks."""
    police, fire = [], []
    tmpls: dict[str, list] = defaultdict(list)
    for f in sorted(BANKS_DIR.glob("*.json")) if BANKS_DIR.exists() else []:
        try:
            data = json.loads(f.read_text())
        except Exception as e:  # noqa: BLE001
            print(f"  ! skipping unreadable bank {f.name}: {e}")
            continue
        if not isinstance(data, list):
            continue
        if f.stem.startswith("police_incidents"):
            police += [d for d in data if isinstance(d, dict) and d.get("narrative")]
        elif f.stem.startswith("fire_incidents"):
            fire += [d for d in data if isinstance(d, dict) and d.get("narrative")]
        else:
            for d in data:
                if isinstance(d, dict) and d.get("body_tmpl"):
                    cat = d.get("category", "constituent")
                    if cat not in ("constituent", "interdept", "business", "civic"):
                        cat = "constituent"
                    tmpls[cat].append(d)
    return police, fire, dict(tmpls)


def report(emails: list[dict]) -> None:
    print("\n" + "=" * 64)
    print(f"  CORPUS: {len(emails)} emails")
    print("=" * 64)
    dates = [e["date_sent"] for e in emails]
    print(f"  date range : {min(dates)[:10]} .. {max(dates)[:10]}")
    print(f"  direction  : {dict(Counter(e['direction'] for e in emails))}")
    print("  source mix :")
    for fam, c in Counter(_family(e["_source"]) for e in emails).most_common():
        print(f"      {fam:18s} {c}")
    print("  topics     :")
    for t, c in Counter(e["topic"] for e in emails).most_common():
        print(f"      {t:18s} {c}")
    print("  top CONSTITUENT senders:")
    consti = Counter(e["from_email"] for e in emails
                     if e["direction"] == "inbound" and not e["from_email"].endswith("demo.gov"))
    for s, c in consti.most_common(8):
        print(f"      {c:4d}  {s}")
    print("  by month (scaled bars):")
    months = Counter(e["date_sent"][:7] for e in emails)
    for mth in sorted(months):
        print(f"      {mth}  {months[mth]:4d} {'#' * (months[mth] // 12)}")
    blob = " ".join(e["subject"] + " " + e["body_raw"] for e in emails)
    print("  hero / cross-link checks:")
    print(f"      2218 Bohland Ave  : {blob.count('2218 Bohland')} mentions")
    print(f"      Gloria Bennett    : {sum(1 for e in emails if e['from_email']==personas.get('gloria')['email'])} emails")
    print(f"      St. Charles bars  : route64={blob.count('Route 64')} hideout={blob.count('Hideout')} elfaro={blob.count('El Faro')}")
    print(f"      police reports    : {sum(1 for e in emails if e['topic']=='public_safety')}")
    print(f"      fire/EMS reports  : {sum(1 for e in emails if e['topic']=='fire_ems')}")


def main() -> None:
    rng = random.Random(config.RANDOM_SEED)
    print(f"Loading authored units from {config.AUTHORED_DIR} ...")
    authored = load_units()
    print(f"Loaded {len(authored)} authored units.")

    police_bank, fire_bank, tmpl_banks = load_banks()
    print(f"Banks: police_incidents={len(police_bank)}, fire_incidents={len(fire_bank)}, "
          f"templates={{ {', '.join(f'{k}:{len(v)}' for k, v in tmpl_banks.items())} }}")

    n_pol, n_fire = config.SOURCE_MIX["police"], config.SOURCE_MIX["fire"]
    police_units = synth.gen_police(rng, n_pol, police_bank)
    fire_units = synth.gen_fire(rng, n_fire, fire_bank)

    base = len(authored) + len(police_units) + len(fire_units)
    tmpl_total = max(0, config.CORPUS_SIZE - base)
    tmpl_units = synth.gen_templates(rng, int(tmpl_total * 1.05) + 50, tmpl_banks)
    print(f"Units: authored={len(authored)}, police={len(police_units)}, "
          f"fire={len(fire_units)}, templated={len(tmpl_units)}")

    all_units = authored + police_units + fire_units + tmpl_units
    emails = assemble(all_units, rng)
    print(f"Assembled {len(emails)} emails (pre-trim).")
    emails = enforce_size(emails, rng)
    config.SEED_FILE.write_text(json.dumps(emails, indent=2, ensure_ascii=False))
    print(f"Wrote {len(emails)} emails -> {config.SEED_FILE}")
    report(emails)


if __name__ == "__main__":
    main()
