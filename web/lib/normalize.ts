// Port of normalize.py — entity normalization must match the values stored in
// poc.email_entities.entity_norm (written by the Python extract step).

const SUFFIX: Record<string, string> = {
  ave: "avenue",
  av: "avenue",
  avenue: "avenue",
  rd: "road",
  road: "road",
  st: "street",
  street: "street",
  blvd: "boulevard",
  boulevard: "boulevard",
  dr: "drive",
  drive: "drive",
  ln: "lane",
  lane: "lane",
  ct: "court",
  court: "court",
  pl: "place",
  place: "place",
  ter: "terrace",
  terr: "terrace",
  terrace: "terrace",
  way: "way",
  hwy: "highway",
  highway: "highway",
  pkwy: "parkway",
  parkway: "parkway",
  cir: "circle",
  circle: "circle",
};

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** "2218 Bohland Ave" -> "2218 bohland avenue"; "St. Charles Rd" -> "st charles road". */
export function normalizeAddress(s: string): string {
  const lowered = s.toLowerCase().replace(/\./g, " ");
  const toks = collapse(lowered).split(" ");
  if (toks.length && SUFFIX[toks[toks.length - 1]]) {
    toks[toks.length - 1] = SUFFIX[toks[toks.length - 1]];
  }
  return collapse(toks.join(" "));
}

/** Lowercase, strip punctuation to spaces, collapse. */
export function normalizeText(s: string): string {
  return collapse(s.toLowerCase().replace(/[^\w\s]/g, " "));
}

export const normalizePerson = normalizeText;
export const normalizeBusiness = normalizeText;
