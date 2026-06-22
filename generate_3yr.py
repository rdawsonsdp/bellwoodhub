#!/usr/bin/env python3
"""
generate_3yr.py — append a 3-year realistic batch (police/fire records authored by
the research workflow + a general citizen/dept fill) spread across the now 3-year
window, weighted to fill the new earliest year (2023-06 → 2024-06).

Reuses the assembler + procedural synth. New message_id/thread_id are namespaced
"y3-" so they can't collide; re-running REPLACES the batch (idempotent).
"""
from __future__ import annotations

import json
import random
from collections import Counter, defaultdict

import config
import generate_corpus as gc
import synth
from corpus import personas

SEED = 20230620
NS = "y3-"

# New police/fire record-type template banks (authored by the workflow).
PF_BANKS = {
    "corpus/banks/tmpl_police_offense.json": 1100,
    "corpus/banks/tmpl_police_admin.json": 500,
    "corpus/banks/tmpl_fire_inspect.json": 700,
    "corpus/banks/tmpl_fire_incident.json": 750,
}
# General fill (constituent-heavy) to give the new year real coverage.
GENERAL = {"constituent": 4500, "interdept": 1200, "business": 500, "civic": 300}
NEWYEAR_FRAC = 0.45  # share of the GENERAL fill pinned into 2023-07 .. 2024-06


def _load_list(path: str) -> list[dict]:
    try:
        data = json.loads(open(path).read())
        return [d for d in data if isinstance(d, dict) and d.get("body_tmpl")]
    except Exception as e:  # noqa: BLE001
        print(f"  ! could not load {path}: {e}")
        return []


def _newyear_hint(rng) -> tuple[int, int]:
    """A (year, month) in the new earliest year window 2023-07 .. 2024-06."""
    off = rng.randint(0, 11)            # 0..11 months past 2023-07
    m0 = 7 + off
    return (2023 + (m0 - 1) // 12, ((m0 - 1) % 12) + 1)


def instantiate(templates: list[dict], target: int, rng, gidx0: int, newyear_frac=0.0) -> list[dict]:
    out: list[dict] = []
    if not templates:
        return out
    order = list(templates)
    rng.shuffle(order)
    i = gidx = 0
    while len(out) < target:
        units = synth._instantiate(order[i % len(order)], gidx0 + gidx, rng)
        if newyear_frac and rng.random() < newyear_frac:
            y, m = _newyear_hint(rng)
            for u in units:
                u["year_hint"], u["month_hint"] = y, m
        out.extend(units)
        gidx += 1
        i += 1
        if i > target * 3 + 200:
            break
    return out


def namespace(emails: list[dict]) -> None:
    for e in emails:
        e["message_id"] = e["message_id"].replace("<", "<" + NS, 1)
        e["thread_id"] = NS + e["thread_id"]


def main() -> None:
    rng = random.Random(SEED)

    units: list[dict] = []
    # police/fire record types (spread across the full 3-year window)
    for path, target in PF_BANKS.items():
        tmpls = _load_list(path)
        u = instantiate(tmpls, target, rng, gidx0=700_000 + len(units))
        print(f"  {path.split('/')[-1]:28s} {len(tmpls):3d} templates -> {len(u)} units")
        units += u

    # general fill, biased to the new earliest year
    _, _, gen_tmpls = gc.load_banks()
    for cat, target in GENERAL.items():
        u = instantiate(gen_tmpls.get(cat, []), target, rng, gidx0=800_000 + len(units), newyear_frac=NEWYEAR_FRAC)
        print(f"  general/{cat:18s} -> {len(u)} units")
        units += u

    print(f"Assembling {len(units)} units ...")
    emails = gc.assemble(units, rng)
    namespace(emails)
    print(f"Assembled {len(emails)} new emails.")

    # idempotent append: drop any prior y3- batch
    existing = json.loads(config.SEED_FILE.read_text())
    base = [e for e in existing if not e["message_id"].startswith("<" + NS)]
    combined = base + emails
    (config.CORPUS_DIR / "seed_3yr.json").write_text(json.dumps(emails, indent=2, ensure_ascii=False))
    config.SEED_FILE.write_text(json.dumps(combined, indent=2, ensure_ascii=False))
    print(f"base={len(base)} + new={len(emails)} -> canonical seed {len(combined)}")

    # report
    print("\n" + "=" * 60)
    print(f"  NEW 3-YEAR BATCH: {len(emails)} emails")
    print("=" * 60)
    print("  direction :", dict(Counter(e["direction"] for e in emails)))
    print("  topics    :")
    for t, c in Counter(e["topic"] for e in emails).most_common():
        print(f"      {t:18s} {c}")
    print("  by year   :")
    for y, c in sorted(Counter(e["date_sent"][:4] for e in emails).items()):
        print(f"      {y}  {c}")
    print("  combined corpus by year:")
    for y, c in sorted(Counter(e["date_sent"][:4] for e in combined).items()):
        print(f"      {y}  {c}")


if __name__ == "__main__":
    main()
