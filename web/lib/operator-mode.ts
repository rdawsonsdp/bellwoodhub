/*
 * operator-mode.ts — the Mayor/Operator mode switch (Phase 4 nav collapse).
 *
 * Mayor mode (default, and the deployed demo's default): exactly three
 * destinations — Wall · Queue · Ask. Everything else (Emails raw list,
 * Calendar, History browse, Sources, Staff Agents roster, Admin, legacy
 * Approvals) is Operator territory: relocated, never deleted.
 *
 * Persisted per device in localStorage; toggled from the profile menu.
 */
export const OPERATOR_KEY = "bw-operator-mode";

export function loadOperatorMode(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(OPERATOR_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveOperatorMode(on: boolean): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(OPERATOR_KEY, on ? "1" : "0");
  } catch {
    /* private mode — the toggle just won't persist */
  }
}
