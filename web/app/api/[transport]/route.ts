import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { searchSources, getEntity, getEmailByMessageId } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = process.env.PUBLIC_BASE_URL || "https://village-knowledge-hub.vercel.app";

const handler = createMcpHandler(
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
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: true },
);

export { handler as GET, handler as POST, handler as DELETE };
