/*
 * agent-seen.ts — the cabinet's notification memory (client).
 *
 * A card is "unseen" when its latest run is newer than the last time the
 * Mayor opened that agent's digest. Opening the sheet marks it seen. This is
 * the anticipation loop: desks report in on the hourly cadence, badges
 * accumulate between visits, and opening the box clears them.
 *
 * Per-device localStorage now; moves to app.user_state with the rest of the
 * cross-device state (GO_LIVE_PLAN L2.3).
 */
export type SeenMap = Record<string, string>; // agentKey -> freshAt ISO last seen

const KEY = "bw-agent-seen";

export function loadSeen(): SeenMap {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

export function markSeen(seen: SeenMap, agentKey: string, freshAt: string): SeenMap {
  const next = { ...seen, [agentKey]: freshAt > (seen[agentKey] ?? "") ? freshAt : seen[agentKey] };
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* badge just won't persist */
  }
  return next;
}

export const isUnseen = (seen: SeenMap, agentKey: string, freshAt: string): boolean =>
  freshAt > (seen[agentKey] ?? "");
