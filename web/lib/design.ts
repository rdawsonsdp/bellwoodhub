import type { CSSProperties } from "react";
import type { StreamKey } from "./types";

// ── Brand palette (from the Claude Design prototype + SDP tokens) ───────────
export const C = {
  navy: "#0b2e63",
  gold: "#e3a92c",
  blue: "#0a66ff",
  blueDark: "#0851cc",
  blueLightest: "#e6efff",
  blueLighter: "#cee0ff",
  green: "#00b388",
  greenDark: "#00916e",
  violet: "#7b3f98",
  orange: "#ff8a00",
  orangeDark: "#cc6e00",
  bg: "#eef1f5",
  ink: "#1e1c20",
  ink2: "#3a383d",
  muted: "#6b6a6e",
  muted2: "#9a999c",
  muted3: "#b0afb2",
  line: "rgba(6,3,8,.12)",
  line2: "rgba(6,3,8,.07)",
  white: "#fff",
} as const;

export const FONT_BODY = "'Inter',system-ui,sans-serif";
export const FONT_HEAD = "'Sora',sans-serif";

// ── Topic taxonomy → colored chip (text color + tint bg) ────────────────────
export const TOPICS: Record<string, { label: string; fg: string; bg: string }> = {
  roads: { label: "Roads", fg: "#504e52", bg: "#f0f0f0" },
  water_billing: { label: "Water billing", fg: "#0851cc", bg: "#e6efff" },
  drainage: { label: "Drainage", fg: "#0a66ff", bg: "#e6efff" },
  code_enforcement: { label: "Code enforcement", fg: "#623279", bg: "#f1ebf4" },
  permits: { label: "Permits", fg: "#623279", bg: "#f1ebf4" },
  sanitation: { label: "Sanitation", fg: "#008f6c", bg: "#e5f7f3" },
  parks_events: { label: "Parks & events", fg: "#008f6c", bg: "#e5f7f3" },
  business: { label: "Business", fg: "#cc6e00", bg: "#fff3e5" },
  foia: { label: "FOIA", fg: "#504e52", bg: "#f0f0f0" },
  complaint: { label: "Complaint", fg: "#b3261e", bg: "#fdecea" },
  thanks: { label: "Thanks", fg: "#008f6c", bg: "#e5f7f3" },
  public_safety: { label: "Public safety", fg: "#7b3f98", bg: "#f1ebf4" },
  fire_ems: { label: "Fire / EMS", fg: "#cc6e00", bg: "#fff3e5" },
};

export function topicMeta(key: string | null | undefined) {
  return (key && TOPICS[key]) || { label: key || "—", fg: "#504e52", bg: "#f0f0f0" };
}

export function topicChipStyle(key: string | null | undefined): CSSProperties {
  const t = topicMeta(key);
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    color: t.fg,
    background: t.bg,
  };
}

// ── Source streams → color + Material Symbol icon ───────────────────────────
// Keyed by the StreamKey labels the backend emits.
export const STREAM_META: Record<StreamKey, { label: string; color: string; icon: string }> = {
  Resident: { label: "Resident", color: "#0a66ff", icon: "person" },
  Interdepartmental: { label: "Interdept", color: "#504e52", icon: "groups" },
  Police: { label: "Police report", color: "#7b3f98", icon: "local_police" },
  "Fire/EMS": { label: "Fire / EMS", color: "#ff8a00", icon: "fire_truck" },
  Business: { label: "Business", color: "#00b388", icon: "storefront" },
  "Civic/FOIA": { label: "Civic / FOIA", color: "#828183", icon: "account_balance" },
  Regional: { label: "Regional", color: "#828183", icon: "account_balance" },
};

export function streamMeta(key: string | null | undefined) {
  return (
    (key && STREAM_META[key as StreamKey]) || {
      label: key || "Source",
      color: "#828183",
      icon: "mail",
    }
  );
}

// ── The 7 demo questions (chips → full question text) ───────────────────────
export const CHIPS: { label: string; text: string }[] = [
  {
    label: "Drainage history at the property on Bohland Ave",
    text: "What's the full history on the drainage and flooding problem at the property on Bohland Ave?",
  },
  {
    label: "Our history with Gloria Bennett + how to handle her latest email",
    text: "What's our history with Gloria Bennett, and how should I handle her latest email?",
  },
  {
    label: "Mrs. Meyer's ongoing basement flooding on Frederick Ave",
    text: "What's the full history of Eleanor Meyer's basement flooding at 1733 Frederick Ave, and where do things stand now?",
  },
  {
    label: "Noise & operating-hours complaints from St. Charles Rd businesses",
    text: "How have we handled noise and operating-hours complaints from businesses on St. Charles Road?",
  },
  {
    label: "What's still open right now that I haven't resolved",
    text: "What's still open right now that I haven't resolved?",
  },
  {
    label: "Summary of everything on flooding & drainage this spring",
    text: "Summarize everything related to flooding and drainage this spring.",
  },
  {
    label: "Who has emailed me the most, and what about",
    text: "Who has emailed me the most, and what about?",
  },
  {
    label: "Cross-reference police + fire + resident complaints on St. Charles Rd bars",
    text: "Cross-reference the police and fire reports with resident complaints about the St. Charles Road bars — what's the full picture across every source?",
  },
];

// Topic options for the Refine dropdown.
export const TOPIC_OPTIONS = Object.entries(TOPICS).map(([key, t]) => ({
  key,
  label: t.label,
}));
