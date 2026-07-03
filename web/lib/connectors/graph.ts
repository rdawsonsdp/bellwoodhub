/*
 * graph.ts — Microsoft Graph (Outlook) connector, gov mailbox. Plain fetch
 * against Graph v1.0 REST — no SDK dependency. Delegated Mail.Read only; the
 * refresh token comes from the sign-in grant (lib/auth.ts) via
 * pipeline.connector_accounts. Throttling: Graph allows ~10k requests/10 min
 * per mailbox — 429s are honored via Retry-After, never hammered.
 *
 * Cursor = the @odata.deltaLink from /messages/delta. internetMessageId →
 * sourceRef (the cross-provider RFC id), conversationId → threadRef.
 */
import type { Connector, PulledMessage } from "./types";
import { htmlToText } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// $select for list/delta — the envelope fields plus body (delta pulls land RAW).
const SELECT =
  "id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients," +
  "receivedDateTime,sentDateTime,hasAttachments,body";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a Graph URL, honoring Retry-After on 429/503 (simple await backoff). */
async function graphFetch(url: string, accessToken: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429 || res.status === 503) {
      const after = parseInt(res.headers.get("retry-after") ?? "2", 10);
      await sleep(Math.min(isNaN(after) ? 2 : after, 30) * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`graph ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
  throw new Error("graph: still throttled after 4 attempts");
}

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}
interface GraphMessage {
  id?: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  body?: { contentType?: string; content?: string };
  "@removed"?: unknown; // delta tombstone — skipped (canonical is a record, not a mirror)
}

function joinAddresses(recips: GraphRecipient[] | undefined): string | null {
  const out = (recips ?? []).map((r) => r.emailAddress?.address).filter(Boolean);
  return out.length ? out.join(", ") : null;
}

function toPulled(m: GraphMessage, address: string): PulledMessage | null {
  const sourceRef = m.internetMessageId || m.id;
  if (!sourceRef) return null;
  const fromEmail = m.from?.emailAddress?.address ?? null;
  const html = m.body?.contentType === "html" ? (m.body.content ?? null) : null;
  const text = m.body?.contentType === "text" ? (m.body.content ?? null) : null;
  return {
    sourceRef,
    threadRef: m.conversationId || sourceRef,
    direction: fromEmail && fromEmail.toLowerCase() === address.toLowerCase() ? "outbound" : "inbound",
    fromName: m.from?.emailAddress?.name ?? null,
    fromEmail,
    toEmail: joinAddresses(m.toRecipients),
    cc: joinAddresses(m.ccRecipients),
    subject: m.subject ?? null,
    sentAt: m.receivedDateTime ?? m.sentDateTime ?? new Date().toISOString(),
    bodyHtml: html,
    bodyText: text ?? (html ? htmlToText(html) : null),
    hasAttachments: !!m.hasAttachments,
    provider: "outlook",
    address,
  };
}

/** Build the Outlook connector for one connected account. */
export function graphConnector(address: string): Connector {
  return {
    async refreshAccessToken(refreshToken) {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
          client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          scope: "openid profile email offline_access https://graph.microsoft.com/Mail.Read",
        }),
      });
      if (!res.ok) {
        throw new Error(`graph token refresh ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const j = (await res.json()) as { access_token: string; expires_in: number };
      return { accessToken: j.access_token, expiresIn: j.expires_in };
    },

    async listNewest(accessToken, n) {
      const url =
        `${GRAPH}/me/messages?$top=${n}&$select=${SELECT}` +
        `&$orderby=receivedDateTime%20desc`;
      const page = await graphFetch(url, accessToken);
      const rows = (page.value ?? []) as GraphMessage[];
      return rows.map((m) => toPulled(m, address)).filter((m): m is PulledMessage => m !== null);
    },

    async pullSince(accessToken, cursor, cap) {
      // TODO: a second delta pass over /me/mailFolders/sentitems (outbound mail);
      // inbox-only for now — listNewest still surfaces sent items for dry-runs.
      let url = cursor ?? `${GRAPH}/me/mailFolders/inbox/messages/delta?$select=${SELECT}&$top=50`;
      const messages: PulledMessage[] = [];
      let nextCursor: string | null = null;
      while (url) {
        const page = await graphFetch(url, accessToken);
        for (const m of (page.value ?? []) as GraphMessage[]) {
          if (m["@removed"]) continue;
          const pm = toPulled(m, address);
          if (pm) messages.push(pm);
        }
        const deltaLink = page["@odata.deltaLink"] as string | undefined;
        const nextLink = page["@odata.nextLink"] as string | undefined;
        if (deltaLink) {
          nextCursor = deltaLink; // fully drained — this is the resume point
          break;
        }
        if (!nextLink) break;
        if (messages.length >= cap) {
          // cap hit — pages are consumed whole (may overshoot by <$top), so the
          // nextLink resumes exactly after everything returned here
          nextCursor = nextLink;
          break;
        }
        url = nextLink;
      }
      return { messages, nextCursor };
    },
  };
}
