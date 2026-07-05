/*
 * embed.test.ts — ING-4 gate checks for the embed stage's pure logic.
 *
 *   cd web && npx tsx eval/embed.test.ts
 *
 * Proves: the chunker respects the size budget, never drops content between
 * chunks (overlap), collapses short bodies to one chunk and empty bodies to
 * none (the pass embeds the header line instead, so every message closes the
 * reconciliation count); the header line carries sender + date + subject so
 * sender-shaped questions match semantically; and the planner's literal
 * address extractor finds the addresses a question names.
 */
import { chunkText, chunkHeader } from "../lib/embed-mail";
import { extractEmails } from "../lib/planner";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("chunkText — the splitter");
{
  const short = chunkText("A quick note about the water bill.");
  check("short body → exactly one chunk", short.length === 1 && short[0].includes("water bill"));

  check("empty body → no chunks (pass embeds the header instead)", chunkText("   \n ").length === 0);

  const para = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} about the storm drain on Frederick Ave, repeated for length and substance.`).join("\n\n");
  const chunks = chunkText(para);
  check("long body → multiple chunks", chunks.length > 1, `got ${chunks.length}`);
  check("every chunk within the size budget", chunks.every((c) => c.length <= 1400), `max ${Math.max(...chunks.map((c) => c.length))}`);
  check("no empty chunks", chunks.every((c) => c.trim().length > 0));
  // overlap contract: every paragraph's content appears in at least one chunk
  const missing = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} `).filter((p) => !chunks.some((c) => c.includes(p.trim())));
  check("no content lost between chunks", missing.length === 0, `missing: ${missing.slice(0, 3).join(", ")}`);

  const wall = "x".repeat(5000); // no separators at all — must still terminate + cover
  const hard = chunkText(wall);
  check("separator-free text still chunks and terminates", hard.length >= 3 && hard.every((c) => c.length <= 1400));
}

console.log("chunkHeader — the sender/date/subject stamp");
{
  const h = chunkHeader({ from_name: "Coach MJ", from_email: "coachmj@eliteforexuniversity.com", subject: "Weekly signals", sent_at: new Date("2026-07-03T15:00:00Z") });
  check("carries the sender name", h.includes("Coach MJ"));
  check("carries the address", h.includes("coachmj@eliteforexuniversity.com"));
  check("carries the date", h.includes("2026-07-03"));
  check("carries the subject", h.includes("Weekly signals"));
  check("one line", !h.includes("\n"));

  const bare = chunkHeader({ from_name: null, from_email: null, subject: null, sent_at: "2026-07-01T00:00:00Z" });
  check("degrades honestly with no sender/subject", bare.includes("unknown") && bare.includes("(no subject)"));
}

console.log("extractEmails — literal addresses in a question");
{
  check("finds the address", extractEmails("What emails did I get from coachmj@eliteforexuniversity.com").join() === "coachmj@eliteforexuniversity.com");
  check("lowercases + dedups", extractEmails("Mail from Bob@X.com and bob@x.com?").join() === "bob@x.com");
  check("none → empty", extractEmails("what is still open on Frederick Ave").length === 0);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed.");
