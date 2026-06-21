#!/usr/bin/env python3
"""
generate_addl.py — APPEND ~10,000 citizen-weighted emails to the corpus.

The user asked to grow the dataset with more constituent ("email requests from
citizens") mail, plus a new hero: Mrs. Eleanor Meyer's ongoing basement-flooding
problem at 1733 Frederick Ave.

This reuses the existing assembler (generate_corpus.assemble) and procedural
synth so the new mail is stylistically identical to the base corpus. Every new
message_id / thread_id is namespaced "a2-" so it can NEVER collide with the
existing 10k. Output:
  * corpus/seed_addl.json   — the new batch on its own (record of what was added)
  * corpus/seed_emails.json — base + addl appended (canonical, now ~20k)

Deterministic given ADDL_SEED. No API calls here — embedding happens in
load_embed.py, entity extraction in extract_entities.py.
"""
from __future__ import annotations

import json
import random
from collections import Counter, defaultdict

import config
import generate_corpus as gc
import synth
from corpus import personas

ADDL_SEED = 20260621      # distinct from config.RANDOM_SEED so procedural content differs
ADDL_TARGET = 10_000      # new emails to add
NS = "a2-"                # message_id / thread_id namespace for the new batch
CITIZEN_REQUESTS = 8_500  # standalone citizen requests (most of the batch)
REPLY_PROB = 0.18         # fraction of citizen requests that also get a village reply
INTERDEPT_UNITS = 700     # supporting interdepartmental mail


