/*
 * orchestrator.test.ts — Phase 5 gate checks for the run loop's pure parts,
 * the usage instrumentation math, and the Wall's schedule face.
 *
 *   cd web && npx tsx eval/orchestrator.test.ts
 *
 * (The live SQL path needs DATABASE_URL + keys and is smoke-tested at
 * canonical cutover; what's provable here is the prompt contract, the JSON
 * parse, the adoption math, and the calendar card's walled filter.)
 */
import { buildAgentPrompt, parseRunOutput } from "../lib/agent-runner";
import { domainAgentByKey } from "../lib/domain-agents";
import { DEMO_AGENT_MEMORY } from "../lib/demo/data/agent-memory";
import { appendCapped, usageSummary, median, type UsageEvent } from "../lib/usage";
import { getWall } from "../lib/wall";
import { AGENT_TYPES } from "../lib/agent-types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("memory-aware prompting");
const constituent = domainAgentByKey("constituent")!;
const memory = DEMO_AGENT_MEMORY.constituent;
const slice = [{
  messageId: "<now-4719fd94f5ae0394@mail.bellwood-demo.gov>", threadId: "now-thr-6abdde046d94",
  date: "2026-06-26T22:33:00.877Z", fromName: "Eleanor Meyer", fromEmail: "eleanor.meyer@comcast.net",
  subject: "Basement flooded AGAIN after Saturday's storm — where is the regrade?",
  topic: "drainage", snippet: "Third time since March…",
}];
const { system, user } = buildAgentPrompt(constituent, memory, slice);
check("system carries the charter", system.includes(constituent.charter.slice(0, 40)));
check("system carries the urgency rules", system.includes("the Meyer rule"));
check("system states the draft actItems shape (draft agent)", system.includes("draft_reply"));
check("open memory injected with occurrence counts", user.includes("(seen 3×") && user.includes("Frederick Ave regrade"));
check("memory evidence ids ride along (prior citations possible)", user.includes("<a2-c40b404847838f18@mail.bellwood-demo.gov>"));
check("slice message present with id + thread", user.includes("[<now-4719fd94f5ae0394@mail.bellwood-demo.gov>]") && user.includes("now-thr-6abdde046d94"));
const observer = domainAgentByKey("police")!;
check("observe agents are told actItems must be empty", buildAgentPrompt(observer, [], []).system.includes("NOT draft"));
check("empty slice says so honestly", buildAgentPrompt(observer, [], []).user.includes("no new messages"));

console.log("output parsing");
const payload = { headline: "h", urgency: "clear", digest: [], actItems: [], memoryOps: [] };
check("plain JSON parses", JSON.stringify(parseRunOutput(JSON.stringify(payload))) === JSON.stringify(payload));
check("fenced JSON parses", JSON.stringify(parseRunOutput("```json\n" + JSON.stringify(payload) + "\n```")) === JSON.stringify(payload));

console.log("usage math — the four numbers");
const ev = (t: string, data?: Record<string, unknown>): UsageEvent => ({ t, ts: 0, data });
check("median: odd", median([5, 1, 9]) === 5);
check("median: even averages", median([2, 4]) === 3);
check("median: empty is null", median([]) === null);
check("ring buffer caps", appendCapped(Array.from({ length: 5 }, () => ev("x")), ev("y"), 5).length === 5);
const summary = usageSummary([
  ev("app_open"), ev("first_tap", { ms: 1200 }), ev("first_tap", { ms: 2000 }),
  ev("queue_clear", { ms: 90_000, items: 3 }), ev("fixit_used", { id: "a" }), ev("fixit_used", { id: "b" }),
  ev("digest_open", { agentKey: "police" }), ev("digest_open", { agentKey: "police" }), ev("digest_open", { agentKey: "council" }),
]);
check("first-tap median", summary.medianFirstTapMs === 1600);
check("queue-clear median", summary.medianQueueClearMs === 90_000);
check("fix-it count", summary.fixitUses === 2);
check("digest opens per agent", summary.digestOpens.police === 2 && summary.digestOpens.council === 1);

console.log("schedule card — the 'Coming up' face on one clock");
const wall = getWall({ hour: 9 });
const days = wall.schedule.days;
check("today leads (marked), even when quiet", days[0]?.date === "2026-06-28" && days[0]?.isToday === true);
check("today + up to 3 upcoming EVENT days", days.length >= 2 && days.length <= 4 && days.slice(1).every((d) => d.events.length > 0));
check("numeral + month + weekday present", days.every((d) => d.dayNum > 0 && d.month.length === 3 && d.weekday.length === 3));
check("personal hold shows (Sofia's birthday today)", days[0].events.some((e) => e.title.includes("Sofia")));
check(
  "walled business events NEVER on the schedule card (no P&L, no Brink's, no IDFPR)",
  days.every((d) => d.events.every((e) => !/P&L|Brink|IDFPR|License renewal/i.test(e.title))),
);
check("upcoming community days surface (pantry/Chamber/gala window)", days.length >= 2 && days[1].date > "2026-06-28");
check("links out to the real calendars", wall.schedule.links.length === 2 && wall.schedule.links.every((l) => l.href.startsWith("https://")));

console.log("agent types (the + card)");
check("five defined types", AGENT_TYPES.length === 5);
check("every type has an interview + blurb", AGENT_TYPES.every((t) => t.interview.length >= 3 && t.blurb.length > 0));

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
