/*
 * graph.ts — Microsoft Graph (Outlook) connector, gov mailbox. Plain fetch
 * against Graph v1.0 REST — no SDK dependency. Delegated Mail.Read only; the
 * refresh token comes from the sign-in grant (lib/auth.ts) via
 * pipeline.connector_accounts. Throttling: Graph allows ~10k requests/10 min
 * per mailbox — 429s are honored via Retry-After, never hammered.
 *
 * Cursor = JSON {inbox, sent} of per-folder delta links (inbox + sentitems
 * each keep their own /messages/delta chain), prefixed "bf:" while either
 * folder is still paging — the cross-provider "backfill in progress" signal
 * (see gmail.ts): the ingest loop keeps draining within its run budget and
 * the UI reads mid-walk state from it. A legacy bare-URL cursor (the
 * inbox-only era) upgrades in place. internetMessageId → sourceRef (the
 * cross-provider RFC id), conversationId → threadRef.
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

// Cursor encoding (two folders since the sentitems pass joined, MH-1):
//   mid-walk:  "bf:" + JSON {inbox, sent} — either folder still has pages
//   steady:            JSON {inbox, sent} — both folders hold deltaLinks
// A null side means that folder's first walk hasn't started yet.
const BF_PREFIX = "bf:";
interface GraphCursor {
  inbox: string | null;
  sent: string | null;
}

function parseCursor(cursor: string | null): GraphCursor {
  if (!cursor) return { inbox: null, sent: null };
  const raw = cursor.startsWith(BF_PREFIX) ? cursor.slice(BF_PREFIX.length) : cursor;
  if (raw.startsWith("{")) {
    try {
      const j = JSON.parse(raw) as Partial<GraphCursor>;
      return { inbox: j.inbox ?? null, sent: j.sent ?? null };
    } catch {
      /* unparseable — treat as legacy below */
    }
  }
  return { inbox: raw, sent: null }; // legacy single-URL cursor (inbox-only era)
}

/** Drain one folder's delta chain from `start` (null = first walk), up to
 *  `room` messages. drained = reached the deltaLink; otherwise cursor is the
 *  nextLink to resume from — pages are consumed whole (may overshoot by
 *  <$top), so the resume point sits exactly after everything returned. */
async function pullFolder(
  accessToken: string,
  address: string,
  folder: "inbox" | "sentitems",
  start: string | null,
  room: number,
): Promise<{ messages: PulledMessage[]; cursor: string | null; drained: boolean }> {
  let url = start ?? `${GRAPH}/me/mailFolders/${folder}/messages/delta?$select=${SELECT}&$top=50`;
  const messages: PulledMessage[] = [];
  while (url) {
    const page = await graphFetch(url, accessToken);
    for (const m of (page.value ?? []) as GraphMessage[]) {
      if (m["@removed"]) continue;
      const pm = toPulled(m, address);
      if (pm) messages.push(pm);
    }
    const deltaLink = page["@odata.deltaLink"] as string | undefined;
    const nextLink = page["@odata.nextLink"] as string | undefined;
    if (deltaLink) return { messages, cursor: deltaLink, drained: true };
    if (!nextLink) break; // Graph always ends on a deltaLink — defensive only
    if (messages.length >= room) return { messages, cursor: nextLink, drained: false };
    url = nextLink;
  }
  return { messages, cursor: null, drained: true }; // null = caller keeps the old side
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

    async mailboxTotal(accessToken) {
      // the two folders the delta passes mirror — totals track the same scope
      const [inbox, sent] = await Promise.all([
        graphFetch(`${GRAPH}/me/mailFolders/inbox?$select=totalItemCount`, accessToken),
        graphFetch(`${GRAPH}/me/mailFolders/sentitems?$select=totalItemCount`, accessToken),
      ]);
      const n = Number(inbox.totalItemCount ?? NaN) + Number(sent.totalItemCount ?? NaN);
      return Number.isFinite(n) ? n : null;
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
      // Two delta passes sharing the cap: inbox first, then sentitems
      // (outbound mail — direction falls out of toPulled's from-vs-account
      // compare; a self-addressed message dedups on internetMessageId).
      const c = parseCursor(cursor);
      const inbox = await pullFolder(accessToken, address, "inbox", c.inbox, cap);
      const next: GraphCursor = { inbox: inbox.cursor ?? c.inbox, sent: c.sent };
      let messages = inbox.messages;
      let sentDrained = false; // cap eaten before sentitems ran = not drained
      const room = cap - messages.length;
      if (room > 0) {
        const sent = await pullFolder(accessToken, address, "sentitems", c.sent, room);
        messages = messages.concat(sent.messages);
        next.sent = sent.cursor ?? c.sent;
        sentDrained = sent.drained;
      }
      const backfill = !inbox.drained || !sentDrained;
      const encoded = JSON.stringify(next);
      return { messages, nextCursor: backfill ? `${BF_PREFIX}${encoded}` : encoded };
    },
  };
}
