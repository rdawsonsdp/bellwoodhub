/*
 * queue-state.ts — the Queue's client-side state machine (DEMO persistence).
 *
 * Queue position, revisions-in-flight, and skips live in localStorage
 * ("bw-queue-state") keyed by item id, so the Mayor can be interrupted
 * mid-queue and resume exactly where he left off after navigation, refresh,
 * or an app switch (invariant 7). Live mode later moves this server-side.
 *
 * The ordering/diff helpers are pure functions (no storage access) so the
 * eval harness can prove the state machine in Node.
 */
export type QueueItemState = "pending" | "revising" | "approved" | "skipped";

export interface ItemState {
  state: QueueItemState;
  revision?: string; // the Mayor's fix-it note (visible on the draft)
  revised?: boolean; // a revision pass completed — label + back to top
}

export interface QueueLocal {
  states: Record<string, ItemState>;
  skippedOrder: string[]; // oldest skip first — skipped cards sit at the bottom
  lastSeenIds: string[]; // for the "while you were out" line
}

export const EMPTY_QUEUE_LOCAL: QueueLocal = { states: {}, skippedOrder: [], lastSeenIds: [] };

const KEY = "bw-queue-state";

export function loadQueueLocal(): QueueLocal {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...EMPTY_QUEUE_LOCAL, states: {}, skippedOrder: [], lastSeenIds: [] };
    const parsed = JSON.parse(raw) as Partial<QueueLocal>;
    return {
      states: parsed.states ?? {},
      skippedOrder: parsed.skippedOrder ?? [],
      lastSeenIds: parsed.lastSeenIds ?? [],
    };
  } catch {
    return { ...EMPTY_QUEUE_LOCAL, states: {}, skippedOrder: [], lastSeenIds: [] };
  }
}

export function saveQueueLocal(local: QueueLocal): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    /* private mode etc. — the queue still works, it just won't resume */
  }
}

// ── pure state machine ───────────────────────────────────────────────────────

export const itemState = (local: QueueLocal, id: string): ItemState =>
  local.states[id] ?? { state: "pending" };

function withState(local: QueueLocal, id: string, next: ItemState): QueueLocal {
  const skippedOrder =
    next.state === "skipped"
      ? local.skippedOrder.includes(id)
        ? local.skippedOrder
        : [...local.skippedOrder, id]
      : local.skippedOrder.filter((x) => x !== id);
  return { ...local, states: { ...local.states, [id]: next }, skippedOrder };
}

export const skipItem = (local: QueueLocal, id: string): QueueLocal =>
  withState(local, id, { ...itemState(local, id), state: "skipped" });

export const approveItem = (local: QueueLocal, id: string): QueueLocal =>
  withState(local, id, { ...itemState(local, id), state: "approved" });

/** Undo within the toast window — restore the exact prior state. */
export const restoreItem = (local: QueueLocal, id: string, prev: ItemState): QueueLocal =>
  withState(local, id, prev);

export const startRevision = (local: QueueLocal, id: string, note: string): QueueLocal =>
  withState(local, id, { state: "revising", revision: note, revised: false });

/** The simulated (demo) revision pass finished: back to pending, labeled
 *  "revised", at the top of the queue. */
export const completeRevision = (local: QueueLocal, id: string): QueueLocal => {
  const cur = itemState(local, id);
  return withState(local, id, { ...cur, state: "pending", revised: true });
};

/**
 * Working order: revised cards first (they came back for re-review), then
 * revising (in flight), then untouched pending in provider order, then
 * skipped at the bottom (oldest skip first — skipped is never deleted).
 * Approved items drop out entirely.
 */
export function orderQueue<T extends { id: string }>(items: T[], local: QueueLocal): T[] {
  const st = (i: T) => itemState(local, i.id);
  const revised = items.filter((i) => st(i).state === "pending" && st(i).revised);
  const revising = items.filter((i) => st(i).state === "revising");
  const pending = items.filter((i) => st(i).state === "pending" && !st(i).revised);
  const skipped = items
    .filter((i) => st(i).state === "skipped")
    .sort((a, b) => local.skippedOrder.indexOf(a.id) - local.skippedOrder.indexOf(b.id));
  return [...revised, ...revising, ...pending, ...skipped];
}

/** "While you were out": how many queue items are new since the last visit. */
export function newSinceLastVisit(currentIds: string[], lastSeenIds: string[]): number {
  if (!lastSeenIds.length) return 0; // first visit isn't "while you were out"
  const seen = new Set(lastSeenIds);
  return currentIds.filter((id) => !seen.has(id)).length;
}
