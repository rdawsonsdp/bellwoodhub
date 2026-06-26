import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { searchSources, getEntity, getEmailByMessageId } from "@/lib/backend";
import { needsYouToday, draftReply } from "@/lib/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = process.env.PUBLIC_BASE_URL || "https://village-knowledge-hub.vercel.app";

const mcpHandler = createMcpHandler(
  (server) => {
    // ── Semantic (vector) RAG search — the core tool ──
    server.tool(
      "search_village_emails",
      "Semantic VECTOR search (RAG) over the Village of Bellwood, IL municipal email archive — ~20,000 synthetic emails spanning constituent mail, interdepartmental memos, police & fire daily reports, and business/licensing. Matches by MEANING using pgvector embeddings (not keywords). Returns the most relevant emails with sender, date, source stream, topic, a snippet, and a link to the full document. Use this to answer questions about residents, properties, incidents, complaints, or village operations, then cite the returned sources. All data is synthetic.",
      {
        question: z
          .string()
          .describe("A natural-language question or topic to search for, e.g. 'basement flooding on Frederick Ave'."),
        k: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("How many emails to return (default 8)."),
        person: z.string().optional().describe("Restrict to a person (resident or staff name)."),
        address: z.string().optional().describe("Restrict to an address or street."),
        topic: z
          .string()
          .optional()
          .describe(
            "Restrict to one topic: roads, water_billing, drainage, code_enforcement, permits, sanitation, parks_events, business, foia, complaint, thanks, public_safety, fire_ems.",
          ),
        since: z.string().optional().describe("Only emails on/after this date (YYYY-MM-DD)."),
        until: z.string().optional().describe("Only emails on/before this date (YYYY-MM-DD)."),
      },
      async (args) => {
        const { sources, crossSource } = await searchSources(args.question, {
          k: args.k,
          person: args.person,
          address: args.address,
          topic: args.topic,
          since: args.since,
          until: args.until,
        });
        if (!sources.length) {
          return { content: [{ type: "text", text: "No matching emails found." }] };
        }
        const body = sources
          .map(
            (s) =>
              `[${s.index}] ${s.date.slice(0, 10)} · ${s.stream} · ${s.direction} · ${s.topic ?? ""} · ${Math.round(s.score * 100)}% match\n` +
              `From: ${s.fromName ?? "Unknown"} <${s.fromEmail ?? ""}>\n` +
              `Subject: ${s.subject ?? "(no subject)"}\n` +
              `${s.snippet}\n` +
              `Full email: ${BASE}/email?mid=${encodeURIComponent(s.messageId)}`,
          )
          .join("\n\n");
        const header = `Top ${sources.length} emails by semantic relevance${crossSource ? " (spans 3+ source streams)" : ""}, newest first:\n\n`;
        return { content: [{ type: "text", text: header + body }] };
      },
    );

    // ── Single pane of glass: a person's or property's full timeline ──
    server.tool(
      "get_resident_or_property_history",
      "Return the full timeline of emails tied to one resident/staff person OR one address/property in the Bellwood archive — the 'single pane of glass' across every department, newest first.",
      {
        type: z.enum(["person", "address"]).describe("Whether 'value' is a person name or an address/street."),
        value: z
          .string()
          .describe("Person name (e.g. 'Gloria Bennett') or address (e.g. '1733 Frederick Ave')."),
      },
      async ({ type, value }) => {
        const e = await getEntity(type, value);
        if (!e.messages.length) {
          return { content: [{ type: "text", text: `No emails found for ${type} "${value}".` }] };
        }
        const stats = `${e.stats.count} messages · ${e.stats.firstDate?.slice(0, 10) ?? "?"} → ${e.stats.lastDate?.slice(0, 10) ?? "?"} · streams: ${e.stats.streams.join(", ")}`;
        const body = e.messages
          .map(
            (m) =>
              `${m.date.slice(0, 10)} · ${m.stream} · ${m.direction} · ${m.topic ?? ""}\n` +
              `From: ${m.fromName ?? "Unknown"} <${m.fromEmail ?? ""}>\n` +
              `Subject: ${m.subject ?? "(no subject)"}\n` +
              `${m.snippet}\n` +
              `Full email: ${BASE}/email?mid=${encodeURIComponent(m.messageId)}`,
          )
          .join("\n\n");
        return {
          content: [{ type: "text", text: `History for ${type} "${value}" — ${stats}\n\n${body}` }],
        };
      },
    );

    // ── Read one full email ──
    server.tool(
      "get_full_email",
      "Fetch the complete text of a single email by its message id (the <…@mail.bellwood-demo.gov> id returned by the other tools).",
      {
        message_id: z.string().describe("The message id, e.g. <abc123@mail.bellwood-demo.gov>."),
      },
      async ({ message_id }) => {
        const em = await getEmailByMessageId(message_id);
        if (!em) {
          return { content: [{ type: "text", text: "Email not found." }] };
        }
        const text =
          `Subject: ${em.subject ?? "(no subject)"}\n` +
          `From: ${em.fromName ?? "Unknown"} <${em.fromEmail ?? ""}>\n` +
          `To: ${em.toEmail ?? "—"}\n` +
          (em.cc ? `Cc: ${em.cc}\n` : "") +
          `Date: ${em.date.slice(0, 10)}\n` +
          `Stream: ${em.stream} · Topic: ${em.topic ?? ""}\n\n` +
          em.bodyClean;
        return { content: [{ type: "text", text }] };
      },
    );

    // ── "Needs You Today" — read-only capability digest (R4 honest-gap) ──
    server.tool(
      "needs_you_today",
      "The Mayor's 'Needs You Today' digest: newest inbound awaiting a reply, open issues (folded from the event log), and new high-sensitivity inbound — each with a citation link. Read-only; empty sections are stated, not hidden.",
      {},
      async () => {
        const b = await needsYouToday();
        const sec = (
          title: string,
          items: { subject: string | null; fromName: string | null; date: string; stream: string; why: string; messageId: string }[],
        ) =>
          `${title} (${items.length})\n` +
          (items.length
            ? items
                .map(
                  (i) =>
                    `  • ${i.subject ?? "(no subject)"} — ${i.fromName ?? i.stream} · ${i.date.slice(0, 10)} · ${i.why}  ${BASE}/email?mid=${encodeURIComponent(i.messageId)}`,
                )
                .join("\n")
            : "  • none");
        const text = [
          `NEEDS YOU TODAY · ${b.generatedAt.slice(0, 10)}`,
          sec("AWAITING YOUR REPLY", b.awaitingReply),
          sec("OPEN ISSUES", b.openIssues),
          sec("NEW HIGH-SENSITIVITY INBOUND", b.highSensitivity),
          "(Read-only digest. Drafting and sending always require your approval.)",
        ].join("\n\n");
        return { content: [{ type: "text", text }] };
      },
    );

    // ── Draft a reply (R3: drafts only, never sends) ──
    server.tool(
      "draft_reply",
      "Draft a reply to an email in the Mayor's voice. Returns a DRAFT plus an approval envelope — it NEVER sends. The Mayor reviews and sends. message_id is the id returned by the other tools.",
      {
        message_id: z.string().describe("The message id to reply to."),
        intent: z.string().optional().describe("Optional: the gist of what the reply should convey."),
      },
      async ({ message_id, intent }) => {
        const env = await draftReply(message_id, intent);
        const text =
          `DRAFT REPLY  (status: ${env.status} · requires_human: ${env.requiresHuman} — NOT sent)\n` +
          `To: ${env.recipients ?? "—"}\nSubject: ${env.subject}\n\n${env.draft}\n\n— ${env.rationale}`;
        return { content: [{ type: "text", text }] };
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: true },
);

// ── Shared-secret gate ──
// If MCP_SECRET is set, every request must present it as ?k=<secret> (in the
// connector URL) or an `Authorization: Bearer <secret>` header. If it's unset,
// the endpoint stays open (e.g. for local dev).
function authorized(req: Request): boolean {
  const secret = process.env.MCP_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const q = url.searchParams.get("k") || url.searchParams.get("key");
  if (q && q === secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return false;
}

async function guarded(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "Unauthorized: missing or invalid secret." },
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return mcpHandler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
