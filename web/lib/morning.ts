/*
 * morning.ts — the Chief of Staff "morning briefing" contract + persona config.
 *
 * Client- and server-safe (no server-only imports). The Today hero reads the
 * persona from the Admin config in localStorage and POSTs it to
 * /api/morning-summary; the route (demo or live) returns a MorningSummary the
 * Today screen renders. Voice synthesis is hybrid: a deterministic baseline
 * always renders (keyless), and when an OpenAI key is present the narrative is
 * rewritten in the configured Chief-of-Staff persona.
 */

export type CosTone = "warm" | "formal" | "brisk";

export interface CosPersona {
  mayorName: string;
  greeting: string;      // template; supports {name} and {timeOfDay}
  tone: CosTone;
  instructions: string;  // freeform personality notes, injected into synthesis
}

export const COS_PERSONA_DEFAULT: CosPersona = {
  mayorName: "Mayor Harvey",
  greeting: "Good morning, {name}.",
  tone: "warm",
  instructions: "",
};

export const COS_TONE_PRESETS: Record<CosTone, { label: string; prompt: string }> = {
  warm: { label: "Warm", prompt: "Warm, encouraging, and personable — a trusted chief of staff who's glad to see the mayor. Open with a little optimism, speak in the first person, keep it human and brief." },
  formal: { label: "Formal", prompt: "Professional, measured, and concise. Courteous but businesslike, first person, no flourish." },
  brisk: { label: "Brisk", prompt: "Very short and direct. Lead with the single most important thing, minimal words, no small talk." },
};

const PERSONA_KEY = "bw-admin-config-v1"; // stored under AdminState.cos

/** Read the persona from the Admin config (localStorage); defaults off-screen/server. */
export function getCosPersona(): CosPersona {
  if (typeof window === "undefined") return COS_PERSONA_DEFAULT;
  try {
    const raw = window.localStorage.getItem(PERSONA_KEY);
    const cos = raw ? (JSON.parse(raw).cos as Partial<CosPersona> | undefined) : undefined;
    return { ...COS_PERSONA_DEFAULT, ...(cos ?? {}) };
  } catch { return COS_PERSONA_DEFAULT; }
}

/** Fill the greeting template. timeOfDay derives from the hour when provided. */
export function fillGreeting(p: CosPersona, hour?: number): string {
  const part = hour == null ? "morning" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return (p.greeting || COS_PERSONA_DEFAULT.greeting)
    .replace(/\{name\}/g, p.mayorName || "Mayor")
    .replace(/\{timeOfDay\}/g, part);
}

// ── the briefing payload the Today hero renders ──
export interface PressingItem {
  title: string; why: string; tag: string; messageId?: string;
}
export interface BriefCalendarItem {
  id: string; title: string; when: string; source?: "gov" | "gmail";
}
export interface AgentNote { name: string; note: string; when?: string; }

export interface Weather { icon: string; tempF: number; label: string }

export interface MorningSummary {
  greeting: string;
  narrative: string;        // the CoS voice — "what's happened, what's new, what's important" (≤4 lines)
  pressing: PressingItem[];
  calendar: BriefCalendarItem[];
  agents: AgentNote[];
  counts: { needYou: number; eventsToday: number };
  weather: Weather | null;  // at-a-glance morning weather
  onThisDay: string | null; // "on this day in history" one-liner
  tone: CosTone;
  live: boolean;            // true if OpenAI voiced the narrative
  generatedAt: string;
}
