/*
 * know.test.ts — Phase 4 gate checks (KNOW + nav collapse, provider side).
 *
 *   cd web && npx tsx eval/know.test.ts
 *
 * Covers: entity-kind normalization (orgs are not "person"), the push
 * one-liner format, the Ask seed questions landing curated/mode answers,
 * and Mayor mode defaulting ON (operator off) for the deployed demo.
 * (Async main: getWall is now a Promise-returning provider.)
 */
import { demoEntities, demoMemoryDetail, normalizeEntityKind } from "../lib/demo";
import { getWall, wallPushLine } from "../lib/wall";
import { ASK_SEEDS } from "../lib/ask-seeds";
import { loadOperatorMode } from "../lib/operator-mode";
import curated from "../lib/demo/data/ask-curated.json";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("entity kinds — orgs are not people");
  check("IDOT is an organization", normalizeEntityKind("IDOT District 1", "person") === "organization");
  check("county departments are organizations", normalizeEntityKind("Cook County Dept. of Transportation & Highways", "person") === "organization");
  check("village departments stay departments", normalizeEntityKind("Public Works Department", "department") === "department");
  check("people stay people", normalizeEntityKind("Gloria Bennett", "person") === "person");
  const ORGISH = /\b(dept|county|district|metra|idot|township|assessor)\b/i;
  check(
    "no provider entity is an org labeled person",
    demoEntities().every((e) => !(ORGISH.test(e.name) && e.kind === "person")),
    demoEntities().filter((e) => ORGISH.test(e.name) && e.kind === "person").map((e) => e.name).join(", "),
  );
  check("detail lookup normalizes too", (demoMemoryDetail("gloria bennett")?.kind ?? "") === "person");

  console.log("push layer — the Wall's top line");
  const line = wallPushLine(await getWall({ hour: 8 }));
  check("reads '<n> urgent: {headline} · 3 drafts ready · ≈5 min'", /urgent: .+ · 3 drafts ready · ≈\d+ min$/.test(line), line);
  check("leads with Eleanor Meyer (the red headline)", line.includes("Eleanor Meyer"), line);

  console.log("Ask seeds — every tap lands a strong answer");
  type Curated = { match: string[]; answer: string };
  const hitsCurated = (q: string) => (curated as Curated[]).some((c) => c.match.some((m) => q.toLowerCase().includes(m)));
  check("exactly 5 seeds", ASK_SEEDS.length === 5);
  check("Bohland seed → curated", hitsCurated(ASK_SEEDS[0]));
  check("Bennett seed → curated", hitsCurated(ASK_SEEDS[1]));
  check("St. Charles seed → curated", hitsCurated(ASK_SEEDS[2]));
  check("open-items seed routes to the open mode", /open/i.test(ASK_SEEDS[3]));
  check("Meyer seed → curated", hitsCurated(ASK_SEEDS[4]));

  console.log("mode default");
  check("Mayor mode is the default (operator off, headless)", loadOperatorMode() === false);

  if (failures) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
