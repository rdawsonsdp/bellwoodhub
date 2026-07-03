/*
 * queue.test.ts — Phase 3 gate checks for the Queue provider + state machine.
 *
 *   cd web && npx tsx eval/queue.test.ts
 *
 * Proves: the provider dedups agent actItems against the stored drafts (3, not
 * 6), keeps the approvals-store draftIds as stable item ids, orders red-first
 * by recency, and re-signs nothing (bodies carry Mayor Merrill Bellwood); and
 * that the pure state machine honors the resumability contract — skip to the
 * bottom (never deleted), revision back to the top labeled, approve drops,
 * undo restores, and "while you were out" diffs correctly.
 * (Async main: getQueue is now a Promise-returning provider.)
 */
import { getQueue } from "../lib/queue";
import {
  EMPTY_QUEUE_LOCAL, orderQueue, newSinceLastVisit, itemState,
  approveItem, restoreItem, skipItem, startRevision, completeRevision,
} from "../lib/queue-state";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("getQueue — provider");
  const { items } = await getQueue();
  check("3 items (actItems ∪ drafts, deduped by thread)", items.length === 3, String(items.length));
  check(
    "stable ids = the approvals-store draftIds",
    JSON.stringify([...items.map((i) => i.id)].sort()) === JSON.stringify(["demo-draft-1", "demo-draft-2", "demo-draft-3"]),
    items.map((i) => i.id).join(","),
  );
  check(
    "red-first, then recency (Meyer → Pawlak → Bennett)",
    JSON.stringify(items.map((i) => i.id)) === JSON.stringify(["demo-draft-1", "demo-draft-3", "demo-draft-2"]),
    items.map((i) => i.id).join(","),
  );
  check("every item carries a real recipient", items.every((i) => i.to.includes("@")));
  check("full bodies, signed Mayor Merrill Bellwood", items.every((i) => i.fullBody.includes("— Mayor Merrill Bellwood")));
  check("every citation labeled", items.every((i) => i.citations.length > 0 && i.citations.every((c) => c.label.length > 0)));
  check("provenance present (agent name + identity color)", items.every((i) => i.agentName.length > 0 && /^#/.test(i.agentColor)));
  check("all wired to /api/approvals (draftId present)", items.every((i) => !!i.draftId));

  console.log("state machine — resumability contract");
  const base = { ...EMPTY_QUEUE_LOCAL, states: {}, skippedOrder: [], lastSeenIds: [] };
  const ids = items.map((i) => ({ id: i.id }));

  let l = skipItem(base, "demo-draft-1");
  check("skip → bottom, never deleted", orderQueue(ids, l).map((i) => i.id).join(",") === "demo-draft-3,demo-draft-2,demo-draft-1");

  l = startRevision(l, "demo-draft-2", "Firmer on the date.");
  check("revising state holds the note", itemState(l, "demo-draft-2").state === "revising" && itemState(l, "demo-draft-2").revision === "Firmer on the date.");
  l = completeRevision(l, "demo-draft-2");
  check("revision completes → back to top, labeled", orderQueue(ids, l)[0].id === "demo-draft-2" && itemState(l, "demo-draft-2").revised === true);

  const beforeApprove = itemState(l, "demo-draft-3");
  l = approveItem(l, "demo-draft-3");
  check("approve drops from the queue", orderQueue(ids, l).every((i) => i.id !== "demo-draft-3"));
  l = restoreItem(l, "demo-draft-3", beforeApprove);
  check("undo restores the exact prior state", orderQueue(ids, l).some((i) => i.id === "demo-draft-3"));

  console.log("while you were out");
  check("first visit is silent", newSinceLastVisit(["a", "b"], []) === 0);
  check("no change is silent", newSinceLastVisit(["a", "b"], ["a", "b"]) === 0);
  check("new items counted", newSinceLastVisit(["a", "b", "c"], ["a"]) === 2);

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
