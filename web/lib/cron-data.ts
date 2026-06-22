// Lightweight, self-contained record generator for the weekly Vercel-Cron refresh.
// Produces realistic current-week municipal records (resident / police / fire /
// department) dated into the week leading up to `anchor`, with simple entity
// extraction — no Python pipeline needed.

import { normalizeAddress, normalizePerson } from "./normalize";

const FIRST = [
  "Aaliyah", "Andre", "Bianca", "Cesar", "Damon", "Elena", "Felix", "Grace",
  "Hector", "Imani", "Jamal", "Keisha", "Lamont", "Marisol", "Nadia", "Omar",
  "Priya", "Quentin", "Rosa", "Soren", "Tanya", "Vincent", "Wendy", "Yusuf",
  "Zoe", "Darnell", "Estela", "Gregory", "Lucia", "Terrence",
];
const LAST = [
  "Acosta", "Boyd", "Castillo", "Doyle", "Esparza", "Franklin", "Gallegos",
  "Hsu", "Ibrahim", "Jeffries", "Kowalczyk", "Lindgren", "Mercado", "Novak",
  "Ortega", "Padilla", "Quinones", "Rios", "Salgado", "Tran", "Underhill",
  "Valdez", "Whitaker", "Yoon", "Zamora", "Brennan", "Driscoll", "Fuentes",
];
const STREETS = [
  "Bohland Ave", "Frederick Ave", "St. Charles Rd", "Mannheim Rd", "Washington Blvd",
  "Eastern Ave", "Marshall Ave", "Geneva Ave", "Rice Ave", "Bellwood Ave",
  "25th Ave", "19th Ave", "44th Ave", "50th Ave", "Granville Ave", "Hirsch Ave",
  "Englewood Ave", "Morris Ave", "Harvard Ave", "Monroe St",
];
const DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "comcast.net", "att.net", "sbcglobal.net"];
const BIZ = [
  "Route 64 Sports Bar", "El Faro Cantina", "Bellwood Pizzeria", "Mannheim Auto Repair",
  "Plaza Cleaners", "Westside Hardware", "Corner Pantry Market", "Bellwood Dental",
  "Sunrise Daycare", "44th Plumbing", "Geneva Liquors", "St. Charles Grill",
];
const POLICE_DISPO = [
  "report taken", "warning issued", "citation issued", "subject arrested and processed",
  "gone on arrival", "peace restored", "vehicle towed", "referred to detectives",
  "advised civil matter", "case cleared by arrest",
];
const MAYOR = "mayor@bellwood-demo.gov";

type SenderKind = "resident" | "pd_watch" | "pd_records" | "pd_chief" | "fd_shift" | "fd_prev" | "fd_chief" | "clerk" | "water" | "code" | "build" | "parks";

const STAFF: Record<Exclude<SenderKind, "resident">, { name: string; email: string }> = {
  pd_watch: { name: "Bellwood PD — Watch Commander", email: "watchcommander@bellwood-demo.gov" },
  pd_records: { name: "Bellwood PD — Records Bureau", email: "pdrecords@bellwood-demo.gov" },
  pd_chief: { name: "Chief Gerald Pruitt", email: "pdchief@bellwood-demo.gov" },
  fd_shift: { name: "Bellwood Fire Dept. — Shift Commander", email: "shiftreport@bellwood-demo.gov" },
  fd_prev: { name: "Inspector Dale Brackett", email: "fdprevention@bellwood-demo.gov" },
  fd_chief: { name: "Chief Lillian Vasquez", email: "fdchief@bellwood-demo.gov" },
  clerk: { name: "Yolanda Pierce", email: "ypierce@bellwood-demo.gov" },
  water: { name: "Lorena Diaz", email: "ldiaz@bellwood-demo.gov" },
  code: { name: "Sandra Pulaski", email: "spulaski@bellwood-demo.gov" },
  build: { name: "Rosa Marchetti", email: "rmarchetti@bellwood-demo.gov" },
  parks: { name: "Kevin O'Brien", email: "kobrien@bellwood-demo.gov" },
};

