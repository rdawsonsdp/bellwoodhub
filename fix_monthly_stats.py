#!/usr/bin/env python3
"""
fix_monthly_stats.py — replace the buggy procedural monthly-statistics records.

The old fire "Monthly Fire/EMS Run Statistics" and police "CompStat" records were
instantiated from templates with HARD-CODED numbers (every month identical) and a
random {DATE} in the subject decoupled from date_sent (even future dates). This:
  1. deletes those records from the DB (CASCADE removes chunks + entities),
  2. generates one clean fire + one clean police monthly summary per month
     (2023-07 .. 2026-05), dated ~the 5th-11th of the FOLLOWING month, period
     label matching, with realistic per-month varied numbers,
  3. inserts + embeds + indexes them,
  4. mirrors the same change into corpus/seed_emails.json (remove + append).

Idempotent: clean records use message_id "<ms-...>" and upsert.
"""
from __future__ import annotations

import datetime as dt
import json
import random

import config
import db
from normalize import normalize_person

try:
    from openai import OpenAI
except Exception:  # noqa: BLE001
    OpenAI = None

NS = "ms-"
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
# Records whose subject matches any of these are the buggy ones to remove.
DELETE_PATTERNS = [
    "%Monthly Fire/EMS Run Statistic%", "Re: Monthly Fire/EMS Run Statistic%",
    "%CompStat%", "Re: %CompStat%", "%Monthly UCR%",
    "%Monthly Activity Summary — Police%",
]
MAYOR = "mayor@bellwood-demo.gov"


def _fire_body(rng: random.Random, mname: str, year: int) -> str:
    fires = rng.randint(4, 18)
    sf = rng.randint(0, min(4, fires))
    ems = rng.randint(185, 248)
    transports = rng.randint(int(ems * 0.55), int(ems * 0.8))
    haz = rng.randint(8, 30)
    svc = rng.randint(20, 60)
    gi = rng.randint(15, 45)
    fa = rng.randint(6, 28)
    rupt = rng.randint(0, 2)
    total = fires + ems + haz + svc + gi + fa + rupt
    rt = f"{rng.randint(4, 6)}.{rng.randint(0, 9)}"
    return (
        f"Mayor Okonkwo, here is the NFIRS run-statistics summary for {mname} {year}. "
        f"Total incidents: {total}. By NFIRS series — fires (100): {fires}, including "
        f"{sf} working structure fire(s); rupture/explosion (200): {rupt}; rescue & EMS "
        f"(300): {ems} ({transports} transports); hazardous condition (400): {haz}; "
        f"service call (500): {svc}; good intent (600): {gi}; false alarm / false call "
        f"(700): {fa}. Average response time {rt} minutes; no firefighter injuries this "
        f"period. Full NFIRS export attached for the board packet."
    )


def _police_body(rng: random.Random, mname: str, year: int) -> str:
    part1 = rng.randint(38, 110)
    pct = rng.randint(-18, 14)
    direction = "down" if pct < 0 else "up"
    violent = rng.randint(4, 20)
    prop = max(rng.randint(20, 60), part1 - violent)
    arrests = rng.randint(18, 70)
    cites = rng.randint(80, 240)
    crashes = rng.randint(14, 46)
    dui = rng.randint(0, 8)
    return (
        f"CompStat summary for {mname} {year}. Part I (index) crimes: {part1}, "
        f"{direction} {abs(pct)}% versus the prior month. Violent: {violent}; property: "
        f"{prop} (theft, burglary, and motor-vehicle theft lead). Custodial arrests: "
        f"{arrests}; traffic citations: {cites}; reportable crashes: {crashes}; DUI "
        f"arrests: {dui}. NIBRS submission to ISP confirmed for the period; CompStat "
        f"slides ready for the board."
    )


