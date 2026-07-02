/*
 * derive-domains.test.ts — Phase 1 gate checks (no framework, mirrors eval/run.ts).
 *
 *   cd web && npx tsx eval/derive-domains.test.ts
 *
 * Covers: deriveStream regression (untouched), the deriveDomains multi-label
 * mapping, the runner's autonomy/commitment enforcement, and the fixture
 * invariants — every citation resolves in the demo corpora, and the El Faro
 * blotter thread appears in BOTH police and constituent digests (the Phase 2
 * dedup proof).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveStream, deriveDomains } from "../lib/topics";
import { DOMAIN_AGENTS, domainAgentByKey, HARBOR_WELLNESS_ENTITY } from "../lib/domain-agents";
import { validateRunOutput, applyMemoryOps } from "../lib/agent-run";
import { DEMO_AGENT_RUNS } from "../lib/demo/data/domain-agents";
import { DEMO_AGENT_MEMORY } from "../lib/demo/data/agent-memory";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

// ── deriveStream regression (must be byte-for-byte unchanged behavior) ──────
console.log("deriveStream (regression)");
check("public_safety → Police", deriveStream("public_safety", "x@y.com") === "Police");
check("fire_ems → Fire/EMS", deriveStream("fire_ems", null) === "Fire/EMS");
check("bellwood-demo.gov → Interdepartmental", deriveStream("roads", "fdimeo@bellwood-demo.gov") === "Interdepartmental");
check("illinois-demo.gov → Regional", deriveStream("roads", "d1@illinois-demo.gov") === "Regional");
check("business → Business", deriveStream("business", "dana@whitfield-cpa.com") === "Business");
check("foia → Civic/FOIA", deriveStream("foia", "monica.parker@aol.com") === "Civic/FOIA");
check("default → Resident", deriveStream("roads", "a@comcast.net") === "Resident");

// ── deriveDomains (multi-label) ──────────────────────────────────────────────
console.log("deriveDomains");
check("Police stream → police", eq(deriveDomains("public_safety", "watchcommander@bellwood-demo.gov"), ["police"]));
check("Fire/EMS stream → fire", eq(deriveDomains("fire_ems", "shiftreport@bellwood-demo.gov"), ["fire"]));
check("resident FOIA → council", eq(deriveDomains("foia", "monica.parker@aol.com"), ["council"]));
check("internal FOIA officer → council", eq(deriveDomains("foia", "ypierce@bellwood-demo.gov"), ["council"]));
check("interdepartmental non-clerk → (none)", eq(deriveDomains("roads", "fdimeo@bellwood-demo.gov"), []));
check("clerk@ localpart → council", eq(deriveDomains("permits", "clerk@bellwood-demo.gov"), ["council"]));
check("Resident → constituent", eq(deriveDomains("roads", "gloria.bennett7@gmail.com"), ["constituent"]));
check("Regional → constituent", eq(deriveDomains("drainage", "d1@illinois-demo.gov"), ["constituent"]));
check("Business → harbor-wellness", eq(deriveDomains("business", "dana@whitfield-cpa.com"), ["harbor-wellness"]));
check(
  "calendar topic adds schedule (cabinet order)",
  eq(deriveDomains("meeting", "someone@gmail.com"), ["constituent", "schedule"]),
);
check(
  "entity-scope hit adds the scoped agent (multi-label)",
  eq(deriveDomains("roads", "resident@gmail.com", [HARBOR_WELLNESS_ENTITY]), ["constituent", "harbor-wellness"]),
);
check(
  "entity hit dedups with stream hit",
  eq(deriveDomains("business", "maya@harborwellness-demo.com", [HARBOR_WELLNESS_ENTITY]), ["harbor-wellness"]),
);

// ── runner enforcement ───────────────────────────────────────────────────────
console.log("agent-run enforcement");
const police = domainAgentByKey("police")!;
const constituent = domainAgentByKey("constituent")!;
const draftItem = {
  type: "draft_reply" as const,
  threadId: "t",
  draftSubject: "s",
  draftBody: "b",
  rationale: "r",
  citations: ["<m@x>"],
};
const bareRun = { headline: "h", urgency: "clear", digest: [], actItems: [draftItem], memoryOps: [] };
check(
  "observe agent emitting actItems is rejected",
  (() => {
    try {
      validateRunOutput(police, bareRun);
      return false;
    } catch {
      return true;
    }
  })(),
);
check(
  "draft agent emitting actItems passes",
  (() => {
    try {
      validateRunOutput(constituent, bareRun);
      return true;
    } catch {
      return false;
    }
  })(),
);
check(
  "uncited digest point is rejected",
  (() => {
    try {
      validateRunOutput(police, { ...bareRun, actItems: [], digest: [{ point: "p", sourceMessageIds: [] }] });
      return false;
    } catch {
      return true;
    }
  })(),
);

const seed = applyMemoryOps(
  [],
  [{ op: "upsert", kind: "commitment", title: "Regrade", sourceMessageIds: ["<a@x>"] }],
  { agentKey: "constituent", ranAt: "2026-06-28T00:00:00Z" },
);
check("upsert creates open item", seed.length === 1 && seed[0].status === "open" && seed[0].occurrenceCount === 1);
const bumped = applyMemoryOps(
  seed,
  [{ op: "upsert", kind: "commitment", title: "Regrade", sourceMessageIds: ["<b@x>"] }],
  { agentKey: "constituent", ranAt: "2026-06-29T00:00:00Z" },
);
check(
  "re-upsert bumps occurrenceCount and merges sources",
  bumped[0].occurrenceCount === 2 && bumped[0].sourceMessageIds.length === 2,
);
check(
  "commitment close without evidence throws",
  (() => {
    try {
      applyMemoryOps(bumped, [{ op: "close", kind: "commitment", title: "Regrade", sourceMessageIds: [] }], {
        agentKey: "constituent",
        ranAt: "2026-06-30T00:00:00Z",
      });
      return false;
    } catch {
      return true;
    }
  })(),
);
check(
  "commitment close by explicit mayor action passes",
  applyMemoryOps(bumped, [{ op: "close", kind: "commitment", title: "Regrade", sourceMessageIds: [] }], {
    agentKey: "constituent",
    ranAt: "2026-06-30T00:00:00Z",
    mayorClosedCommitments: ["Regrade"],
  })[0].status === "closed",
);
check(
  "commitment close by evidence passes",
  applyMemoryOps(bumped, [{ op: "close", kind: "commitment", title: "Regrade", sourceMessageIds: ["<c@x>"] }], {
    agentKey: "constituent",
    ranAt: "2026-06-30T00:00:00Z",
  })[0].status === "closed",
);

// ── fixture invariants ───────────────────────────────────────────────────────
console.log("fixtures");
const activeKeys = DOMAIN_AGENTS.filter((a) => a.active).map((a) => a.key);
check(
  "one fixture run per active agent, none for inactive",
  eq(DEMO_AGENT_RUNS.map((r) => r.agentKey).sort(), [...activeKeys].sort()),
);
for (const run of DEMO_AGENT_RUNS) {
  const agent = domainAgentByKey(run.agentKey)!;
  check(
    `${run.agentKey}: output passes the run contract`,
    (() => {
      try {
        validateRunOutput(agent, run.output);
        return true;
      } catch (e) {
        console.error(`      ${(e as Error).message}`);
        return false;
      }
    })(),
  );
}
check(
  "constituent actItems = the three seeded drafts (Meyer/Bennett/Pawlak threads)",
  eq(
    DEMO_AGENT_RUNS.find((r) => r.agentKey === "constituent")!.output.actItems.map((a) => a.threadId),
    ["now-thr-6abdde046d94", "thr-1bd69b6a2c64", "now-thr-7ae8ce60f226"],
  ),
);

// The dual-domain proof: the El Faro bar-noise blotter message is cited by BOTH
// police and constituent digests (Phase 2 dedups by threadId at presentation).
const DUAL = "<ce71934d89f4c02e@mail.bellwood-demo.gov>";
const citesDual = (key: string) =>
  DEMO_AGENT_RUNS.find((r) => r.agentKey === key)!.output.digest.some((d) => d.sourceMessageIds.includes(DUAL));
check("dual-domain blotter item in police digest", citesDual("police"));
check("dual-domain blotter item in constituent digest", citesDual("constituent"));

// Every citation (runs + memory) resolves in the demo corpora — invariant 4.
const dataDir = join(__dirname, "..", "lib", "demo", "data");
const valid = new Set<string>();
for (const row of JSON.parse(readFileSync(join(dataDir, "search-index.json"), "utf8")) as { messageId: string }[])
  valid.add(row.messageId);
for (const row of JSON.parse(readFileSync(join(dataDir, "business-inbox.json"), "utf8")) as { messageId: string }[])
  valid.add(row.messageId);
for (const row of JSON.parse(readFileSync(join(dataDir, "corpus-docs.json"), "utf8")) as { messageId: string }[])
  valid.add(row.messageId);

const unresolved: string[] = [];
const collect = (ids: string[], where: string) => {
  for (const id of ids) if (!valid.has(id)) unresolved.push(`${where}: ${id}`);
};
for (const run of DEMO_AGENT_RUNS) {
  run.output.digest.forEach((d, i) => collect(d.sourceMessageIds, `${run.agentKey}.digest[${i}]`));
  run.output.actItems.forEach((a, i) => collect(a.citations, `${run.agentKey}.actItems[${i}]`));
  run.output.memoryOps.forEach((m, i) => collect(m.sourceMessageIds, `${run.agentKey}.memoryOps[${i}]`));
}
for (const [key, items] of Object.entries(DEMO_AGENT_MEMORY))
  items.forEach((m, i) => collect(m.sourceMessageIds, `memory.${key}[${i}]`));
check("every fixture citation resolves in the demo corpora", unresolved.length === 0, unresolved.join("; "));

// ─────────────────────────────────────────────────────────────────────────────
if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
