/*
 * agent-schedule.test.ts — the "next run" clock on the Dashboard brief.
 *   cd web && npx tsx eval/agent-schedule.test.ts
 * Window is "0 12-22 * * *" UTC: top of every hour, 12:00–22:00 inclusive.
 */
import { nextAgentRun } from "../lib/agent-run";

let failures = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const at = (iso: string) => nextAgentRun(new Date(iso)).toISOString();

console.log("next scheduled cabinet pass");
check("before the window → first run today", at("2026-07-30T03:14:00Z") === "2026-07-30T12:00:00.000Z", at("2026-07-30T03:14:00Z"));
check("inside the window → next top of hour", at("2026-07-30T14:30:00Z") === "2026-07-30T15:00:00.000Z", at("2026-07-30T14:30:00Z"));
check("exactly on a run → the following hour", at("2026-07-30T14:00:00Z") === "2026-07-30T15:00:00.000Z", at("2026-07-30T14:00:00Z"));
check("last run of the day → tomorrow's first", at("2026-07-30T22:00:00Z") === "2026-07-31T12:00:00.000Z", at("2026-07-30T22:00:00Z"));
check("after the window → tomorrow's first", at("2026-07-30T23:41:00Z") === "2026-07-31T12:00:00.000Z", at("2026-07-30T23:41:00Z"));
check("just before last run → the last run", at("2026-07-30T21:59:00Z") === "2026-07-30T22:00:00.000Z", at("2026-07-30T21:59:00Z"));
check("rolls the month", at("2026-07-31T23:00:00Z") === "2026-08-01T12:00:00.000Z", at("2026-07-31T23:00:00Z"));

console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
