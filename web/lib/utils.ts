/** Collapse whitespace and truncate at a word boundary with an ellipsis. */
export function snippet(text: string | null | undefined, n = 280): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+\S*$/, "") + " …";
}

/** Short, human date: "Jun 20, 2026". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "May 22" — no year, for compact lists. */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Aug 2025 – May 2026" range from two ISO dates. */
export function fmtRange(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  if (first && last) return `${f(first)} – ${f(last)}`;
  if (last) return f(last);
  if (first) return f(first);
  return "—";
}
