/*
 * event-conflicts.test.ts — the overlap rule for the Dashboard's
 * "Today & coming up" panel.
 *
 *   cd web && npx tsx eval/event-conflicts.test.ts
 *
 * Rules under test: timed events overlap when their intervals intersect;
 * touching endpoints do not overlap; all-day events never conflict with timed
 * events; a missing end time is treated as a 60-minute default.
 */
import { markConflicts, type ConflictInput } from "../lib/event-conflicts";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const ev = (id: string, start: string, end: string | null, allDay = false): ConflictInput =>
  ({ id, date: start, endDate: end, allDay });

function main() {
  console.log("overlap detection");

  const overlapping = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
    ev("b", "2026-07-30T14:30:00Z", "2026-07-30T15:30:00Z"),
  ]);
  check("intersecting intervals conflict both ways",
    overlapping.get("a")?.includes("b") === true && overlapping.get("b")?.includes("a") === true);

  const touching = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
    ev("b", "2026-07-30T15:00:00Z", "2026-07-30T16:00:00Z"),
  ]);
  check("back-to-back events do not conflict", touching.size === 0, `got ${touching.size}`);

  const separate = markConflicts([
    ev("a", "2026-07-30T09:00:00Z", "2026-07-30T10:00:00Z"),
    ev("b", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
  ]);
  check("disjoint events do not conflict", separate.size === 0);

  const allDay = markConflicts([
    ev("a", "2026-07-30T00:00:00Z", null, true),
    ev("b", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
  ]);
  check("all-day never conflicts with a timed event", allDay.size === 0, `got ${allDay.size}`);

  const noEnd = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", null),
    ev("b", "2026-07-30T14:30:00Z", "2026-07-30T15:30:00Z"),
  ]);
  check("missing end time defaults to 60 minutes and still conflicts",
    noEnd.get("a")?.includes("b") === true);

  const three = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", "2026-07-30T17:00:00Z"),
    ev("b", "2026-07-30T14:30:00Z", "2026-07-30T15:00:00Z"),
    ev("c", "2026-07-30T16:00:00Z", "2026-07-30T16:30:00Z"),
  ]);
  check("one long event conflicts with both overlappers",
    three.get("a")?.length === 2 && three.get("b")?.length === 1 && three.get("c")?.length === 1,
    JSON.stringify([...three]));

  check("empty input is empty output", markConflicts([]).size === 0);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
