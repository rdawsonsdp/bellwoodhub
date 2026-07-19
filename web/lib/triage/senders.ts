/*
 * senders.ts — the tenant's "people whose mail matters" list.
 *
 * DECISION (RD, 2026-07-19): the list is EDITABLE IN-APP so the exec can update
 * it when a developer isn't available — a new council member is elected, a new
 * catering contact comes on. So it lives in a table (app.important_senders), not
 * a config file. But it ships SEEDED with sensible per-tenant defaults so the
 * ranking works on day one; the exec then tunes it.
 *
 * Defensibility: an entry is `{ label, match }` — a name the exec recognizes and
 * an email or domain fragment. Never a regex the exec can't read.
 */

export interface ImportantSender {
  label: string; // the name the exec recognizes: "Village Manager"
  match: string; // email or lowercase domain fragment: "@villageofbellwood.gov"
}

/** Per-tenant defaults, seeded into app.important_senders on first pass if the
 *  tenant has no rows yet. Kept short and recognizable. */
export const SENDER_SEEDS: Record<string, ImportantSender[]> = {
  bellwood: [
    { label: "Village staff (any @villageofbellwood.gov)", match: "@villageofbellwood.gov" },
    { label: "Cook County", match: "@cookcountyil.gov" },
    { label: "State of Illinois", match: "@illinois.gov" },
  ],
  brownsugar: [
    { label: "Wholesale & catering inquiries", match: "wholesale" },
    { label: "Orders", match: "orders@" },
  ],
};

/** Does this sender match the tenant's important list? Case-insensitive
 *  substring on the address — an entry like "@villageofbellwood.gov" matches any
 *  address in that domain; "welch@" matches that person. Returns the matching
 *  entry's label (for the reason template) or null. */
export function matchImportant(
  fromEmail: string | null,
  list: ImportantSender[],
): ImportantSender | null {
  if (!fromEmail) return null;
  const addr = fromEmail.toLowerCase();
  return list.find((s) => addr.includes(s.match.toLowerCase())) ?? null;
}
