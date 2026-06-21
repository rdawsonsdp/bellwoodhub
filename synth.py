"""
synth.py — procedural unit generation for the 10k corpus (the "volume" layer of
the hybrid build).

Consumes the LLM-authored banks:
  * slot templates  -> instantiated many times with pools (varied addresses,
    names, dates, amounts, account/case numbers), optionally as 2-message threads.
  * police / fire incident narratives -> assembled into daily incident/run
    reports with full date coverage across the window.

Emits unit dicts in the SAME shape the assembler (generate_corpus.assemble)
consumes, so authored + procedural content flow through one pipeline.
Deterministic given the passed-in random.Random.
"""
from __future__ import annotations

import datetime as dt
import re

import config
from corpus import pools

_TOKEN = re.compile(r"\{([A-Z_]+)\}")
MONTHS = {"winter": [12, 1, 2], "spring": [3, 4, 5], "summer": [6, 7, 8], "fall": [9, 10, 11]}


def _unit(**kw) -> dict:
    base = dict(
        source="syn", scenario="syn", thread_key="", seq=1, from_key="oneoff",
        from_name="", from_email="", to_key=None, direction="inbound", topic="complaint",
        season="any", year_hint=0, month_hint=0, day_hint=0, hour_hint=0,
        subject="", body_clean="", openness="info", address_hint="", cc_keys=[],
    )
    base.update(kw)
    return base


def make_ctx(rng, year: int, month: int) -> dict:
    first, last = pools.person(rng)
    street = rng.choice(pools.STREETS)
    cross = rng.choice([s for s in pools.STREETS if s != street])
    biz = pools.biz_name(rng)
    # {ADDRESS} uses a realistic house number; standalone {NUM} is a small count
    # ("{NUM} inches", "the {NUM}th time") since templates use {ADDRESS} for addresses.
    return {
        "_first": first, "_last": last,
        "STREET": street, "CROSS": cross,
        "NUM": rng.choice([2, 3, 3, 4, 5, 6, 7, 8, 10, 12]),
        "ADDRESS": f"{pools.house_number(rng)} {street}",
        "FIRST": first, "LAST": last, "NAME": f"{first} {last}", "BIZ": biz,
        "AMOUNT": pools.amount(rng), "ACCT": pools.account_no(rng),
        "CASE": pools.case_no(rng, year, "B"),
        "DATE": f"{month}/{rng.randint(1,28)}/{year}",
        "TIME": pools.clock_time(rng), "PHONE": pools.phone(rng),
        "AGE": str(rng.randint(17, 89)), "DAYS": pools.days_phrase(rng),
        "DEPT": rng.choice(pools.DEPTS),
        "DISPOSITION": rng.choice(pools.POLICE_DISPOSITIONS),
        "UNITS": rng.choice(pools.FIRE_UNITS),
    }


def fill(text: str, ctx: dict) -> str:
    # collapse "$$" in case a template wrote "${AMOUNT}" ({AMOUNT} already carries $)
    return _TOKEN.sub(lambda m: str(ctx.get(m.group(1), "")), text or "").replace("$$", "$")


def _pick_agency(text: str, rng):
    """Choose the agency identity that matches who the template's prose names,
    so the sender doesn't contradict the body."""
    t = text.lower()
    A = pools.AGENCIES

    def find(sub):
        for n, e in A:
            if sub in n.lower():
                return (n, e)
        return None

    rules = [
        (("idot", "mannheim", "state route", "illinois department"), "idot"),
        (("metra", "up-w", "train", "rail"), "metra"),
        (("school", "d209", "district 209", "student"), "school district"),
        (("library",), "library"),
        (("assessor", "property tax", "assessment", "township"), "assessor"),
        (("county clerk", "vital record"), "cook county clerk"),
        (("cook county", "county highway", "doth"), "transportation"),
        (("maywood", "mutual aid", "melrose", "broadview", "westchester"), "maywood"),
    ]
    for kws, sub in rules:
        if any(k in t for k in kws):
            hit = find(sub)
            if hit:
                return hit
    return rng.choice(A)


def _pick_year_month(rng, season: str):
    year = rng.choice([2024, 2025, 2025, 2026, 2026])
    if season in MONTHS:
        month = rng.choice(MONTHS[season])
    else:
        month = rng.randint(1, 12)
    return year, month


