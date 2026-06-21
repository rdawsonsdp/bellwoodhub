// Recurring cast + distinctive streets we auto-detect in a question, mirroring
// query.py's auto_filters(). The order matches PERSONAS iteration order so the
// first match wins identically.

export const KNOWN_PEOPLE: string[] = [
  "Gloria Bennett",
  "Marcus Webb",
  "Diane Pawlak",
  "Patrice Coleman",
  "Henryk Kowalski",
  "Denise Carter",
  "Ray Delgado",
  "Eleanor Meyer",
  "Nick Brennan",
  "Marisol Vega",
  "Carl Jansen",
];

export const AUTO_STREETS: string[] = [
  "Bohland Ave",
  "Frederick Ave",
  "St. Charles Rd",
  "Mannheim Rd",
  "25th Ave",
  "19th Ave",
  "Eastern Ave",
  "Bellwood Ave",
  "Washington Blvd",
  "Granville Ave",
  "Hirsch Ave",
  "Englewood Ave",
  "50th Ave",
  "Marshall Ave",
  "Geneva Ave",
  "Rice Ave",
  "Harvard Ave",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isKnownPerson(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return KNOWN_PEOPLE.some((p) => p.toLowerCase() === n);
}

export interface AutoFilterResult {
  person?: string;
  address?: string;
  auto: { person?: string; address?: string }; // only what we inferred
}

/**
 * Detect a known constituent name or a distinctive street in the question and
 * apply it as a person/address filter — unless the caller already set one.
 */
export function autoFilters(
  question: string,
  person?: string,
  address?: string,
): AutoFilterResult {
  const auto: { person?: string; address?: string } = {};
  let p = person;
  let a = address;

  if (!p) {
    const ql = question.toLowerCase();
    for (const name of KNOWN_PEOPLE) {
      if (ql.includes(name.toLowerCase())) {
        p = name;
        auto.person = name;
        break;
      }
    }
  }

  if (!a) {
    for (const st of AUTO_STREETS) {
      const core = st.split(" ").slice(0, -1).join(" "); // drop the suffix token
      const re = new RegExp("\\b" + escapeRegExp(core) + "\\b", "i");
      if (re.test(question)) {
        a = st;
        auto.address = st;
        break;
      }
    }
  }

  return { person: p, address: a, auto };
}
