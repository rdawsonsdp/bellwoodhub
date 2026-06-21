"""
Procedural value pools for slot-filling templates and assembling daily reports.
Deterministic given a passed-in random.Random. Real Bellwood streets; invented,
demographically varied people and businesses.
"""
from __future__ import annotations

STREETS = [
    "Mannheim Rd", "St. Charles Rd", "Washington Blvd", "Bohland Ave", "Eastern Ave",
    "Marshall Ave", "Geneva Ave", "Rice Ave", "Bellwood Ave", "Frederick Ave",
    "Granville Ave", "Hirsch Ave", "Harvard Ave", "Morris Ave", "Englewood Ave",
    "St. Paul Ave", "Monroe St", "Madison St", "Adams St", "Jackson St",
    "Van Buren St", "Lexington St", "Wilcox St", "Gunderson Ave", "Linden Ave",
    "Walnut Ave", "Maple Ave", "Park Ave", "Oak St", "Cedar Ave",
    "19th Ave", "20th Ave", "22nd Ave", "24th Ave", "25th Ave", "26th Ave",
    "36th Ave", "44th Ave", "45th Ave", "48th Ave", "50th Ave", "51st Ave",
]

# NOTE: deliberately excludes every recurring-cast first AND last name so that a
# procedurally generated one-off never collides with a hero (no fake "Gloria X"
# or "X Bennett" diluting person-specific retrieval).
FIRST_NAMES = [
    "Aaliyah", "Adam", "Alejandro", "Alicia", "Allen", "Amara", "Angela", "Aniya",
    "Antoine", "Beatriz", "Bridget", "Bruno", "Camille", "Cedric", "Cesar", "Charlene",
    "Damon", "Darnell", "Deborah", "Dominic", "Dwayne", "Elena", "Eric", "Estela",
    "Eugene", "Fatima", "Felix", "Gabriela", "Gerald", "Grace", "Gregory", "Halina",
    "Hector", "Imani", "Isabel", "Jamal", "James", "Jasmine", "Javier", "Jerome",
    "Joanna", "Jorge", "Joyce", "Keisha", "Kwame", "Lamont", "Latoya", "Leonard",
    "Lucia", "Maria", "Marisela", "Maurice", "Melissa", "Miguel", "Monica", "Nadia",
    "Nathan", "Olivia", "Omar", "Pedro", "Rachel", "Rashad", "Regina", "Renata",
    "Roland", "Rosalind", "Sofia", "Stephanie", "Tamika", "Tanya", "Terrence", "Tomasz",
    "Tyrone", "Vincent", "Walter", "Wanda", "Yvonne", "Zoe",
]

LAST_NAMES = [
    "Abara", "Acosta", "Adeyemi", "Andrews", "Baker", "Barnes", "Bell", "Brooks",
    "Bryant", "Caldwell", "Castillo", "Chavez", "Cisneros", "Clark", "Cole", "Dabrowski",
    "Davis", "Dixon", "Dominguez", "Dudek", "Edwards", "Ellis", "Ferguson", "Fields",
    "Flores", "Franklin", "Freeman", "Garcia", "Gibson", "Gonzalez", "Grant", "Greene",
    "Griffin", "Gutierrez", "Harris", "Hayes", "Hernandez", "Howard", "Hughes", "Jackson",
    "Jacobs", "Jenkins", "Johnson", "Jones", "Jordan", "Kaminski", "Lewis", "Lis",
    "Lopez", "Maldonado", "Marshall", "Martinez", "Mathews", "McKenzie", "Medina",
    "Mitchell", "Morales", "Moore", "Murphy", "Nguyen", "Nowak", "Oduya", "Owens",
    "Parker", "Patel", "Perez", "Powell", "Ramirez", "Reed", "Reynolds", "Rivera",
    "Robinson", "Rojas", "Salazar", "Sanders", "Santos", "Scott", "Shah", "Simmons",
    "Singh", "Stewart", "Szymanski", "Taylor", "Thomas", "Torres", "Vargas", "Walker",
    "Washington", "White", "Williams", "Wilson", "Wojcik", "Wright", "Young", "Zielinski",
]

EMAIL_DOMAINS = [
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "comcast.net",
    "att.net", "sbcglobal.net", "aol.com", "icloud.com",
]

