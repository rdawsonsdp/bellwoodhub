/*
 * ask-agent.test.ts — does the agentic Ask reproduce the Claude.ai answer?
 *   cd web && npx tsx eval/ask-agent.test.ts
 * Ground truth (Claude.ai, same model, via MCP): a month-by-month Google Cloud
 * Platform table, Jan-Jul 2026, Jan = $44.26, total $542.61.
 */
import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
let failures = 0;
const check = (n: string, c: boolean, d?: string) => {
  if (c) console.log(`  ✓ ${n}`); else { failures++; console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`); }
};
const Q = "I want a complete break down of my Google Spend this year. Break it down by month in a table.";

(async () => {
  const { askAgent } = await import("../lib/ask-agent");
  const t0 = Date.now();
  const r = await askAgent(Q);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n--- ${r.iterations} iterations · ${secs}s · ${r.inputTokens} in / ${r.outputTokens} out ---`);
  console.log("SEARCHES IT CHOSE:");
  r.trace.forEach((t) => console.log(`   ${t.tool}(${t.input.slice(0, 66)}) -> ${t.got}`));
  console.log("\n" + r.answer.slice(0, 1800) + "\n");

  console.log("assertions");
  check("it searched more than once (this is the whole point)", r.trace.length >= 2, `${r.trace.length} tool calls`);
  check("it gathered real sources", r.sources.length >= 5, `${r.sources.length}`);
  const rows = r.answer.split("\n").filter((l) => l.trim().startsWith("|"));
  check("answer contains a markdown table", rows.length >= 4, `${rows.length} table lines`);

  // GROUND TRUTH — the figures Claude.ai produced for this same question against
  // the same Gmail account, via its own MCP connector. This app must match it
  // figure for figure; anything less is a regression against a known-good answer.
  const TRUTH: [string, string][] = [
    ["January", "44.26"], ["February", "51.14"], ["March", "40.30"], ["April", "136.95"],
    ["May", "193.71"], ["June", "33.82"], ["July", "42.43"], ["Total", "542.61"],
  ];
  const missing = TRUTH.filter(([, amt]) => !new RegExp(amt.replace(".", "\\.")).test(r.answer));
  check("EVERY Claude.ai figure is reproduced", missing.length === 0,
    missing.length ? `missing: ${missing.map(([m, a]) => `${m} $${a}`).join(", ")}` : "");
  // Accept "Jan" or "January" — the figures are what must be exact, not the
  // label format the model happens to choose for the table.
  const monthsHit = TRUTH.slice(0, 7).filter(([m]) => new RegExp(m.slice(0, 3), "i").test(r.answer));
  check("every month is present", monthsHit.length === 7, `${monthsHit.length}/7`);
  check("the April split is preserved ($36.95 + $100.00)",
    /36\.95/.test(r.answer) && /100\.00/.test(r.answer), "April detail lost");

  console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("harness error:", e); process.exit(1); });
