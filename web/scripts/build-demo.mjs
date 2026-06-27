/*
 * build-demo.mjs — derive the no-API demo fixtures from the 30k seed corpus.
 *
 * Reads ../../corpus/seed_emails.json (the 30,641-email INBOX) and writes compact
 * JSON into web/lib/demo/data/. The mayor's full mailbox is ~70,000 (30k inbox +
 * 40k recovered-from-deleted); the demo presents that 70k story in Sources while
 * deriving real content from the 30k we have. Deterministic, no network.
 *
 * Run: node scripts/build-demo.mjs   (from web/)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, "../../corpus/seed_emails.json");
const OUT = join(__dirname, "../lib/demo/data");
mkdirSync(OUT, { recursive: true });

// ── corpus numbers (see memory: mailbox-corpus-numbers) ──
const MAILBOX_TOTAL = 70431; // matches the design prototype's Memory Store widget
const write = (name, obj) => {
  const p = join(OUT, name);
  writeFileSync(p, JSON.stringify(obj));
  console.log(`  ${name.padEnd(22)} ${(JSON.stringify(obj).length / 1e6).toFixed(2)} MB`);
};

console.log("reading seed…");
const rows = JSON.parse(readFileSync(SEED, "utf8"));
console.log(`  ${rows.length} emails`);

// Keep the sample CURRENT: shift every date forward so the newest email is today
// (preserves the relative spacing of the whole 2-year corpus).
const _maxDate = rows.reduce((m, r) => (r.date_sent > m ? r.date_sent : m), "");
const OFFSET = Date.now() - new Date(_maxDate).getTime();
for (const r of rows) r.date_sent = new Date(new Date(r.date_sent).getTime() + OFFSET).toISOString();
console.log(`  shifted dates +${Math.round(OFFSET / 86400000)}d → newest = today`);

const INBOX = rows.length;
const RECOVERED = MAILBOX_TOTAL - INBOX; // ~39,790 recovered-from-deleted

const isInternal = (email) => !!email && email.toLowerCase().includes("bellwood-demo.gov");

function streamOf(r) {
  const s = (r._source || r._scenario || "").toLowerCase();
  if (s === "police") return "Police";
  if (s === "fire") return "Fire/EMS";
  if (s === "business") return "Business";
  if (s === "interdept") return "Interdepartmental";
  if (s === "civic" || r.topic === "foia") return "Civic/FOIA";
  if (s === "regional") return "Regional";
  return "Resident";
}
const snippet = (r, n = 240) =>
  (r.body_clean || r.body_raw || "").replace(/\s+/g, " ").trim().slice(0, n);

// ── group by thread ──
const threads = new Map();
for (const r of rows) {
  const t = r.thread_id || r.message_id;
  if (!threads.has(t)) threads.set(t, []);
  threads.get(t).push(r);
}
for (const arr of threads.values()) arr.sort((a, b) => a.date_sent.localeCompare(b.date_sent));

const briefItem = (r, why) => ({
  messageId: r.message_id,
  subject: r.subject,
  fromName: r.from_name,
  date: r.date_sent,
  stream: streamOf(r),
  why,
});

// ───────────────────────── BRIEF (NeedsYouToday) ─────────────────────────
// awaitingReply: threads whose newest message is inbound (the ball is in your court)
const awaiting = [];
for (const arr of threads.values()) {
  const last = arr[arr.length - 1];
  if (last.direction === "inbound") awaiting.push(last);
}
awaiting.sort((a, b) => b.date_sent.localeCompare(a.date_sent));

const highSens = rows
  .filter((r) => r.direction === "inbound" && (r.topic === "foia" || r.topic === "public_safety"))
  .sort((a, b) => b.date_sent.localeCompare(a.date_sent));

const openTopics = new Set(["complaint", "drainage", "code_enforcement", "roads", "water_billing"]);
const openIssues = awaiting.filter((r) => openTopics.has(r.topic));

const brief = {
  generatedAt: rows.reduce((m, r) => (r.date_sent > m ? r.date_sent : m), ""),
  awaitingReply: awaiting.slice(0, 8).map((r) => briefItem(r, "Newest message on this thread is inbound — awaiting your reply.")),
  openIssues: openIssues.slice(0, 6).map((r) => briefItem(r, `Open ${String(r.topic).replace(/_/g, " ")} — last activity ${r.date_sent.slice(0, 10)}.`)),
  highSensitivity: highSens.slice(0, 5).map((r) => briefItem(r, `High-sensitivity (${String(r.topic).replace(/_/g, " ")}) — flagged for your eyes.`)),
};
write("brief.json", brief);

// ───────────────────────── ENTITIES / MEMORY ─────────────────────────
const people = new Map(); // key: lower(name) → {name, email, kind, msgs[]}
for (const r of rows) {
  if (r.direction !== "inbound") continue;
  const name = (r.from_name || "").trim();
  if (!name) continue;
  const key = name.toLowerCase();
  if (!people.has(key)) {
    const kind = isInternal(r.from_email)
      ? (/dept|department|commander|chief|clerk|works|finance|water|parks|code/i.test(name) ? "department" : "official")
      : (/llc|inc|corp|tavern|bar|grill|restaurant|shop|store|co\.?$|company|hideout|el faro/i.test(name) ? "business" : "person");
    people.set(key, { name, email: r.from_email, kind, msgs: [] });
  }
  people.get(key).msgs.push(r);
}
const ranked = [...people.values()].sort((a, b) => b.msgs.length - a.msgs.length);

// Lead Memory with external CONSTITUENTS/businesses (the institutional-memory
// story), then a few high-volume internal senders. Hero residents (Gloria
// Bennett, Eleanor Meyer, Ray Delgado, …) surface here even though internal
// report bots out-volume them.
const externals = ranked.filter((p) => p.kind === "person" || p.kind === "business");
const internals = ranked.filter((p) => p.kind === "department" || p.kind === "official");
const HERO = ["gloria bennett", "eleanor meyer", "ray delgado"];
const heroFirst = (list) =>
  [...list].sort((a, b) => (HERO.includes(b.name.toLowerCase()) ? 1 : 0) - (HERO.includes(a.name.toLowerCase()) ? 1 : 0));
const memoryRoster = [...heroFirst(externals).slice(0, 30), ...internals.slice(0, 10)];

const entities = memoryRoster.map((p, i) => ({
  entityId: `demo-ent-${i}`,
  name: p.name,
  kind: p.kind,
  count: p.msgs.length,
}));
write("entities.json", entities);

// per-entity detail for the roster (Memory drill-in)
const details = {};
for (const p of memoryRoster) {
  const msgs = p.msgs.slice().sort((a, b) => b.date_sent.localeCompare(a.date_sent));
  const streams = [...new Set(msgs.map(streamOf))];
  details[p.name.toLowerCase()] = {
    value: p.name,
    kind: p.kind,
    stats: {
      count: msgs.length,
      firstDate: msgs[msgs.length - 1]?.date_sent ?? null,
      lastDate: msgs[0]?.date_sent ?? null,
      streams,
      issues: Math.min(streams.length + 1, msgs.length),
      commitments: msgs.filter((m) => /will|follow up|by (mon|tue|wed|thu|fri|next)/i.test(m.body_clean || "")).length,
    },
    aliases: [
      { value: p.name, type: "name_variant", source: "email_header", confidence: 1.0 },
      ...(p.email ? [{ value: p.email, type: "email", source: "email_header", confidence: 1.0 }] : []),
    ],
    timeline: msgs.slice(0, 20).map((m) => ({
      id: m.message_id,
      date: m.date_sent,
      direction: m.direction,
      fromName: m.from_name,
      fromEmail: m.from_email,
      subject: m.subject,
      topic: m.topic,
      stream: streamOf(m),
      snippet: snippet(m, 200),
      messageId: m.message_id,
      threadId: m.thread_id,
    })),
  };
}
write("entity-details.json", details);

// ───────────────────────── EVENTS (things to actually do) ─────────────────────────
// Derived from recent actionable threads: each is something needing the Mayor's
// action, with status folded from the thread (responded → done; stale inbound →
// overdue; recent inbound → open). Links to the real source email.
const ACTION_TOPICS = new Set(["drainage", "code_enforcement", "complaint", "roads", "permits", "water_billing", "sanitation", "public_safety"]);
const refMs = new Date(brief.generatedAt).getTime();
const DAY = 86400000;
const allEvents = [];
for (const arr of threads.values()) {
  const anchor = arr.find((m) => m.direction === "inbound") || arr[0];
  if (!ACTION_TOPICS.has(anchor.topic)) continue;
  const last = arr[arr.length - 1];
  const ageDays = Math.round((refMs - new Date(last.date_sent).getTime()) / DAY);
  if (ageDays > 60) continue; // keep it to the current actionable set
  let status, dueLabel, role;
  if (last.direction === "outbound") { status = "done"; dueLabel = "responded · " + last.date_sent.slice(0, 10); role = "You responded"; }
  else if (ageDays > 5) { status = "late"; dueLabel = `overdue · ${ageDays}d`; role = "Awaiting your reply"; }
  else { status = "open"; dueLabel = ageDays <= 0 ? "due today" : `open · ${ageDays}d`; role = "Needs your action"; }
  allEvents.push({
    id: "EVT-" + allEvents.length, title: anchor.subject || "(no subject)", who: anchor.from_name,
    role, dueLabel, status, stream: streamOf(anchor), topic: anchor.topic,
    messageId: anchor.message_id, date: anchor.date_sent, why: snippet(anchor, 150),
  });
}
const order = { late: 0, open: 1, done: 2 };
allEvents.sort((a, b) => (order[a.status] - order[b.status]) || b.date.localeCompare(a.date));
const eventStats = {
  open: allEvents.filter((e) => e.status === "open").length,
  late: allEvents.filter((e) => e.status === "late").length,
  done: allEvents.filter((e) => e.status === "done").length,
};
write("events.json", { events: allEvents.slice(0, 40), stats: eventStats });

// ───────────────────────── SOURCES (the 70k story) ─────────────────────────
const bySource = {};
const byTopicRaw = {};
for (const r of rows) {
  const s = streamOf(r);
  bySource[s] = (bySource[s] || 0) + 1;
  if (r.topic) byTopicRaw[r.topic] = (byTopicRaw[r.topic] || 0) + 1;
}
const billingCount = (byTopicRaw["water_billing"] || 0) + (byTopicRaw["sanitation"] || 0);
// 6 connectors; mailbox carries the full 70k (inbox + recovered-deleted). 4/6 healthy.
const connectors = [
  { source: "Mayor's Exchange mailbox", kind: "IMAP / Graph", total: MAILBOX_TOTAL, canonical: MAILBOX_TOTAL, dead: 0, pct: 100, lastSynced: brief.generatedAt, status: "healthy",
    activity: ["Incremental sync — 1,204 new messages · today 06:05", "Incremental sync — 38 messages · today 05:35", "Incremental sync — 51 messages · today 05:05", "Nightly full reconcile — OK · today 02:00", "Incremental sync — 980 messages · yesterday 18:05"] },
  { source: "Police RMS (incident reports)", kind: "Nightly CSV", total: bySource["Police"] || 0, canonical: bySource["Police"] || 0, dead: 0, pct: 100, lastSynced: brief.generatedAt, status: "healthy",
    activity: ["Nightly load — 12 incident reports ingested · today 02:00", "Nightly load — 9 incident reports · yesterday 02:00", "Nightly load — 14 incident reports · 2 days ago 02:00", "Nightly load — 11 incident reports · 3 days ago 02:00"] },
  { source: "Fire/EMS NFIRS feed", kind: "API", total: bySource["Fire/EMS"] || 0, canonical: bySource["Fire/EMS"] || 0, dead: 0, pct: 100, lastSynced: brief.generatedAt, status: "healthy",
    activity: ["Nightly load — 8 run reports ingested · today 02:00", "Nightly load — 6 run reports · yesterday 02:00", "Nightly load — 10 run reports · 2 days ago 02:00"] },
  { source: "311 / constituent CRM", kind: "REST API", total: bySource["Resident"] || 0, canonical: Math.round((bySource["Resident"] || 0) * 0.97), dead: 0, pct: 97, lastSynced: brief.generatedAt, status: "syncing",
    activity: ["Sync in progress — 312 of 540 tickets · now", "Sync — 540 tickets reconciled · today 06:00", "Sync — 528 tickets · today 05:45", "Sync — 533 tickets · today 05:30"] },
  { source: "FOIA / records portal", kind: "Scrape", total: bySource["Civic/FOIA"] || 0, canonical: bySource["Civic/FOIA"] || 0, dead: 0, pct: 100, lastSynced: brief.generatedAt, status: "healthy",
    activity: ["Hourly scrape — 3 new requests · today 06:00", "Hourly scrape — 1 new request · today 05:00", "Hourly scrape — 0 new · today 04:00"] },
  { source: "Finance / utility billing (CSV)", kind: "Legacy CSV (SFTP)", total: billingCount, canonical: Math.round(billingCount * 0.9), dead: 12, pct: 90, lastSynced: brief.generatedAt, status: "degraded",
    activity: ["⚠ Weekly load FAILED — 12 rows rejected (bad date format) · today 02:00", "Weekly load — 1,402 rows · 7 days ago 02:00", "Weekly load — 1,388 rows · 14 days ago 02:00"] },
];
const sources = {
  totals: { messages: MAILBOX_TOTAL, embedded: MAILBOX_TOTAL, entities: people.size, inbox: INBOX, recovered: RECOVERED },
  connectors,
  review: [
    { reviewId: "demo-rev-1", aliasValue: "G. Bennett", existingName: "Gloria Bennett", incomingName: "Gloria B. Bennett", confidence: 0.72, kind: "name_collision" },
    { reviewId: "demo-rev-2", aliasValue: "El Faro", existingName: "El Faro Restaurant", incomingName: "El Faro Cantina LLC", confidence: 0.64, kind: "business_collision" },
  ],
  healthy: connectors.filter((c) => c.status === "healthy").length,
};
write("sources.json", sources);

// ───────────────────────── DASHBOARD ─────────────────────────
const byMonth = {}, byStream = {}, byTopic = {};
const constituents = new Map(), internal = new Map();
for (const r of rows) {
  const m = r.date_sent.slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + 1;
  const st = streamOf(r);
  byStream[st] = (byStream[st] || 0) + 1;
  if (r.topic) byTopic[r.topic] = (byTopic[r.topic] || 0) + 1;
  if (r.direction === "inbound" && r.from_name) {
    const bucket = isInternal(r.from_email) ? internal : constituents;
    const k = r.from_name;
    if (!bucket.has(k)) bucket.set(k, { name: k, email: r.from_email, count: 0, topics: new Set() });
    const e = bucket.get(k);
    e.count++;
    if (r.topic) e.topics.add(r.topic);
  }
}
const whoRows = (bucket) =>
  [...bucket.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((e) => ({
    name: e.name, email: e.email, count: e.count,
    topicsList: [...e.topics].slice(0, 4),
  }));
const dashboard = {
  who: { constituents: whoRows(constituents), internal: whoRows(internal) },
  openItems: [],
  volumeByMonth: Object.entries(byMonth).sort().map(([month, count]) => ({ month, count })),
  byStream: Object.entries(byStream).sort((a, b) => b[1] - a[1]).map(([stream, count]) => ({ stream, count })),
  byTopic: Object.entries(byTopic).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count })),
  totals: { emails: MAILBOX_TOTAL, chunks: Math.round(MAILBOX_TOTAL * 1.4) },
};
write("dashboard.json", dashboard);

// ───────────────────────── SEARCH INDEX (keyword Ask) ─────────────────────────
const index = rows.map((r) => ({
  messageId: r.message_id,
  threadId: r.thread_id,
  direction: r.direction,
  date: r.date_sent,
  fromName: r.from_name,
  fromEmail: r.from_email,
  toEmail: r.to_email,
  subject: r.subject,
  topic: r.topic,
  stream: streamOf(r),
  snippet: snippet(r, 260),
  t: ((r.subject || "") + " " + (r.from_name || "") + " " + snippet(r, 420)).toLowerCase(),
}));
write("search-index.json", index);

console.log(`\ninbox=${INBOX}  recovered=${RECOVERED}  mailbox=${MAILBOX_TOTAL}  entities=${people.size}`);
console.log("done.");