# ─────────────────────── Mrs. Meyer basement-flooding saga ───────────────────
def meyer_saga() -> list[dict]:
    """A 5-thread hero arc (Sep 2025 → Jun 2026) at 1733 Frederick Ave, ending in
    a recent unresolved status request — mirroring the Bohland Ave saga."""
    A = "1733 Frederick Ave"
    U: list[dict] = []

    def add(thread, seq, frm, direction, topic, y, m, subject, body,
            to=None, openness="open", cc=None):
        U.append(synth._unit(
            source="hero_meyer", scenario="hero", thread_key=f"meyer-{thread}", seq=seq,
            from_key=frm, to_key=to, direction=direction, topic=topic,
            year_hint=y, month_hint=m, subject=subject, body_clean=body,
            openness=openness, address_hint=A, cc_keys=cc or [],
        ))

    # Thread 1 — Sep 2025: first report + Public Works acknowledgement
    add("intro", 1, "meyer", "inbound", "drainage", 2025, 9,
        "Basement flooding at 1733 Frederick Ave after Saturday's storm",
        "Dear Mayor Okonkwo,\n\nI am writing about my home at 1733 Frederick Ave. "
        "During Saturday night's storm we took on about four inches of water in the "
        "basement — the most we have ever had. My sump pump ran the whole night and "
        "still could not keep up. The water came in along the back foundation wall, "
        "not up through the floor drain, which makes me think it is coming from "
        "outside.\n\nI have lived here twenty-two years and never had this until the "
        "last couple of seasons. Could someone look at the storm drain and the catch "
        "basin on our block? I am worried about the foundation. Thank you.")
    add("intro", 2, "pw_director", "outbound", "drainage", 2025, 9,
        "Re: Basement flooding at 1733 Frederick Ave after Saturday's storm",
        "Mrs. Meyer,\n\nThank you for the detail — water along the wall rather than "
        "the floor drain is helpful to know. I've asked a crew to check the catch "
        "basin at Frederick and 18th and to camera the line on your block. If they "
        "find it silted we'll get the vactor truck out. I'll follow up once they "
        "report back.", to="meyer", openness="resolved")

    # Thread 2 — Nov 2025: it happened again; inspection scheduled
    add("again", 1, "meyer", "inbound", "drainage", 2025, 11,
        "It flooded again — 1733 Frederick Ave",
        "Dear Mayor and Mr. DiMeo,\n\nI'm sorry to write again so soon. It rained "
        "hard Tuesday and we had about two inches in the basement, same back wall. "
        "I have started keeping a log: Sep 13 (4 in.), Oct 2 (trace), Nov 18 (2 in.). "
        "The pump is from 2014 and I don't trust it through another winter.\n\nWas the "
        "catch basin ever cleaned? I never heard back. I'd be grateful for an update.")
    add("again", 2, "pw_director", "outbound", "drainage", 2025, 11,
        "Re: It flooded again — 1733 Frederick Ave",
        "Mrs. Meyer — my apologies for the gap. The basin was cleared in October but "
        "your log tells me that didn't solve it. I'm scheduling our engineer, Tom "
        "Reyes, to look at grading and the downspout outfalls behind your block; this "
        "looks like surface water, not just the sewer. Tom will reach out to set a "
        "time.", to="meyer", openness="open", cc=["engineer"])

    # Thread 3 — Feb 2026: sump pump fails during thaw; engineer's findings
    add("thaw", 1, "meyer", "inbound", "drainage", 2026, 2,
        "Sump pump failed during the thaw — basement flooded again",
        "Dear Mr. Reyes and Mayor Okonkwo,\n\nDuring last week's thaw and rain the "
        "sump pump finally gave out and we had nearly five inches. A neighbor helped "
        "me bail. I've had a plumber install a new pump with a battery backup at my "
        "own expense ($1,240), but I don't think a pump alone fixes this. The yard "
        "behind us slopes toward my foundation and the water just sits there.\n\nWhat "
        "did the grading inspection find? Please advise — I'm losing sleep over the "
        "foundation.")
    add("thaw", 2, "engineer", "outbound", "drainage", 2026, 2,
        "Re: Sump pump failed during the thaw — basement flooded again",
        "Mrs. Meyer,\n\nI'm sorry — that's exactly the pattern I saw. My inspection "
        "found the rear-yard grade pitched toward your house and two downspouts on "
        "the adjacent property discharging straight at your lot line. The public "
        "storm sewer has capacity; this is surface drainage. The durable fix is "
        "regrading a shallow swale and possibly a French drain along the rear "
        "foundation. I'm getting a contractor estimate so we can discuss options and "
        "any cost-share.", to="meyer", openness="open", cc=["pw_director"])

    # Thread 4 — Apr 2026: contractor quote + cost-share discussion
    add("quote", 1, "contractor", "inbound", "drainage", 2026, 4,
        "Estimate — rear-yard regrade & French drain, 1733 Frederick Ave",
        "Engineering Dept.,\n\nPer your request, our estimate for 1733 Frederick Ave: "
        "regrade the rear yard to a shallow swale, install 60 ft of French drain "
        "along the rear foundation with a daylight outfall, and reset two downspout "
        "extensions. Materials and labor: $6,480. We can schedule within three weeks "
        "of approval.", to="engineer")
    add("quote", 2, "meyer", "inbound", "drainage", 2026, 4,
        "Following up on the drainage fix at 1733 Frederick Ave",
        "Dear Mr. Reyes,\n\nThank you for sending the estimate over. Six thousand is "
        "a lot for me on a fixed income. Is there any village cost-share for a "
        "drainage problem that's partly coming off the property behind me? I want to "
        "do this right before another summer of storms. Please let me know the next "
        "step and the timeline.", to="engineer", openness="open")
    add("quote", 3, "mayor", "outbound", "drainage", 2026, 4,
        "Re: Following up on the drainage fix at 1733 Frederick Ave",
        "Mrs. Meyer,\n\nThank you for your patience through all of this — you've "
        "documented it better than we have. I've asked Finance and Public Works to "
        "look at whether this qualifies for the residential drainage cost-share and "
        "to confirm responsibility for the neighboring downspouts. We'll come back to "
        "you with a concrete plan and timeline.", to="meyer", openness="open",
        cc=["finance_director", "pw_director"])

    # Thread 5 — Jun 2026: latest, still unresolved
    add("status", 1, "meyer", "inbound", "drainage", 2026, 6,
        "Still waiting on the drainage fix — 1733 Frederick Ave",
        "Dear Mayor Okonkwo,\n\nIt's been two months since we discussed the cost-"
        "share and the regrading, and storm season is here. We had water again last "
        "weekend — the new pump kept up this time, but the yard is still pitched "
        "wrong and the French drain hasn't been done. My log is now up to eleven "
        "flooding events since last September.\n\nCould you tell me where the "
        "cost-share decision stands and when the work might be scheduled? I don't "
        "want to start another winter like the last one.", openness="open")
    return U


