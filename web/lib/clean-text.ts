/*
 * clean-text.ts — slim TS port of the pipeline's text hygiene (stage 5),
 * pulled forward 2026-07-03 when real newsletters hit the UI: marketing
 * mail pads its preview with INVISIBLE Unicode (zero-width joiners, soft
 * hyphens — the "͏ ‌ ­" soup) and its text/plain part is mostly tracking
 * URLs. Ingest runs cleanEmailText on every body; snippetText additionally
 * de-noises for one-line previews (URLs and link-only lines dropped there
 * ONLY — the stored body keeps real links, a reader may need them).
 */

// Invisible/formatting characters that carry no meaning for a reader:
// soft hyphen, combining grapheme joiner, zero-width space/joiners, word
// joiner, BOM, directional marks.
const INVISIBLES = /[­͏​‌‍‎‏⁠﻿]/g;

/** Body hygiene applied at ingest: strip invisible padding, normalize
 *  newlines, collapse runs of blank lines and repeated spaces. */
export function cleanEmailText(raw: string): string {
  return raw
    .replace(INVISIBLES, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{3,}/g, " ")
    .trim();
}

// Preview-only noise: bare URLs, "View in browser / View image (...)" lines,
// divider runs. Applied to snippets, never to the stored body.
const URL = /\(?https?:\/\/\S+\)?/g;
const LINK_LINE = /^\s*(view (in browser|image|online)|unsubscribe|manage preferences)\b.*$/gim;
const DIVIDERS = /^[\s\-_=~*·•]{4,}$/gm;

/** One-line preview text for inbox rows and cards. */
export function snippetText(raw: string, max = 160): string {
  const s = cleanEmailText(raw)
    .replace(LINK_LINE, "")
    .replace(URL, "")
    .replace(DIVIDERS, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
