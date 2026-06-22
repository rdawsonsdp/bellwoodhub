#!/usr/bin/env python3
"""
generate_now.py — append a "current" batch dated June 2026 (heavily the week of
June 15-22, newest = June 22) so the corpus is up to date and queries return
records from this week.

Inputs:
  * corpus/authored/week_{police,fire,citizen,interdept}.json — authored by the
    current-week workflow (specific, realistic, day-dated this week).
  * the existing template banks (police/fire record types + general) — instantiated
    procedurally for volume, with dates overridden into June 2026.

New message_id/thread_id are namespaced "now-"; re-running REPLACES the batch.
"""
from __future__ import annotations

import json
import random
from collections import Counter

import config
import generate_corpus as gc
import synth

SEED = 20260622
NS = "now-"
WEEK_FILES = ["week_police", "week_fire", "week_citizen", "week_interdept"]
PF_BANKS = ["tmpl_police_offense", "tmpl_police_admin", "tmpl_fire_inspect", "tmpl_fire_incident"]
PROC = {"police": 220, "fire": 220, "general": 480, "interdept": 140}


def recent_day(rng) -> int:
    """Weight the current week (15-22) heavily; sprinkle earlier June."""
    pool = [2, 4, 6, 9, 11, 13] + [15, 16, 17, 18, 19, 20, 21, 22] * 5
    return rng.choice(pool)


def load_week_units() -> list[dict]:
    units: list[dict] = []
    for stem in WEEK_FILES:
        p = config.AUTHORED_DIR / f"{stem}.json"
        if not p.exists():
            print(f"  ! missing {p.name}")
            continue
        try:
            data = json.loads(p.read_text())
        except Exception as e:  # noqa: BLE001
            print(f"  ! bad {p.name}: {e}")
            continue
        kept = 0
        for raw in data:
            if not isinstance(raw, dict):
                continue
            if not all(k in raw and raw[k] not in (None, "") for k in gc.REQUIRED_KEYS):
                continue
            units.append(gc._normalize(raw, source=stem))
            kept += 1
        print(f"  {stem}: {kept} authored units")
    return units


def _read_bank(name: str) -> list[dict]:
    try:
        return [d for d in json.loads((config.CORPUS_DIR / "banks" / f"{name}.json").read_text()) if d.get("body_tmpl")]
    except Exception:  # noqa: BLE001
        return []


def proc_units(rng) -> list[dict]:
    _, _, gen = gc.load_banks()
    police = _read_bank("tmpl_police_offense") + _read_bank("tmpl_police_admin")
    fire = _read_bank("tmpl_fire_inspect") + _read_bank("tmpl_fire_incident")
    out: list[dict] = []
    gidx = [600_000]

    def run(templates, target):
        if not templates:
            return
        order = list(templates)
        rng.shuffle(order)
        i = made = 0
        while made < target:
            us = synth._instantiate(order[i % len(order)], gidx[0], rng)
            gidx[0] += 1
            for u in us:  # pin every unit into June 2026 (this month / week)
                u["year_hint"], u["month_hint"], u["day_hint"] = 2026, 6, recent_day(rng)
            out.extend(us)
            made += len(us)
            i += 1
            if i > target * 3 + 100:
                break

    run(police, PROC["police"])
    run(fire, PROC["fire"])
    run(gen.get("constituent", []), PROC["general"])
    run(gen.get("interdept", []), PROC["interdept"])
    return out


def main() -> None:
    rng = random.Random(SEED)
    units = load_week_units() + proc_units(rng)
    print(f"Assembling {len(units)} units (current month) ...")
    emails = gc.assemble(units, rng)
    for e in emails:
        e["message_id"] = e["message_id"].replace("<", "<" + NS, 1)
        e["thread_id"] = NS + e["thread_id"]

    existing = json.loads(config.SEED_FILE.read_text())
    base = [e for e in existing if not e["message_id"].startswith("<" + NS)]
    combined = base + emails
    (config.CORPUS_DIR / "seed_now.json").write_text(json.dumps(emails, indent=2, ensure_ascii=False))
    config.SEED_FILE.write_text(json.dumps(combined, indent=2, ensure_ascii=False))
    print(f"base={len(base)} + new={len(emails)} -> canonical seed {len(combined)}")

    print("\n  NEW CURRENT BATCH by day (June 2026):")
    for d, c in sorted(Counter(e["date_sent"][:10] for e in emails if e["date_sent"][:7] == "2026-06").items()):
        flag = "  <- this week" if int(d[8:10]) >= 15 else ""
        print(f"      {d}  {c}{flag}")
    print("  newest record in whole corpus:", max(e["date_sent"] for e in combined)[:10])
    print("  records dated >= 2026-06-15:", sum(1 for e in combined if e["date_sent"][:10] >= "2026-06-15"))


if __name__ == "__main__":
    main()