# ───────────────────────────── bulk citizen mail ────────────────────────────
def bulk_units(rng: random.Random, tmpls: dict) -> list[dict]:
    """Mostly standalone citizen requests, a minority with a village reply, plus a
    little interdepartmental mail — so the batch reads as constituent-dominated."""
    out: list[dict] = []
    gidx = 500_000  # high base; NS prefix already guarantees global uniqueness

    # Citizen requests (drop the auto-generated reply for most of them).
    consti = tmpls.get("constituent", [])
    order = list(consti)
    rng.shuffle(order)
    i = made = 0
    while made < CITIZEN_REQUESTS and consti:
        us = synth._instantiate(order[i % len(order)], gidx, rng)
        keep = us[:1]  # the citizen request
        if len(us) > 1 and rng.random() < REPLY_PROB:
            keep.append(us[1])  # occasional village reply
        out.extend(keep)
        made += 1
        gidx += 1
        i += 1
        if i > CITIZEN_REQUESTS * 3 + 100:
            break

    # A little interdepartmental supporting mail.
    inter = tmpls.get("interdept", [])
    order = list(inter)
    rng.shuffle(order)
    i = made = 0
    while made < INTERDEPT_UNITS and inter:
        us = synth._instantiate(order[i % len(order)], gidx, rng)
        out.extend(us)
        made += len(us)
        gidx += 1
        i += 1
        if i > INTERDEPT_UNITS * 3 + 100:
            break
    return out


def namespace(emails: list[dict]) -> None:
    for e in emails:
        e["message_id"] = e["message_id"].replace("<", "<" + NS, 1)
        e["thread_id"] = NS + e["thread_id"]


def trim_to(emails: list[dict], target: int, rng: random.Random) -> list[dict]:
    """Trim to exactly `target`, protecting authored hero threads, at whole-thread
    granularity (mirrors generate_corpus.enforce_size)."""
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
    if len(chosen) < target:
        for i, t in enumerate(threads):
            if i in used or len(t) != 1:
                continue
            chosen.append(t[0])
            if len(chosen) >= target:
                break
    return sorted(chosen, key=lambda r: r["date_sent"])[:target]


def main() -> None:
    rng = random.Random(ADDL_SEED)
    _, _, tmpls = gc.load_banks()
    print(f"Template banks: {{ {', '.join(f'{k}:{len(v)}' for k, v in tmpls.items())} }}")

    units = meyer_saga() + bulk_units(rng, tmpls)
    print(f"Built {len(units)} units (incl. Mrs. Meyer saga). Assembling ...")
    emails = gc.assemble(units, rng)
    namespace(emails)
    emails = trim_to(emails, ADDL_TARGET, rng)
    print(f"Assembled + trimmed to {len(emails)} new emails.")

    # Idempotent: drop any prior a2- batch so re-running REPLACES it (not stacks).
    existing = json.loads(config.SEED_FILE.read_text())
    base = [e for e in existing if not e["message_id"].startswith("<" + NS)]
    have = {e["message_id"] for e in base}
    clash = [e["message_id"] for e in emails if e["message_id"] in have]
    if clash:
        raise SystemExit(f"ABORT: {len(clash)} message_id collisions with base seed, e.g. {clash[:3]}")
    print(f"Collision check OK (base={len(base)}, prior_addl={len(existing) - len(base)}, "
          f"new={len(emails)}, overlap=0).")

    # Write the addl batch on its own + rewrite the canonical seed as base + addl.
    addl_file = config.CORPUS_DIR / "seed_addl.json"
    addl_file.write_text(json.dumps(emails, indent=2, ensure_ascii=False))
    combined = base + emails
    config.SEED_FILE.write_text(json.dumps(combined, indent=2, ensure_ascii=False))
    print(f"Wrote {len(emails)} -> {addl_file.name}; canonical seed now {len(combined)}.")

    # Report on the new batch.
    print("\n" + "=" * 60)
    print(f"  NEW BATCH: {len(emails)} emails")
    print("=" * 60)
    print("  direction :", dict(Counter(e["direction"] for e in emails)))
    print("  topics    :")
    for t, c in Counter(e["topic"] for e in emails).most_common():
        print(f"      {t:18s} {c}")
    consti = Counter(e["from_email"] for e in emails
                     if e["direction"] == "inbound" and not e["from_email"].endswith("demo.gov"))
    print(f"  citizen inbound senders: {sum(consti.values())} emails from {len(consti)} addresses")
    meyer = personas.get("meyer")["email"]
    print(f"  Mrs. Meyer emails: {sum(1 for e in emails if e['from_email'] == meyer)}")
    blob = " ".join(e['subject'] + ' ' + e['body_raw'] for e in emails)
    print(f"  '1733 Frederick' mentions: {blob.count('1733 Frederick')}")


if __name__ == "__main__":
    main()
