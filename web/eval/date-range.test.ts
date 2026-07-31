/*
 * date-range.test.ts — the period a question names.
 *   cd web && npx tsx eval/date-range.test.ts
 *
 * Every miss here is the SAME user-visible bug: the question names a period,
 * nothing parses it, retrieval runs unscoped, and the answer quietly includes
 * mail from years outside the range. "Last month" and "last quarter" both
 * shipped broken that way (RD 2026-07-31), so the whole vocabulary is pinned.
 */
import { rangeFromQuestion } from "../lib/planner";

let failures = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}\n      got  ${g}\n      want ${w}`); }
};
// A Friday in Q3 2026, so "last quarter" is Q2 and "last month" is June.
const NOW = new Date("2026-07-31T00:00:00Z");
const r = (q: string) => rangeFromQuestion(q, NOW);

console.log("period parsing (today = 2026-07-31, Q3)");
check('"last month"',    r("what did we get from Google last month"), { since: "2026-06-01", until: "2026-07-01" });
check('"this month"',    r("spend this month"),                        { since: "2026-07-01" });
check('"last quarter"',  r("what did we spend last quarter"),          { since: "2026-04-01", until: "2026-07-01" });
check('"this quarter"',  r("invoices this quarter"),                   { since: "2026-07-01" });
check('"Q1"',            r("show me Q1 spend"),                        { since: "2026-01-01", until: "2026-04-01" });
check('"Q4 2025" wraps the year', r("Q4 2025 invoices"),               { since: "2025-10-01", until: "2026-01-01" });
check('"this year"',     r("spend this year"),                         { since: "2026-01-01" });
check('"last year"',     r("spend last year"),                         { since: "2025-01-01", until: "2026-01-01" });
check('explicit year',   r("what happened in 2024"),                   { since: "2024-01-01", until: "2025-01-01" });
check('"last 3 months" (whole months, no day overflow)', r("last 3 months of billing"), { since: "2026-04-01" });
check('"last week"',     r("anything from last week"),                 { since: "2026-07-24" });
check('no period named', r("what did Angela say about the shop"),      null);

console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
