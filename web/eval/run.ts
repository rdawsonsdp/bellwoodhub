/*
 * Eval harness for the canonical planner. Run from web/ with env loaded and the
 * canonical store populated (RETRIEVAL_BACKEND not required — it calls canonical
 * directly):
 *
 *   set -a; source .env.local; set +a
 *   npx tsx eval/run.ts
 *
 * Measures, against the known answer key: retrieval completeness (expected
 * streams/anchors present), grounding (every [n] resolves), gap-honesty (the
 * deliberately-absent question returns "no records" with zero citations), and
 * the cross-source proof (planner spans more streams than a flat-kNN baseline).
 * Exit code 0 iff every question passes — gate autonomy increases on this.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ask } from "../lib/retrieval-canonical";
import { flatSearch, resolveAnchors } from "../lib/planner";
import { citationValidity, streamsOf, statesGap } from "./metrics";

interface Q {
  id: string;
  question: string;
  expectAnchorType?: string;
  minSources?: number;
  expectMode?: string;
  expectStreams?: string[];
  mustStateGap?: boolean;
  beatsFlatBaseline?: boolean;
}

async function main() {
  const file = join(process.cwd(), "eval", "questions.jsonl");
  const qs: Q[] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  let pass = 0;

  for (const q of qs) {
    const checks: [string, boolean][] = [];
    const r = await ask(q.question);
    const sources = r.sources ?? [];

    if (q.expectMode) checks.push([`mode=${q.expectMode}`, r.mode === q.expectMode]);
    if (q.minSources != null) checks.push([`sources>=${q.minSources}`, sources.length >= q.minSources]);
    if (q.expectAnchorType) {
      const anchors = await resolveAnchors(q.question);
      checks.push([`anchor:${q.expectAnchorType}`, anchors.some((a) => a.aliasType === q.expectAnchorType)]);
    }
    if (q.expectStreams) {
      const have = streamsOf(sources);
      checks.push([`streams⊇${q.expectStreams.join("+")}`, q.expectStreams.every((s) => have.has(s))]);
    }
    if (q.mustStateGap) {
      checks.push(["gap stated (0 sources + 'no record')", sources.length === 0 && statesGap(r.answer ?? "")]);
    }
    if (r.answer && !q.mustStateGap) {
      checks.push(["citations valid ≥0.98", citationValidity(r.answer, sources.length) >= 0.98]);
    }
    if (q.beatsFlatBaseline) {
      const flat = await flatSearch(q.question);
      const p = streamsOf(sources).size;
      const f = streamsOf(flat).size;
      checks.push([`planner streams(${p}) > flat-kNN(${f})`, p > f]);
    }

    const ok = checks.every((c) => c[1]);
    if (ok) pass++;
    console.log(`\n${ok ? "PASS" : "FAIL"}  ${q.id}`);
    for (const [name, v] of checks) console.log(`   ${v ? "✓" : "✗"} ${name}`);
  }

  console.log(`\n${pass}/${qs.length} questions passed.`);
  process.exit(pass === qs.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
