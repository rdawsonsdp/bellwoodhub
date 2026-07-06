/*
 * graph-connector.test.ts — MH-1 gate checks (no framework, mirrors eval/run.ts).
 *
 *   cd web && npx tsx eval/graph-connector.test.ts
 *
 * Covers the Graph cursor state machine against a stubbed Graph server:
 * first full walk over inbox + sentitems, the bf: cap-out/resume contract
 * (parity with gmail.ts — the ingest loop and UI key off the prefix), the
 * legacy bare-URL cursor upgrade, outbound direction on sent mail, and
 * @removed tombstone skips. No network, no tokens, writes nothing.
 */
import { graphConnector } from "../lib/connectors/graph";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const ADDRESS = "aharvey@vil.bellwood.il.us";
const G = "https://graph.microsoft.com/v1.0";

// ── stub Graph: a routing table of url (exact or trailing-* prefix) → page ──
let routes: Record<string, unknown> = {};
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const key = Object.keys(routes).find(
    (k) => k === url || (k.endsWith("*") && url.startsWith(k.slice(0, -1))),
  );
  if (!key) return new Response(`no route for ${url}`, { status: 500 });
  return new Response(JSON.stringify(routes[key]), { status: 200 });
}) as typeof fetch;

const msg = (id: string, from: string, subject: string) => ({
  id,
  internetMessageId: `<${id}@test>`,
  conversationId: `conv-${id}`,
  subject,
  from: { emailAddress: { name: from, address: from } },
  toRecipients: [{ emailAddress: { address: "clerk@vil.bellwood.il.us" } }],
  receivedDateTime: "2026-07-06T10:00:00Z",
  hasAttachments: false,
  body: { contentType: "html" as const, content: `<p>${subject}</p>` },
});

const INBOX_START = `${G}/me/mailFolders/inbox/messages/delta*`;
const SENT_START = `${G}/me/mailFolders/sentitems/messages/delta*`;
const IN2 = `${G}/TEST/inbox-page-2`;
const IN_DELTA = `${G}/TEST/inbox-delta`;
const SENT_DELTA = `${G}/TEST/sent-delta`;

const c = graphConnector(ADDRESS);

async function main() {
// ── first pull: both folders walk to their deltaLinks ───────────────────────
console.log("first pull (null cursor, cap roomy)");
routes = {
  [INBOX_START]: { value: [msg("m1", "res1@comcast.net", "Pothole"), msg("m2", "res2@aol.com", "FOIA ask")], "@odata.nextLink": IN2 },
  [IN2]: { value: [msg("m3", "chief@vil.bellwood.il.us", "Blotter")], "@odata.deltaLink": IN_DELTA },
  [SENT_START]: { value: [msg("s1", ADDRESS, "Re: Pothole")], "@odata.deltaLink": SENT_DELTA },
};
{
  const { messages, nextCursor } = await c.pullSince("tok", null, 200);
  check("all four messages pulled", messages.length === 4, `got ${messages.length}`);
  check("sent mail is outbound", messages.find((m) => m.sourceRef === "<s1@test>")?.direction === "outbound");
  check("inbox mail is inbound", messages.find((m) => m.sourceRef === "<m1@test>")?.direction === "inbound");
  check("steady cursor is plain JSON (no bf:)", !!nextCursor && !nextCursor.startsWith("bf:"));
  const j = JSON.parse(nextCursor!);
  check("cursor holds both deltaLinks", j.inbox === IN_DELTA && j.sent === SENT_DELTA);
}

// ── cap-out mid-walk: bf: cursor, then exact resume ─────────────────────────
console.log("cap-out mid-walk → bf: → resume");
{
  const first = await c.pullSince("tok", null, 2);
  check("cap respected (pages consumed whole)", first.messages.length === 2, `got ${first.messages.length}`);
  check("mid-walk cursor carries bf:", !!first.nextCursor?.startsWith("bf:"), first.nextCursor ?? "null");
  const j = JSON.parse(first.nextCursor!.slice(3));
  check("inbox side resumes at the nextLink", j.inbox === IN2);
  check("sent side untouched (walk not started)", j.sent === null);

  const resumed = await c.pullSince("tok", first.nextCursor, 200);
  check("resume pulls the rest (m3 + s1)", resumed.messages.length === 2, `got ${resumed.messages.length}`);
  check("resume picks up exactly after the cap", resumed.messages[0]?.sourceRef === "<m3@test>");
  check("drained cursor drops bf:", !!resumed.nextCursor && !resumed.nextCursor.startsWith("bf:"));
}

// ── legacy bare-URL cursor (inbox-only era) upgrades in place ────────────────
console.log("legacy cursor upgrade");
{
  const LEGACY = `${G}/TEST/legacy-inbox-delta`;
  routes = {
    [LEGACY]: { value: [msg("m4", "res3@gmail.com", "Water bill")], "@odata.deltaLink": IN_DELTA },
    [SENT_START]: { value: [msg("s1", ADDRESS, "Re: Pothole")], "@odata.deltaLink": SENT_DELTA },
  };
  const { messages, nextCursor } = await c.pullSince("tok", LEGACY, 200);
  check("inbox resumes from the legacy deltaLink", messages.some((m) => m.sourceRef === "<m4@test>"));
  check("sentitems starts its first walk", messages.some((m) => m.sourceRef === "<s1@test>"));
  const j = JSON.parse(nextCursor!);
  check("cursor upgraded to two-folder JSON", j.inbox === IN_DELTA && j.sent === SENT_DELTA);
}

// ── steady state + tombstones ────────────────────────────────────────────────
console.log("steady state (incremental, tombstones skipped)");
{
  routes = {
    [IN_DELTA]: { value: [{ id: "gone", "@removed": { reason: "deleted" } }, msg("m5", "res4@yahoo.com", "Tree down")], "@odata.deltaLink": IN_DELTA },
    [SENT_DELTA]: { value: [], "@odata.deltaLink": SENT_DELTA },
  };
  const cursor = JSON.stringify({ inbox: IN_DELTA, sent: SENT_DELTA });
  const { messages, nextCursor } = await c.pullSince("tok", cursor, 200);
  check("tombstone skipped, new mail lands", messages.length === 1 && messages[0].sourceRef === "<m5@test>");
  check("cursor stays plain JSON", !!nextCursor && !nextCursor.startsWith("bf:"));
}

console.log(failures ? `\n${failures} FAILED` : "\nall green");
process.exit(failures ? 1 : 0);
}

void main();
