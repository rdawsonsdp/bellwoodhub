"""
The recurring cast for the Bellwood Mayor's Office corpus.

Authoritative registry: persona key -> identity, voice, signature. The corpus
assembler (generate_corpus.py) resolves names/emails/signatures from here so a
given person is always consistent. The authoring agents are given the same keys
and voices so the prose they write matches these identities.

All people are invented. Geography (streets, the Village, IDOT/Cook County,
Taste of Bellwood) is real Bellwood, IL. Staff use @bellwood-demo.gov; residents
use varied free-mail domains. Phone numbers use the 708 area code with the
555-01xx range reserved for fiction.
"""
from __future__ import annotations

# Standard footer the Village appends to official mail — the cleaner must strip
# this. Kept verbatim so body_raw is realistically noisy.
DISCLAIMER = (
    "CONFIDENTIALITY NOTICE: This message and any attachments are intended only "
    "for the addressee and may contain information that is privileged or subject "
    "to the Illinois Freedom of Information Act. If you are not the intended "
    "recipient, please notify the sender and delete this message. Views expressed "
    "are those of the sender. — Village of Bellwood, 3200 Washington Blvd, "
    "Bellwood, IL 60104"
)

# key -> persona record
PERSONAS = {
    # ── The Mayor (inbox owner) ───────────────────────────────────────────
    "mayor": {
        "name": "Mayor Daniel R. Okonkwo",
        "email": "mayor@bellwood-demo.gov",
        "role": "mayor",
        "voice": "Warm but busy; thanks people, sets expectations, routes to the "
                 "right department, follows up personally on the ones that matter.",
        "signature": "Daniel\n\nDaniel R. Okonkwo\nMayor, Village of Bellwood\n"
                     "(708) 555-0100 | mayor@bellwood-demo.gov",
        "disclaimer": True,
    },
    "assistant": {
        "name": "Tina Alvarez",
        "email": "talvarez@bellwood-demo.gov",
        "role": "staff",
        "voice": "Mayor's office coordinator. Polished, logistical, schedules "
                 "meetings and forwards items to departments on the Mayor's behalf.",
        "signature": "Tina Alvarez\nOffice of the Mayor, Village of Bellwood\n"
                     "(708) 555-0101",
        "disclaimer": True,
    },

    # ── Department staff ──────────────────────────────────────────────────
    "pw_director": {
        "name": "Frank DiMeo",
        "email": "fdimeo@bellwood-demo.gov",
        "role": "staff",
        "voice": "Public Works Director. Practical, specific about crews, culverts, "
                 "grading, catch basins and timelines. A little blunt.",
        "signature": "Frank DiMeo\nDirector of Public Works\nVillage of Bellwood\n"
                     "(708) 555-0110",
        "disclaimer": True,
    },
    "code_officer": {
        "name": "Sandra Pulaski",
        "email": "spulaski@bellwood-demo.gov",
        "role": "staff",
        "voice": "Code Enforcement Officer. Procedural and careful; cites ordinance "
                 "numbers, inspection dates, notices and compliance windows.",
        "signature": "Sandra Pulaski\nCode Enforcement Officer\nVillage of Bellwood\n"
                     "(708) 555-0112",
        "disclaimer": True,
    },
    "water_clerk": {
        "name": "Lorena Diaz",
        "email": "ldiaz@bellwood-demo.gov",
        "role": "staff",
        "voice": "Water Billing clerk. Helpful and exact about meter reads, billing "
                 "cycles, adjustments and account numbers.",
        "signature": "Lorena Diaz\nWater Billing, Finance Dept.\nVillage of Bellwood\n"
                     "(708) 555-0114",
        "disclaimer": True,
    },
    "parks_coord": {
        "name": "Kevin O'Brien",
        "email": "kobrien@bellwood-demo.gov",
        "role": "staff",
        "voice": "Parks & Events Coordinator. Upbeat; talks vendors, permits, road "
                 "closures and volunteers for Taste of Bellwood and park programming.",
        "signature": "Kevin O'Brien\nParks & Events Coordinator\nVillage of Bellwood\n"
                     "(708) 555-0118",
        "disclaimer": True,
    },
    "police_liaison": {
        "name": "Officer Reggie Banks",
        "email": "rbanks@bellwood-demo.gov",
        "role": "staff",
        "voice": "Police community liaison. Measured; references patrol checks, "
                 "noise ordinance, business operating hours and warnings issued.",
        "signature": "Ofc. Reggie Banks\nCommunity Liaison, Bellwood Police Dept.\n"
                     "(708) 555-0120",
        "disclaimer": True,
    },
    "village_manager": {
        "name": "Karen Whitfield",
        "email": "kwhitfield@bellwood-demo.gov",
        "role": "staff",
        "voice": "Village Manager. Runs operations; routes between departments, "
                 "tracks budgets, board agendas, capital projects; crisp and managerial.",
        "signature": "Karen Whitfield\nVillage Manager\nVillage of Bellwood\n(708) 555-0102",
        "disclaimer": True,
    },
    "clerk": {
        "name": "Yolanda Pierce",
        "email": "ypierce@bellwood-demo.gov",
        "role": "staff",
        "voice": "Village Clerk. FOIA responses, board minutes, agendas, licensing "
                 "records; precise, cites deadlines and statutes.",
        "signature": "Yolanda Pierce\nVillage Clerk\nVillage of Bellwood\n(708) 555-0104",
        "disclaimer": True,
    },
    "finance_director": {
        "name": "David Okafor",
        "email": "dokafor@bellwood-demo.gov",
        "role": "staff",
        "voice": "Finance Director. Budgets, levies, audits, purchase orders, water "
                 "fund; numbers-forward and careful.",
        "signature": "David Okafor\nDirector of Finance\nVillage of Bellwood\n(708) 555-0106",
        "disclaimer": True,
    },
    "building_official": {
        "name": "Rosa Marchetti",
        "email": "rmarchetti@bellwood-demo.gov",
        "role": "staff",
        "voice": "Building Official. Permits, inspections, certificates of occupancy, "
                 "contractor licensing; cites code sections and inspection results.",
        "signature": "Rosa Marchetti\nBuilding Official\nVillage of Bellwood\n(708) 555-0116",
        "disclaimer": True,
    },
    "engineer": {
        "name": "Tom Reyes",
        "email": "treyes@bellwood-demo.gov",
        "role": "staff",
        "voice": "Village Engineer. Stormwater, roadway design, capital projects, "
                 "grant-funded improvements; technical and grant-aware.",
        "signature": "Tom Reyes, P.E.\nVillage Engineer\nVillage of Bellwood\n(708) 555-0117",
        "disclaimer": True,
    },
    "health_officer": {
        "name": "Priya Nair",
        "email": "pnair@bellwood-demo.gov",
        "role": "staff",
        "voice": "Health & Sanitation Officer. Food service, rodents, nuisance "
                 "abatement, public-health complaints; procedural.",
        "signature": "Priya Nair\nHealth & Sanitation Officer\nVillage of Bellwood\n(708) 555-0119",
        "disclaimer": True,
    },
    # ── Daily-report senders (the report streams) ─────────────────────────
    "pd_watch": {
        "name": "Bellwood PD — Watch Commander",
        "email": "watchcommander@bellwood-demo.gov",
        "role": "staff",
        "voice": "Police watch commander filing the overnight incident summary: "
                 "terse, factual, blotter style — times, blocks, case numbers, dispositions.",
        "signature": "Watch Commander\nBellwood Police Department\nRecords & Communications\n(708) 555-0125",
        "disclaimer": True,
    },
    "fire_watch": {
        "name": "Bellwood Fire Dept. — Shift Commander",
        "email": "shiftreport@bellwood-demo.gov",
        "role": "staff",
        "voice": "Fire shift commander filing the daily run report: runs by type "
                 "(EMS, fire, alarm, hazmat, MVA), times, addresses, units, outcomes.",
        "signature": "Shift Commander\nBellwood Fire Department\nStation 1\n(708) 555-0130",
        "disclaimer": True,
    },

    # ── Recurring residents ───────────────────────────────────────────────
    "gloria": {  # HERO #2 — the repeat constituent
        "name": "Gloria Bennett",
        "email": "gloria.bennett7@gmail.com",
        "role": "resident",
        "address": "1042 25th Ave",
        "voice": "Retired schoolteacher, 70s. Polite, precise, persistent. Writes in "
                 "full paragraphs, dates everything, references prior emails, signs "
                 "warmly. Grateful when things get fixed and says so.",
        "signature": "Warm regards,\nGloria Bennett\n1042 25th Ave, Bellwood\n"
                     "(708) 555-0151",
        "disclaimer": False,
    },
    "webb": {  # HERO #1 — the property saga
        "name": "Marcus Webb",
        "email": "mwebb.home@yahoo.com",
        "role": "resident",
        "address": "2218 Bohland Ave",
        "voice": "Homeowner, late 40s, works in the trades so he knows construction "
                 "and grading. Starts reasonable, gets frustrated as the flooding "
                 "drags on, ends appreciative once resolved. Concrete and detailed.",
        "signature": "Marcus Webb\n2218 Bohland Ave\n(708) 555-0143",
        "disclaimer": False,
    },
    "pawlak": {  # complainant in HERO #3
        "name": "Diane Pawlak",
        "email": "dpawlak.bw@comcast.net",
        "role": "resident",
        "address": "511 St. Charles Rd",
        "voice": "Lives above the St. Charles Rd strip. Tired and specific about "
                 "late-night noise, times, dates, which bar. Civil but fed up.",
        "signature": "Diane Pawlak\n511 St. Charles Rd, Apt 2",
        "disclaimer": False,
    },
    "coleman": {
        "name": "Patrice Coleman",
        "email": "patrice.coleman@gmail.com",
        "role": "resident",
        "address": "320 Eastern Ave",
        "voice": "Young parent, friendly and community-minded. Cares about parks, "
                 "events, sidewalks, recycling. Volunteers. Upbeat tone.",
        "signature": "Patrice Coleman\n320 Eastern Ave",
        "disclaimer": False,
    },
    "kowalski": {
        "name": "Henryk Kowalski",
        "email": "hkowalski@att.net",
        "role": "resident",
        "address": "1815 Marshall Ave",
        "voice": "Older resident, terse and a bit grumpy. Short sentences. Snow "
                 "plowing, potholes, water bills. Not rude, just blunt.",
        "signature": "H. Kowalski\n1815 Marshall Ave",
        "disclaimer": False,
    },
    "carter": {
        "name": "Denise Carter",
        "email": "denise.carter.bw@outlook.com",
        "role": "resident",
        "address": "47 Geneva Ave",
        "voice": "Civic watchdog. Formal, references meetings, budgets, ordinances; "
                 "files FOIA requests; expects timely, documented answers.",
        "signature": "Denise Carter\n47 Geneva Ave, Bellwood",
        "disclaimer": False,
    },
    "delgado": {  # high-frequency resident (powers 'who emails me the most')
        "name": "Ray Delgado",
        "email": "raydelgado87@gmail.com",
        "role": "resident",
        "address": "2401 Rice Ave",
        "voice": "Casual, texts more than writes. Lowercase, short, frequent. "
                 "Potholes, missed garbage pickup, parking, a downed branch. "
                 "Good-natured, a regular.",
        "signature": "ray",
        "disclaimer": False,
    },
    "meyer": {  # HERO #4 — the basement-flooding saga (2025 expansion)
        "name": "Eleanor Meyer",
        "email": "eleanor.meyer@comcast.net",
        "role": "resident",
        "address": "1733 Frederick Ave",
        "voice": "Retired bookkeeper in her 60s. Meticulous: keeps a log of every "
                 "storm, the water depth in the basement, and what the sump pump "
                 "did. Polite but increasingly worried about foundation damage and "
                 "her aging pump. Dates everything and references prior emails.",
        "signature": "Eleanor Meyer\n1733 Frederick Ave, Bellwood\n(708) 555-0188",
        "disclaimer": False,
    },

    # ── Businesses (St. Charles Rd strip drives HERO #3) ──────────────────
    "route64": {
        "name": "Nick Brennan",
        "email": "nick@route64sportsbar.com",
        "role": "business",
        "business": "Route 64 Sports Bar",
        "address": "540 St. Charles Rd",
        "voice": "Bar owner. Defensive at first, then cooperative; cares about his "
                 "license and being a good neighbor. Talks patios, last call, sound.",
        "signature": "Nick Brennan\nRoute 64 Sports Bar\n540 St. Charles Rd\n"
                     "(708) 555-0160",
        "disclaimer": False,
    },
    "elfaro": {
        "name": "Marisol Vega",
        "email": "marisol@elfarocantina.com",
        "role": "business",
        "business": "El Faro Cantina",
        "address": "612 St. Charles Rd",
        "voice": "Restaurant owner. Proud of her place, accommodating about live-music "
                 "hours once asked; community-oriented.",
        "signature": "Marisol Vega\nEl Faro Cantina\n612 St. Charles Rd\n"
                     "(708) 555-0163",
        "disclaimer": False,
    },
    "hideout": {
        "name": "Carl Jansen",
        "email": "carl@hideoutlounge.com",
        "role": "business",
        "business": "The Hideout Lounge",
        "address": "624 St. Charles Rd",
        "voice": "Lounge owner. Initially dismissive of complaints, comes around "
                 "after a warning; pragmatic.",
        "signature": "Carl Jansen\nThe Hideout Lounge\n624 St. Charles Rd",
        "disclaimer": False,
    },

    # ── External agencies / vendors ───────────────────────────────────────
    "idot": {
        "name": "IDOT District 1 — Constituent Services",
        "email": "d1.constituent@illinois-demo.gov",
        "role": "external",
        "voice": "State DOT. Bureaucratic, jurisdictional; Mannheim Rd (IL-171) is a "
                 "state route, so they own paving/signals there, not the Village.",
        "signature": "Constituent Services\nIllinois Department of Transportation, "
                     "District 1",
        "disclaimer": False,
    },
    "county": {
        "name": "Cook County Dept. of Transportation & Highways",
        "email": "dth.info@cookcounty-demo.gov",
        "role": "external",
        "voice": "County highway dept. Formal, slow, refers items between "
                 "jurisdictions.",
        "signature": "Cook County DOTH",
        "disclaimer": False,
    },
    "contractor": {
        "name": "Verdi Excavating & Drainage",
        "email": "estimating@verdiexcavating.com",
        "role": "external",
        "voice": "Drainage contractor that quotes the Bohland Ave work. Specific "
                 "about scope, regrading, French drains, dollar figures and timelines.",
        "signature": "Estimating Dept.\nVerdi Excavating & Drainage\n"
                     "(708) 555-0177",
        "disclaimer": False,
    },
}


def get(key: str) -> dict:
    return PERSONAS[key]


def known(key: str) -> bool:
    return key in PERSONAS
