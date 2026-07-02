/*
 * wall.test.ts — Phase 2 gate checks for the getWall() provider.
 *
 *   cd web && npx tsx eval/wall.test.ts
 *
 * Proves the Gate-2 invariants: ≤3 needsYouNow rows ranked red-first; the
 * dual-domain thread (Pawlak / El Faro blotter) renders ONCE with two agent
 * chips; footer counts trace to the runs; the greeting is time-coherent and
 * never mentions coffee; walled agents never enter needsYouNow or the footer;
 * and the demo's single clock holds.
 */
import { getWall, assembleWall } from "../lib/wall";
import { DEMO_AGENT_RUNS, DEMO_RUN_AT } from "../lib/demo/data/domain-agents";
import { DEMO_NOW, demoToday } from "../lib/demo";
import type { AgentRun } from "../lib/agent-run";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("single demo clock");
check("demoToday() anchors to the fixture window", demoToday() === "2026-06-28", demoToday());
check("DEMO_NOW is after the cabinet pass", DEMO_NOW > DEMO_RUN_AT);

console.log("getWall — needsYouNow");
const wall = getWall({ hour: 9, mayorName: "Mayor Harvey" });
check("max 3 rows", wall.needsYouNow.length > 0 && wall.needsYouNow.length <= 3, String(wall.needsYouNow.length));
const ranks = wall.needsYouNow.map((i) => (i.urgency === "red" ? 0 : i.urgency === "yellow" ? 1 : 2));
check("red ranks before yellow", ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), ranks.join(","));
check("no duplicate threads", new Set(wall.needsYouNow.map((i) => i.id)).size === wall.needsYouNow.length);
check("Meyer (red, newest) leads", wall.needsYouNow[0]?.id === "now-thr-6abdde046d94", wall.needsYouNow[0]?.id);
check("…captioned by the constituent, not the internal reply", wall.needsYouNow[0]?.line.startsWith("Eleanor Meyer"), wall.needsYouNow[0]?.line);

const pawlak = wall.needsYouNow.filter((i) => i.id === "now-thr-7ae8ce60f226");
check("dual-domain thread appears exactly once", pawlak.length === 1);
check(
  "…with police + constituent chips merged (cabinet order)",
  JSON.stringify(pawlak[0]?.agentKeys) === JSON.stringify(["police", "constituent"]),
  JSON.stringify(pawlak[0]?.agentKeys),
);
check("…keeps max urgency (red) and the Approve verb", pawlak[0]?.urgency === "red" && pawlak[0]?.action === "Approve");

console.log("getWall — cabinet & footer trace to the runs");
check("one card per active agent, registry order", JSON.stringify(wall.cabinet.map((c) => c.agentKey)) === JSON.stringify(["police", "fire", "council", "constituent", "schedule"]));
const expHandled = DEMO_AGENT_RUNS.reduce((n, r) => n + r.output.digest.length, 0);
const expWaiting = DEMO_AGENT_RUNS.reduce((n, r) => n + r.output.actItems.length, 0);
check(`footer.handled = Σ digest points (${expHandled})`, wall.footer.handled === expHandled, String(wall.footer.handled));
check(`footer.waiting = Σ actItems (${expWaiting})`, wall.footer.waiting === expWaiting, String(wall.footer.waiting));
check("eta present when drafts wait", wall.footer.etaMinutes >= 1);
for (const c of wall.cabinet) {
  const run = DEMO_AGENT_RUNS.find((r) => r.agentKey === c.agentKey)!;
  check(
    `${c.agentKey}: card counts = run counts`,
    c.counts.newItems === run.output.digest.length && c.counts.needsYou === run.output.actItems.length,
  );
}
check("runs payload carries the full digests", wall.runs.constituent?.actItems.length === 3 && wall.runs.police?.digest.length === 5);
check("every citation chip has a label", Object.values(wall.runs).every((r) => r.digest.every((d) => d.sources.every((s) => s.label.length > 0))));
check("dateLabel derives from the demo clock", wall.dateLabel.includes("June 28"), wall.dateLabel);

console.log("greeting — time-coherent, never playful");
check("morning", getWall({ hour: 9 }).greeting === "Good morning, Mayor Harvey.");
check("evening", getWall({ hour: 19 }).greeting === "Good evening, Mayor Harvey.");
check("no coffee, no exclamation", !/coffee|!/i.test(getWall({ hour: 19 }).greeting));

console.log("walled rule — the Phase 5 flip path");
const harborRun: AgentRun = {
  agentKey: "harbor-wellness",
  ranAt: DEMO_RUN_AT,
  output: {
    headline: "IDFPR license renewal is inside 30 days.",
    urgency: "red",
    digest: [{ point: "License renewal filing deadline July 31 — fee, surety bond, attestation.", sourceMessageIds: ["biz-015"] }],
    actItems: [{ type: "draft_reply", threadId: "biz-015", draftSubject: "Re: license renewal", draftBody: "…", rationale: "deadline", citations: ["biz-015"] }],
    memoryOps: [],
  },
};
const walled = assembleWall([...DEMO_AGENT_RUNS, harborRun], DEMO_NOW, { hour: 9 });
check("walled agent gets a cabinet card (Private)", walled.cabinet.some((c) => c.agentKey === "harbor-wellness" && c.walled));
check("walled items NEVER enter needsYouNow", walled.needsYouNow.every((i) => !i.agentKeys.includes("harbor-wellness")));
check("walled drafts stay out of the government footer", walled.footer.waiting === expWaiting, String(walled.footer.waiting));

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
