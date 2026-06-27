// Design tokens for "Mayor's AI Chief of Staff — Desktop", ported from the
// Claude Design prototype. Now THEMEABLE: every value is a CSS custom property
// resolved at runtime from the active [data-theme] (see app/globals.css). The
// palette swaps live from the Admin → Appearance panel. `--ink` carries the
// overlay channel (255,255,255 on dark themes, a dark slate on light) so the
// glassy surfaces invert correctly.
import type { CSSProperties } from "react";

/** Palette — CSS variables, themed by [data-theme] in globals.css. */
export const C = {
  bgBody: "var(--c-bgbody)",
  text: "var(--c-text)",
  text2: "var(--c-text2)",
  text3: "var(--c-text3)",
  muted: "var(--c-muted)",
  dim: "var(--c-dim)",
  dim2: "var(--c-dim2)",
  gold: "var(--c-gold)",
  goldHi: "var(--c-goldhi)",
  goldLo: "var(--c-goldlo)",
  blue: "var(--c-blue)",
  green: "var(--c-green)",
  greenText: "var(--c-greentext)",
  orange: "var(--c-orange)",
  orangeText: "var(--c-orangetext)",
  red: "var(--c-red)",
  redText: "var(--c-redtext)",
  purple: "var(--c-purple)",
  purpleText: "var(--c-purpletext)",
  line: "rgba(var(--ink),.07)",
  line2: "rgba(var(--ink),.06)",
  cardBd: "var(--c-cardbd)",
} as const;

/** Fonts (loaded via the /chief layout <link>). */
export const FONT = {
  sans: "'Public Sans',system-ui,sans-serif",
  serif: "'Newsreader',serif",
  mono: "'JetBrains Mono',monospace",
} as const;

export const APP_BG = "var(--c-appbg)";

/** A glassy card surface — overlay inverts via --ink on light themes. */
export const card: CSSProperties = {
  background: "linear-gradient(180deg,rgba(var(--ink),.05),rgba(var(--ink),.018))",
  border: `1px solid ${C.cardBd}`,
  borderRadius: 16,
};

/** Uppercase mono eyebrow label. */
export function eyebrow(color: string = C.dim): CSSProperties {
  return {
    fontFamily: FONT.mono,
    fontSize: 11,
    letterSpacing: ".15em",
    textTransform: "uppercase",
    color,
  };
}

/** A small mono pill (used for [n] citations, status tags). */
export function pill(color: string, bg: string): CSSProperties {
  return {
    padding: "3px 9px",
    borderRadius: 999,
    background: bg,
    color,
    fontFamily: FONT.mono,
    fontSize: 10.5,
  };
}

/** Citation chip — gold by default. */
export const cite: CSSProperties = pill(C.gold, "rgba(231,181,60,.12)");

/** Color helpers for screen-level semantics. */
export const SEM = {
  open: { c: C.blue, bg: "rgba(103,173,255,.14)", label: "○ OPEN" },
  late: { c: C.orange, bg: "rgba(240,163,60,.16)", label: "⚠ LATE" },
  broken: { c: C.redText, bg: "rgba(255,107,94,.16)", label: "✗ BROKEN" },
  kept: { c: C.greenText, bg: "rgba(52,201,139,.16)", label: "✓ KEPT" },
} as const;