# ───────────────────────── template instantiation ───────────────────────────
def _instantiate(tmpl: dict, idx: int, rng) -> list[dict]:
    season = (tmpl.get("season") or "any").lower()
    year, month = _pick_year_month(rng, season)
    ctx = make_ctx(rng, year, month)
    cat = tmpl.get("category", "constituent")
    topic = tmpl.get("topic", "complaint")
    direction = tmpl.get("direction", "inbound")
    from_role = tmpl.get("from_role", "resident")
    from_staff = tmpl.get("from_staff_key") or ""
    to_role = tmpl.get("to_role", "mayor")
    to_staff = tmpl.get("to_staff_key") or ""

    # sender identity
    if from_role == "staff" and from_staff:
        from_key, from_name, from_email = from_staff, "", ""
    elif from_role == "external":
        ag_name, ag_email = _pick_agency(tmpl.get("body_tmpl", "") + " " + tmpl.get("subject_tmpl", ""), rng)
        from_key, from_name, from_email = "oneoff", ag_name, ag_email
    elif from_role == "business":
        from_key = "oneoff"
        from_name = ctx["NAME"]
        from_email = pools.email_for(ctx["_first"], ctx["_last"], rng,
                                     domain=pools.biz_slug(ctx["BIZ"]) + ".com")
    else:  # resident
        from_key = "oneoff"
        from_name = ctx["NAME"]
        from_email = pools.email_for(ctx["_first"], ctx["_last"], rng)

    to_key = to_staff if (to_role == "staff" and to_staff) else ("mayor" if to_role == "mayor" else None)
    if direction == "inbound" and not to_key:
        to_key = "mayor"

    tkey = f"syn-{cat}-{idx}"
    subject = fill(tmpl.get("subject_tmpl", ""), ctx)
    body = fill(tmpl.get("body_tmpl", ""), ctx)
    reply = (tmpl.get("reply_tmpl") or "").strip()

    main_open = "info" if topic == "thanks" else ("open" if reply else rng.choice(["open", "open", "resolved", "info"]))
    addr = ctx["ADDRESS"] if ("{ADDRESS}" in (tmpl.get("body_tmpl", "") + tmpl.get("subject_tmpl", ""))) else ""

    units = [_unit(
        source=f"syn_{cat}", scenario=f"syn_{cat}", thread_key=tkey, seq=1,
        from_key=from_key, from_name=from_name, from_email=from_email, to_key=to_key,
        direction=direction, topic=topic, season=season, year_hint=year, month_hint=month,
        subject=subject, body_clean=body, openness=main_open, address_hint=addr,
    )]

    if reply:
        if direction == "inbound":
            r_from = tmpl.get("reply_from_staff_key") or rng.choice(["mayor", "assistant"])
            r_dir, r_to = "outbound", None
            r_open = "resolved"
        else:
            r_from = to_staff or "pw_director"
            r_dir, r_to = "inbound", "mayor"
            r_open = "info"
        units.append(_unit(
            source=f"syn_{cat}", scenario=f"syn_{cat}", thread_key=tkey, seq=2,
            from_key=r_from, from_name="", from_email="", to_key=r_to,
            direction=r_dir, topic=topic, season=season, year_hint=year, month_hint=month,
            subject=subject, body_clean=fill(reply, ctx), openness=r_open, address_hint=addr,
        ))
    return units


def gen_templates(rng, total: int, banks_by_cat: dict[str, list]) -> list[dict]:
    """Instantiate templates to produce ~`total` constituent/interdept/business/civic units."""
    props = {"constituent": 0.535, "interdept": 0.244, "business": 0.128, "civic": 0.093}
    out: list[dict] = []
    gidx = 0
    for cat, prop in props.items():
        templates = banks_by_cat.get(cat, [])
        if not templates:
            continue
        target = round(total * prop)
        order = list(templates)
        rng.shuffle(order)
        i = 0
        while sum(1 for u in out if u["scenario"] == f"syn_{cat}") < target:
            t = order[i % len(order)]
            out.extend(_instantiate(t, gidx, rng))
            gidx += 1
            i += 1
            if i > target * 3 + 50:   # safety
                break
    return out


# ───────────────────────── daily reports ────────────────────────────────────
def _window_days() -> list[dt.date]:
    d, end = config.CORPUS_START, config.CORPUS_END
    days = []
    while d <= end:
        days.append(d)
        d += dt.timedelta(days=1)
    return days


def _report_dates(n: int, rng) -> list[dt.date]:
    base = _window_days()
    if n >= len(base):
        extra = [rng.choice(base) for _ in range(n - len(base))]
        return sorted(base + extra)
    step = len(base) / n
    return [base[int(i * step)] for i in range(n)]


_WATCH_NAMES = ["Sgt. M. Tolliver", "Sgt. R. Adamski", "Lt. D. Crawford", "Sgt. P. Mendez"]
_SHIFT_NAMES = ["B/C T. Sullivan", "B/C R. Ortega", "B/C K. Foster"]


