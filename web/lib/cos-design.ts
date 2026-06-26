// Design tokens for "Mayor's AI Chief of Staff — Desktop", ported from the
// Claude Design prototype (claude.ai/design project 89b25fde …
// "Mayor's AI Chief of Staff - Desktop.dc.html"). Dark institutional-memory
// cockpit: Public Sans / Newsreader / JetBrains Mono; navy gradient; gold/
// blue/green/orange/purple semantic accents.
import type { CSSProperties } from "react";

/** Palette. */
export const C = {
  bgBody: "#05080e",
  text: "#EAF1FA",
  text2: "#A9BDD4",
  text3: "#93A8C2",
  muted: "#7d8ea3",
  dim: "#5E748F",
  dim2: "#46586f",
  gold: "#E7B53C",
  goldHi: "#F4CB63",
  goldLo: "#D7991C",
  blue: "#67ADFF",
  green: "#34C98B",
  greenText: "#74dcb4",
  orange: "#F0A33C",
  orangeText: "#cf9a52",
  red: "#FF6B5E",
  redText: "#FF9084",
  purple: "#9D8BFF",
  purpleText: "#B0A2FF",
  line: "rgba(255,255,255,.07)",
  line2: "rgba(255,255,255,.06)",
  cardBd: "rgba(255,255,255,.08)",
} as const;

/** Fonts (loaded via the /chief layout <link>). */
export const FONT = {
  sans: "'Public Sans',system-ui,sans-serif",
  serif: "'Newsreader',serif",
  mono: "'JetBrains Mono',monospace",
} as const;

export const APP_BG =
  "radial-gradient(130% 100% at 18% -8%,#102139 0%,#0a1322 42%,#070b12 100%)";

/** A glassy card surface. */
export const card: CSSProperties = {
  background:
    "linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.018))",
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
