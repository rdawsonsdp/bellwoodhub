/*
 * ask-retrieval.test.ts — the retrieval edge cases that made Ask look like a
 * model problem when it was a RETRIEVAL problem.
 *
 *   cd web && npx tsx eval/ask-retrieval.test.ts
 *
 * Context (RD 2026-07-30): "complete breakdown of my Google spend this year, by
 * month" returned "I have no Google spend records" while 19 Google billing
 * emails sat indexed and searchable. Three independent k=8 caps and a missing
 * sender/date predicate meant the model was never shown the data. These tests
 * assert on the RETRIEVED SET, not on model prose — retrieval is the part that
 * must be deterministic, and asserting on generated text would be flaky.
 *
 * Requires a live DB (DATABASE_URL) — this is an integration eval, not a unit
 * test. It reads only; it writes nothing.
 */
import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const GOOGLE_Q = "I want a complete break down of my Google Spend this year. Break it down by month in a table.";
const NARROW_Q = "What did Angela say about the barber shop?";

async function main() {
  const { plan, sinceFromQuestion } = await import("../lib/planner");
  const { query } = await import("../lib/db");

  // ── ground truth straight from the corpus ────────────────────────────────
  const truth = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM canonical.messages
      WHERE from_email ILIKE '%google%' AND sent_at >= '2026-01-01'`,
  );
  const googleMsgs = truth[0]?.n ?? 0;
  console.log(`\nground truth: ${googleMsgs} messages from a google sender since 2026-01-01\n`);
  check("corpus actually contains Google mail this year (else the rest is moot)", googleMsgs >= 10, `${googleMsgs}`);

  // ── 1. date scoping is extracted from the question ───────────────────────
  console.log("\ndate extraction");
  const now = new Date("2026-07-30T00:00:00Z");
  check('"this year" → Jan 1 of this year', sinceFromQuestion("spend this year", now) === "2026-01-01", String(sinceFromQuestion("spend this year", now)));
  check('an explicit year wins', sinceFromQuestion("spend in 2025", now) === "2025-01-01", String(sinceFromQuestion("spend in 2025", now)));
  check('"last year"', sinceFromQuestion("spend last year", now) === "2025-01-01", String(sinceFromQuestion("spend last year", now)));
  check("a question with no period is unscoped", sinceFromQuestion("what did angela say", now) === null);

  // ── 2. a completeness question widens retrieval ──────────────────────────
  console.log("\ncompleteness question (the reported failure)");
  const wide = await plan(GOOGLE_Q);
  check("returns far more than the old 8-source cap", wide.sources.length > 8, `${wide.sources.length} sources`);
  const fromGoogle = wide.sources.filter((s) =>
    `${s.fromEmail ?? ""} ${s.fromName ?? ""}`.toLowerCase().includes("google"));
  check("the retrieved set is dominated by actual Google senders", fromGoogle.length >= 8, `${fromGoogle.length} google-sender sources`);
  const billing = fromGoogle.filter((s) => /invoice|payment|receipt|billing|charge/i.test(`${s.subject ?? ""}`));
  check("BILLING mail specifically is retrieved, not just any Google mail", billing.length >= 5, `${billing.length} billing-subject sources`);
  const months = new Set(fromGoogle.map((s) => s.date.slice(0, 7)));
  check("coverage spans multiple months (a monthly table is answerable)", months.size >= 4, `${months.size} distinct months: ${[...months].sort().join(", ")}`);
  check("everything retrieved is inside the requested year", wide.sources.every((s) => s.date >= "2026-01-01"), "a source predates 2026-01-01");

  // ── 3. an ordinary question stays narrow (no cost/latency regression) ────
  console.log("\nordinary question stays cheap");
  const narrow = await plan(NARROW_Q);
  check("narrow question is not widened", narrow.sources.length <= 8, `${narrow.sources.length} sources`);

  // ── 4. an explicit caller k is still honoured ────────────────────────────
  console.log("\nexplicit k still wins");
  const pinned = await plan(GOOGLE_Q, { k: 3 });
  check("caller-supplied k overrides the widening", pinned.sources.length <= 3, `${pinned.sources.length} sources`);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("harness error:", e); process.exit(1); });
