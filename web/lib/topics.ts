import type { StreamKey } from "./types";
import { DOMAIN_AGENTS } from "./domain-agents";

/**
 * Derive a display "source stream" from a message's topic + sender — mirrors the
 * SQL CASE in lib/sql.ts so client and server agree.
 */
export function deriveStream(
  topic: string | null,
  fromEmail: string | null,
): StreamKey {
  const e = (fromEmail || "").toLowerCase();
  if (topic === "public_safety") return "Police";
  if (topic === "fire_ems") return "Fire/EMS";
  if (e.endsWith("illinois-demo.gov") || e.endsWith("cookcounty-demo.gov"))
    return "Regional";
  if (e.endsWith("@bellwood-demo.gov")) return "Interdepartmental";
  if (topic === "business") return "Business";
  if (topic === "foia") return "Civic/FOIA";
  return "Resident";
}

// ── Domain-agent routing (multi-label) ───────────────────────────────────────
// deriveStream stays the single-label display dimension; deriveDomains is the
// NEW multi-label mapping onto the domain-agent cabinet (lib/domain-agents.ts).
// One message can belong to several agents; dedup happens at the presentation
// layer (group by threadId), never here.

/** Interdepartmental senders that route to the council/records desk. The corpus
 *  has no clerk@/agenda@ accounts yet; the pattern covers real ones when a live
 *  connector lands, and `foia` topic catches the FOIA officer regardless. */
const COUNCIL_LOCALPART = /(clerk|agenda|council|board)/;

/** Calendar/commitment topics → schedule agent. No such topic exists in the
 *  current 13-slug vocabulary (config.py TOPICS) — the schedule agent's real
 *  slice comes from the commitments/events provider — but the hook is here so
 *  real calendar mail routes correctly the day a connector emits it. */
const CALENDAR_TOPICS = new Set(["meeting", "meetings", "calendar", "scheduling"]);

const STREAM_TO_AGENT: Partial<Record<StreamKey, string>> = {
  Police: "police",
  "Fire/EMS": "fire",
  "Civic/FOIA": "council",
  Resident: "constituent",
  Regional: "constituent",
  Business: "harbor-wellness", // walled — presentation confines it to its own card
};

/**
 * Map a message to the domain agents whose desks it lands on (multi-label).
 * Starts from deriveStream's single label, adds sender-scoped council routing,
 * calendar topics, and entity-scope hits (a message referencing an agent's
 * scoped entity belongs to that agent too). Returns agent keys in cabinet
 * order, deduped; may be empty (non-council interdepartmental traffic stays
 * on Operator surfaces only).
 */
export function deriveDomains(
  topic: string | null,
  fromEmail: string | null,
  entityIds?: string[],
): string[] {
  const keys = new Set<string>();
  const stream = deriveStream(topic, fromEmail);

  const byStream = STREAM_TO_AGENT[stream];
  if (byStream) keys.add(byStream);

  // Interdepartmental mail reaches the Mayor's cabinet only via the records desk.
  if (stream === "Interdepartmental") {
    const local = (fromEmail || "").toLowerCase().split("@")[0];
    if (topic === "foia" || COUNCIL_LOCALPART.test(local)) keys.add("council");
  }

  if (topic && CALENDAR_TOPICS.has(topic)) keys.add("schedule");

  // Entity-scope hits: narrow agents own every message that references their entity.
  if (entityIds?.length) {
    for (const a of DOMAIN_AGENTS) {
      if (a.scopeEntities?.some((id) => entityIds.includes(id))) keys.add(a.key);
    }
  }

  // Cabinet order, so multi-label chips render consistently everywhere.
  const order = new Map(DOMAIN_AGENTS.map((a, i) => [a.key, i]));
  return [...keys].sort((x, y) => (order.get(x) ?? 99) - (order.get(y) ?? 99));
}
