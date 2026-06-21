import type { StreamKey } from "./types";

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
