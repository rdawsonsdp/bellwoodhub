// Email tab categories — the agent sorts & labels each email into one of these.
// Which tabs show is configurable (persisted per device; Admin → Email Tabs).
// "Inbox" (all) is always shown.
const KEY = "bw-email-tabs";

export const EMAIL_CATEGORIES: { id: string; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "important", label: "Important" },
  { id: "social", label: "Social" },
  { id: "spam", label: "Spam" },
];
const ALL = EMAIL_CATEGORIES.map((c) => c.id);

export function getEnabledTabs(): string[] {
  if (typeof window === "undefined") return ALL;
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "null");
    return Array.isArray(v) ? ALL.filter((id) => v.includes(id)) : ALL;
  } catch {
    return ALL;
  }
}

export function setEnabledTabs(ids: string[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}
