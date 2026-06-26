// Eval metrics. Gate any autonomy increase on these (design §8).
import type { Source } from "../lib/types";

export function citationIndices(answer: string): number[] {
  return [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
}

/** Fraction of [n] markers in the answer that resolve to a real source. 1.0 if none. */
export function citationValidity(answer: string, nSources: number): number {
  const idx = citationIndices(answer);
  if (idx.length === 0) return 1;
  const valid = idx.filter((i) => i >= 1 && i <= nSources).length;
  return valid / idx.length;
}

export function streamsOf(sources: Source[]): Set<string> {
  return new Set(sources.map((s) => s.stream));
}

const GAP_RE = /\b(no record|no records|nothing on file|i (have|don'?t have) (no|any)|not on file|no (matching )?(records|messages))\b/i;
export function statesGap(answer: string): boolean {
  return GAP_RE.test(answer);
}