def gen_police(rng, n: int, incidents: list[dict]) -> list[dict]:
    if not incidents:
        return []
    units, seqs = [], {}
    for ri, date in enumerate(_report_dates(n, rng)):
        k = rng.choice([3, 4, 4, 5, 5, 6, 6, 7, 8, 9])
        chosen = [rng.choice(incidents) for _ in range(k)]
        lines, arrests, stops, medical = [], 0, 0, 0
        for j, inc in enumerate(chosen, 1):
            seqs[date.year] = seqs.get(date.year, 0) + 1
            ctx = make_ctx(rng, date.year, date.month)
            ctx["TIME"] = pools.clock_time(rng, night=True)
            ctx["CASE"] = f"B{str(date.year)[2:]}-{seqs[date.year]:05d}"
            lines.append(f"{j}. {fill(inc.get('narrative',''), ctx)}")
            typ = inc.get("type", "")
            if "arrest" in typ or "dui" in typ or "warrant" in typ:
                arrests += 1
            if "traffic" in typ:
                stops += 1
            if "assist_fire" in typ or "ems" in typ:
                medical += 1
        wd = date.strftime("%A")
        ds = date.strftime("%B %d, %Y")
        body = (
            f"BELLWOOD POLICE DEPARTMENT\n"
            f"Overnight Incident Summary — {wd}, {ds}\n"
            f"Reporting period: previous day 1800 hrs to {date.strftime('%m/%d')} 0600 hrs\n"
            f"Watch Commander: {rng.choice(_WATCH_NAMES)}\n\n"
            f"Incidents ({k} calls for service):\n" + "\n".join(lines) +
            f"\n\nSummary: {k} calls for service; {arrests} arrest(s); {stops} traffic stop(s); "
            f"{medical} EMS assist(s). No officer injuries."
        )
        units.append(_unit(
            source="police", scenario="police",
            thread_key=f"pd-{date.isoformat()}-{ri}", seq=1, from_key="pd_watch",
            to_key="mayor", direction="inbound", topic="public_safety", season="any",
            year_hint=date.year, month_hint=date.month, day_hint=date.day, hour_hint=6,
            subject=f"Overnight Incident Summary — {ds}", body_clean=body,
            openness="info", cc_keys=rng.choice([["village_manager"], ["village_manager", "police_liaison"], []]),
        ))
    return units


def gen_fire(rng, n: int, incidents: list[dict]) -> list[dict]:
    if not incidents:
        return []
    units, seqs = [], {}
    for ri, date in enumerate(_report_dates(n, rng)):
        k = rng.choice([2, 3, 3, 4, 4, 5, 5, 6, 7])
        chosen = [rng.choice(incidents) for _ in range(k)]
        lines, ems, fire, alarm = [], 0, 0, 0
        for j, inc in enumerate(chosen, 1):
            seqs[date.year] = seqs.get(date.year, 0) + 1
            ctx = make_ctx(rng, date.year, date.month)
            ctx["TIME"] = pools.clock_time(rng, night=rng.random() < 0.5)
            ctx["CASE"] = f"F{str(date.year)[2:]}-{seqs[date.year]:05d}"
            ctx["DISPOSITION"] = rng.choice(pools.FIRE_DISPOSITIONS)
            lines.append(f"{j}. {fill(inc.get('narrative',''), ctx)}")
            typ = inc.get("type", "")
            if typ.startswith("ems") or "lift" in typ:
                ems += 1
            elif "fire" in typ:
                fire += 1
            elif "alarm" in typ:
                alarm += 1
        wd = date.strftime("%A")
        ds = date.strftime("%B %d, %Y")
        body = (
            f"BELLWOOD FIRE DEPARTMENT\n"
            f"Daily Run Report — {wd}, {ds}\n"
            f"Shift Commander: {rng.choice(_SHIFT_NAMES)} | Station 1\n\n"
            f"Runs ({k} total):\n" + "\n".join(lines) +
            f"\n\nTotals: {k} runs — {ems} EMS, {fire} fire, {alarm} alarm/other. "
            f"All units back in service."
        )
        units.append(_unit(
            source="fire", scenario="fire",
            thread_key=f"fd-{date.isoformat()}-{ri}", seq=1, from_key="fire_watch",
            to_key="mayor", direction="inbound", topic="fire_ems", season="any",
            year_hint=date.year, month_hint=date.month, day_hint=date.day, hour_hint=7,
            subject=f"Daily Run Report — {ds}", body_clean=body,
            openness="info", cc_keys=rng.choice([["village_manager"], []]),
        ))
    return units