interface Tmpl {
  w: number;
  topic: string;
  sender: SenderKind;
  subject: string;
  body: string;
}

// {ADDR} street address · {STREET} · {NAME} · {CASE} · {AMT} · {BIZ} · {DISPO} · {TIME}
const TEMPLATES: Tmpl[] = [
  // ── residents (citizen requests/complaints) ──
  { w: 5, topic: "roads", sender: "resident", subject: "Pothole on {STREET} getting worse", body: "There's a deep pothole on {STREET} near {ADDR} that's been growing for weeks. I've already had to get my tire checked. Can Public Works patch it before someone bends a rim? Thanks." },
  { w: 4, topic: "water_billing", sender: "resident", subject: "Water bill jumped with no usage change", body: "My water bill at {ADDR} went up sharply this cycle and nothing changed in the house — no leaks, same routine. Can someone re-read the meter before the late fee posts? Account is in my name." },
  { w: 5, topic: "drainage", sender: "resident", subject: "Standing water again at {ADDR}", body: "After the rain this week the street floods at {ADDR} and the catch basin looks clogged. Cars push the water onto the sidewalk. This keeps happening — can a crew clear the drain?" },
  { w: 4, topic: "sanitation", sender: "resident", subject: "Missed garbage / recycling pickup on {STREET}", body: "Our block on {STREET} got skipped again this week. Bins were out by 6am like the notice says. Can it be picked up before the weekend? Several neighbors are in the same boat." },
  { w: 3, topic: "complaint", sender: "resident", subject: "Loud late-night noise near {ADDR}", body: "There's been loud music and shouting past midnight near {ADDR} most nights this week. I work early and can't sleep. Is there anything the village can do about the noise?" },
  { w: 3, topic: "permits", sender: "resident", subject: "Fence permit status for {ADDR}", body: "I submitted a fence permit for {ADDR} a few weeks ago and haven't heard back. Contractor is ready to start. Can someone check the status and let me know what's needed?" },
  { w: 3, topic: "parks_events", sender: "resident", subject: "Question about summer programs / Taste of Bellwood", body: "My kids want to sign up for the summer park program and we're excited for Taste of Bellwood. Where do I register, and are volunteers still needed this year?" },
  { w: 2, topic: "thanks", sender: "resident", subject: "Thank you for fixing the {STREET} issue", body: "Just wanted to say thank you — the crew came out to {ADDR} this week and took care of it quickly. Please pass along my appreciation to the team." },
  { w: 3, topic: "code_enforcement", sender: "resident", subject: "Overgrown/derelict property near {ADDR}", body: "The property near {ADDR} has tall weeds, trash, and what looks like an abandoned vehicle. It's been like this for a while. Can code enforcement take a look?" },
  { w: 2, topic: "roads", sender: "resident", subject: "Streetlight out on {STREET}", body: "The streetlight on {STREET} by {ADDR} has been out for over a week. That stretch is dark and a little unsafe walking at night. Can it get fixed?" },
  // ── police records ──
  { w: 4, topic: "public_safety", sender: "pd_records", subject: "Offense report {CASE} — retail theft, {ADDR}", body: "Offense report {CASE} filed for retail theft at {ADDR}. Loss approx {AMT}. Suspect fled prior to arrival; {DISPO}. Forwarding for your awareness." },
  { w: 4, topic: "public_safety", sender: "pd_records", subject: "Offense report {CASE} — motor vehicle / catalytic converter theft, {STREET}", body: "Report {CASE}: catalytic converter cut from a vehicle parked on {STREET} overnight. Estimated loss {AMT}. {DISPO}. Third on that block this month — flagging the pattern." },
  { w: 3, topic: "public_safety", sender: "pd_records", subject: "Offense report {CASE} — criminal damage / burglary, {ADDR}", body: "Report {CASE} for burglary to a residence at {ADDR}. Point of entry rear door; {AMT} in property reported taken. Evidence collected; {DISPO}." },
  { w: 4, topic: "public_safety", sender: "pd_watch", subject: "Overnight Incident Summary — {DATELONG}", body: "Overnight blotter: calls for service incl. a noise complaint on {STREET} ({DISPO}), a traffic crash at {ADDR}, and a suspicious-person check. No officer injuries. Full log attached." },
  { w: 2, topic: "public_safety", sender: "pd_chief", subject: "Heads-up: incident near {ADDR}", body: "Briefing you before tonight's calls: officers responded to {ADDR} this week. Situation stabilized, {DISPO}. I'll have a fuller summary for the board packet." },
  { w: 2, topic: "public_safety", sender: "pd_records", subject: "FOIA #{CASE} — police report / body-cam request", body: "FOIA #{CASE} received for a report and squad video at {ADDR}. Five-business-day clock started. Will route to legal for review before release." },
  // ── fire / EMS records ──
  { w: 4, topic: "fire_ems", sender: "fd_shift", subject: "Daily Run Report — {DATELONG}", body: "Runs today: several EMS calls, an alarm activation at {BIZ}, and a wires-down call on {STREET}. All units back in service. Summary attached for the record." },
  { w: 4, topic: "fire_ems", sender: "fd_prev", subject: "Annual fire inspection — {BIZ}, {ADDR}", body: "Completed the annual inspection at {BIZ}, {ADDR}. Two violations noted: blocked egress and an out-of-date extinguisher tag (IFC 906/1031). Re-inspection scheduled. Copy for your file." },
  { w: 3, topic: "fire_ems", sender: "fd_chief", subject: "Incident summary {CASE} — structure fire, {ADDR}", body: "NFIRS {CASE}: working structure fire at {ADDR}, knocked down with no extension to exposures. Estimated loss {AMT}. Cause under investigation. MABAS box held for manpower." },
  { w: 2, topic: "fire_ems", sender: "fd_prev", subject: "Hydrant flow test results — {STREET}", body: "Completed flow testing on the hydrants along {STREET}. One marked out of service pending repair; Public Works notified. Results logged for ISO records." },
  { w: 2, topic: "fire_ems", sender: "fd_shift", subject: "CO alarm / gas odor investigation, {ADDR}", body: "Responded to a CO alarm / odor of gas at {ADDR}. Detector readings checked, area ventilated; {DISPO}. Advised resident on next steps. No transport." },
  // ── department ops ──
  { w: 2, topic: "foia", sender: "clerk", subject: "Weekly FOIA log — {NUM} open requests", body: "This week's FOIA log: {NUM} open requests, two due Friday. One records request needs your sign-off before release. Summary attached." },
  { w: 2, topic: "code_enforcement", sender: "code", subject: "Code enforcement notice issued — {ADDR}", body: "Notice issued at {ADDR} for property maintenance (tall grass / debris). Compliance window 14 days; re-inspection set. Copying you in case the owner calls." },
  { w: 2, topic: "permits", sender: "build", subject: "Permit / inspection update — {ADDR}", body: "Building permit for {ADDR} passed rough inspection this week; final scheduled. One correction item noted. Logging for the record." },
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function ri(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
// small deterministic-ish PRNG seeded by the run timestamp
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenRecord {
  message_id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_name: string;
  from_email: string;
  to_email: string;
  cc: string | null;
  subject: string;
  date_sent: string; // ISO
  body_raw: string;
  body_clean: string;
  topic: string;
  is_synthetic: boolean;
  entities: { type: "person" | "address" | "business"; value: string; norm: string }[];
}

const ADDR_RE =
  /\b\d{1,5}\s+(?:[A-Z0-9][\w.'-]*\s+){0,2}(?:Ave|Avenue|Rd|Road|St|Street|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way)\b/g;

function extractEntities(fromName: string, fromEmail: string, text: string): GenRecord["entities"] {
  const out: GenRecord["entities"] = [];
  const seen = new Set<string>();
  const add = (type: GenRecord["entities"][number]["type"], value: string, norm: string) => {
    const k = `${type}:${norm}`;
    if (!norm || seen.has(k)) return;
    seen.add(k);
    out.push({ type, value: value.slice(0, 300), norm: norm.slice(0, 300) });
  };
  // person: the sender, when it's a resident (free-mail domain)
  if (fromName && !fromEmail.endsWith("demo.gov")) add("person", fromName, normalizePerson(fromName));
  // addresses (numbered + named streets)
  for (const m of text.matchAll(ADDR_RE)) add("address", m[0].trim(), normalizeAddress(m[0].trim()));
  for (const s of STREETS) if (text.toLowerCase().includes(s.toLowerCase())) add("address", s, normalizeAddress(s));
  for (const b of BIZ) if (text.includes(b)) add("business", b, normalizePerson(b));
  return out;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Generate `n` records dated within the 7 days ending at `anchor`. */
export function generateBatch(anchor: Date, runTs: number, n: number): GenRecord[] {
  const rng = mulberry32(runTs);
  const weighted: Tmpl[] = [];
  for (const t of TEMPLATES) for (let i = 0; i < t.w; i++) weighted.push(t);

  const recs: GenRecord[] = [];
  for (let i = 0; i < n; i++) {
    const t = pick(rng, weighted);
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    const name = `${first} ${last}`;
    const street = pick(rng, STREETS);
    const addr = `${ri(rng, 1, 49) * 100 + ri(rng, 0, 99)} ${street}`;
    const yy = String(anchor.getFullYear()).slice(2);
    const ctx: Record<string, string> = {
      NAME: name,
      STREET: street,
      ADDR: addr,
      CASE: `B${yy}-${String(ri(rng, 1000, 99999)).padStart(5, "0")}`,
      AMT: `$${(ri(rng, 60, 8000)).toLocaleString()}`,
      BIZ: pick(rng, BIZ),
      DISPO: pick(rng, POLICE_DISPO),
      TIME: `${ri(rng, 1, 12)}:${String(ri(rng, 0, 59)).padStart(2, "0")} ${rng() < 0.5 ? "AM" : "PM"}`,
      NUM: String(ri(rng, 3, 12)),
    };
    // date: weight several to anchor (today); rest across the prior 6 days
    const dayBack = i < n * 0.18 ? 0 : ri(rng, 0, 6);
    const d = new Date(anchor);
    d.setDate(d.getDate() - dayBack);
    d.setHours(ri(rng, 7, 20), ri(rng, 0, 59), 0, 0);
    ctx.DATELONG = `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    const fill = (s: string) => s.replace(/\{([A-Z]+)\}/g, (_, k) => ctx[k] ?? "");
    const subject = fill(t.subject);
    const body = fill(t.body);

    const sender =
      t.sender === "resident"
        ? {
            name,
            email: `${first.toLowerCase()}.${last.toLowerCase()}${ri(rng, 0, 1) ? ri(rng, 1, 89) : ""}@${pick(rng, DOMAINS)}`,
          }
        : STAFF[t.sender];

    recs.push({
      message_id: `<cron-${runTs}-${i}@mail.bellwood-demo.gov>`,
      thread_id: `cron-${runTs}-${i}`,
      direction: "inbound",
      from_name: sender.name,
      from_email: sender.email,
      to_email: MAYOR,
      cc: null,
      subject,
      date_sent: d.toISOString(),
      body_raw: body,
      body_clean: body,
      topic: t.topic,
      is_synthetic: true,
      entities: extractEntities(sender.name, sender.email, `${subject}\n${body}`),
    });
  }
  return recs;
}