BIZ_TRADES = [
    "Auto Repair", "Landscaping", "Bakery", "Dental", "Plumbing", "Roofing",
    "Hardware", "Cleaners", "Tax Service", "Daycare", "Salon", "Pizzeria",
    "Towing", "Properties", "Construction", "Catering", "Pharmacy", "Market",
    "Barber Shop", "Auto Body", "Tire Center", "Flooring", "Heating & Cooling",
    "Liquors", "Grill",
]

# Regional / intergovernmental agency senders (for civic/external mail).
AGENCIES = [
    ("IDOT District 1 — Constituent Services", "d1.constituent@illinois-demo.gov"),
    ("Cook County Dept. of Transportation & Highways", "doth@cookcounty-demo.gov"),
    ("Metra — UP-W Community Relations", "community@metra-demo.gov"),
    ("Proviso Township School District 209", "info@d209-demo.gov"),
    ("Bellwood Public Library", "director@bellwoodlibrary-demo.gov"),
    ("Proviso Township Assessor", "assessor@provisotownship-demo.gov"),
    ("Cook County Clerk", "records@cookcountyclerk-demo.gov"),
    ("Village of Maywood — Mutual Aid", "manager@maywood-demo.gov"),
]

DEPTS = [
    "Public Works", "Water Billing", "Code Enforcement", "the Building Department",
    "Parks & Recreation", "the Clerk's office", "Finance", "the Health Department",
    "the Police Department", "the Fire Department", "Engineering",
]

POLICE_DISPOSITIONS = [
    "report taken", "warning issued", "citation issued", "subject taken into custody",
    "gone on arrival", "peace restored", "subject transported", "unfounded",
    "referred to detectives", "vehicle towed", "field interview completed",
    "property recovered", "advised civil matter", "no police service required",
    "subject arrested and processed", "case cleared by arrest",
]

FIRE_UNITS = [
    "Engine 1", "Engine 2", "Truck 1", "Ambulance 1", "Ambulance 2",
    "Squad 1", "Battalion 1", "Engine 1 and Ambulance 1", "Truck 1 and Engine 2",
]

FIRE_DISPOSITIONS = [
    "patient treated and transported to Loyola", "patient transported to Westlake",
    "patient refused transport (RMA)", "fire extinguished, no extension",
    "investigated, no hazard found", "system reset, premises ventilated",
    "area secured pending utility", "assisted EMS", "false alarm, reset",
    "mutual aid provided", "scene turned over to Public Works",
    "basement pumped, advised on sump", "patient in cardiac arrest, CPR in progress",
]

HOSPITALS = ["Loyola University Medical Center", "Westlake Hospital", "Gottlieb Memorial"]


def person(rng):
    f = rng.choice(FIRST_NAMES)
    l = rng.choice(LAST_NAMES)
    return f, l


def email_for(first, last, rng, domain=None):
    dom = domain or rng.choice(EMAIL_DOMAINS)
    sep = rng.choice([".", "_", ""])
    num = rng.choice(["", "", str(rng.randint(1, 99)), str(rng.randint(60, 99))])
    return f"{first.lower()}{sep}{last.lower()}{num}@{dom}"


def biz_name(rng):
    style = rng.random()
    if style < 0.5:
        return f"{rng.choice(LAST_NAMES)} {rng.choice(BIZ_TRADES)}"
    if style < 0.75:
        return f"Bellwood {rng.choice(BIZ_TRADES)}"
    return f"{rng.choice(STREETS).split()[0]} {rng.choice(BIZ_TRADES)}"


def biz_slug(name):
    return "".join(ch for ch in name.lower() if ch.isalnum()) or "business"


def house_number(rng):
    return str(rng.randint(1, 49) * 100 + rng.randint(0, 99))


def amount(rng):
    return f"${rng.randint(18, 1850):,}.{rng.randint(0,99):02d}"


def account_no(rng):
    return f"{rng.randint(10,99)}-{rng.randint(10000,99999)}-{rng.randint(0,9)}"


def phone(rng):
    return f"(708) 555-{rng.randint(200,989):04d}"


def case_no(rng, year, prefix):
    return f"{prefix}{str(year)[2:]}-{rng.randint(1,99999):05d}"


def clock_time(rng, night=False):
    if night:
        h = rng.choice([18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5])
    else:
        h = rng.randint(6, 22)
    m = rng.randint(0, 59)
    ampm = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {ampm}"


def days_phrase(rng):
    return rng.choice(["two days", "three days", "a week", "ten days", "over a month",
                       "several days", "almost two weeks", "the past few days"])