def generate() -> list[dict]:
    recs: list[dict] = []
    y, m = 2023, 7
    while (y, m) <= (2026, 5):
        mname = MONTHS[m - 1]
        sy, sm = (y + 1, 1) if m == 12 else (y, m + 1)  # sent the following month
        for who, key, name, email, topic, bodyfn, subj in [
            ("fire", "fire", "Chief Lillian Vasquez", "fdchief@bellwood-demo.gov", "fire_ems", _fire_body,
             f"Monthly Fire/EMS Run Statistics — {mname} {y} (NFIRS Summary for Board Packet)"),
            ("pol", "pol", "Chief Gerald Pruitt", "pdchief@bellwood-demo.gov", "public_safety", _police_body,
             f"Monthly CompStat — {mname} {y} Crime Statistics"),
        ]:
            rng = random.Random(y * 1000 + m * 10 + (1 if who == "fire" else 2))
            day = min(rng.randint(5, 11), 28)
            sent = dt.datetime(sy, sm, day, rng.randint(9, 11), rng.randint(0, 59))
            body = bodyfn(rng, mname, y)
            recs.append({
                "message_id": f"<{NS}{key}-{y}-{m:02d}@mail.bellwood-demo.gov>",
                "thread_id": f"{NS}{key}-{y}-{m:02d}",
                "direction": "inbound",
                "from_name": name,
                "from_email": email,
                "to_email": MAYOR,
                "cc": "",
                "subject": subj,
                "date_sent": sent.isoformat(),
                "body_raw": body,
                "body_clean": body,
                "topic": topic,
                "is_synthetic": True,
            })
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return recs


def main() -> None:
    conn = db.connect()
    cur = conn.cursor()

    deleted = 0
    for p in DELETE_PATTERNS:
        cur.execute("DELETE FROM poc.emails WHERE subject ILIKE %s", (p,))
        deleted += cur.rowcount
    conn.commit()
    print(f"Deleted {deleted} buggy monthly-stats records (CASCADE).")

    recs = generate()
    print(f"Generating {len(recs)} clean monthly records (2023-07 .. 2026-05) ...")

    for r in recs:
        cur.execute(
            """INSERT INTO poc.emails
               (message_id,thread_id,direction,from_name,from_email,to_email,cc,subject,date_sent,body_raw,body_clean,topic,is_synthetic)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true)
               ON CONFLICT (message_id) DO UPDATE SET
                 subject=EXCLUDED.subject, body_raw=EXCLUDED.body_raw, body_clean=EXCLUDED.body_clean,
                 date_sent=EXCLUDED.date_sent, topic=EXCLUDED.topic
               RETURNING id""",
            (r["message_id"], r["thread_id"], r["direction"], r["from_name"], r["from_email"],
             r["to_email"], r["cc"], r["subject"], r["date_sent"], r["body_raw"], r["body_clean"], r["topic"]),
        )
        r["_id"] = cur.fetchone()[0]
    conn.commit()

    client = OpenAI(api_key=config.require("OPENAI_API_KEY", config.OPENAI_API_KEY))
    resp = client.embeddings.create(model=config.EMBED_MODEL, input=[r["body_clean"] for r in recs])
    for r, item in zip(recs, resp.data):
        cur.execute(
            """INSERT INTO poc.email_chunks (email_id,chunk_index,chunk_text,token_count,embedding)
               VALUES (%s,0,%s,%s,%s)
               ON CONFLICT (email_id,chunk_index) DO UPDATE SET
                 chunk_text=EXCLUDED.chunk_text, embedding=EXCLUDED.embedding""",
            (r["_id"], r["body_clean"], len(r["body_clean"]) // 4, item.embedding),
        )
        cur.execute(
            """INSERT INTO poc.email_entities (email_id,entity_type,entity_value,entity_norm)
               VALUES (%s,'person',%s,%s) ON CONFLICT (email_id,entity_type,entity_norm) DO NOTHING""",
            (r["_id"], r["from_name"], normalize_person(r["from_name"])),
        )
    conn.commit()
    print(f"Inserted + embedded {len(recs)} clean monthly records.")

    # Mirror into the canonical seed (remove buggy monthly records, append clean).
    import re
    seed = json.loads(config.SEED_FILE.read_text())
    bad = re.compile(r"Monthly Fire/EMS Run Statistic|CompStat|Monthly UCR|Monthly Activity Summary — Police", re.I)
    kept = [e for e in seed if not bad.search(e.get("subject", ""))]
    clean = [{k: v for k, v in r.items() if not k.startswith("_")} for r in recs]
    config.SEED_FILE.write_text(json.dumps(kept + clean, indent=2, ensure_ascii=False))
    print(f"Seed: {len(seed)} -> {len(kept) + len(clean)} (removed {len(seed) - len(kept)} buggy, added {len(clean)}).")

    cur.execute("SELECT date_sent::date, subject FROM poc.emails WHERE message_id LIKE %s ORDER BY date_sent DESC LIMIT 3", (f"<{NS}%",))
    print("Newest clean monthly records:")
    for d, s in cur.fetchall():
        print("   ", d, "-", s[:64])
    conn.close()


if __name__ == "__main__":
    main()
