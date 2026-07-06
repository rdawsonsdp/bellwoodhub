/*
 * gmail.ts — Gmail connector, the walled biz mailbox (DEC-6). Plain fetch
 * against the Gmail v1 REST API — no SDK dependency. Scope gmail.readonly
 * only; the refresh token comes from the sign-in grant (lib/auth.ts) via
 * pipeline.connector_accounts. Quota: messages.get costs 5 of 250
 * units/user/sec — pulls are sequential and 429s back off, never hammer.
 *
 * Cursor = the mailbox historyId. Message-ID header → sourceRef (the
 * cross-provider RFC id), threadId → threadRef. The wall itself (mailbox
 * stamp, foia_scope=false) is applied at landing, not here.
 */
import type { Connector, PulledMessage } from "./types";
import { htmlToText } from "./types";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a Gmail URL with backoff on 429/403-rate; optionally null on 404
 *  (an expired startHistoryId 404s — the caller falls back to a full pull). */
async function gmailFetch(
  url: string,
  accessToken: string,
  nullOn404 = false,
): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 404 && nullOn404) return null;
    if (res.status === 429 || res.status === 403) {
      const after = parseInt(res.headers.get("retry-after") ?? "2", 10);
      await sleep(Math.min(isNaN(after) ? 2 : after, 30) * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`gmail ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
  throw new Error("gmail: still throttled after 4 attempts");
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string; // ms epoch as string
  payload?: GmailPart & { headers?: { name?: string; value?: string }[] };
}

function header(m: GmailMessage, name: string): string | null {
  const h = (m.payload?.headers ?? []).find(
    (x) => (x.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? null;
}

/** "Jane Doe <jane@x.com>" → { name: "Jane Doe", email: "jane@x.com" }. */
function parseAddress(raw: string | null): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null };
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() || null };
}

/** Walk the MIME tree collecting the first text/plain + text/html bodies (base64url). */
function walkParts(part: GmailPart | undefined, out: { text?: string; html?: string; attachments: boolean }): void {
  if (!part) return;
  if (part.filename) out.attachments = true;
  if (part.body?.data) {
    const decoded = Buffer.from(part.body.data, "base64url").toString("utf8");
    if (part.mimeType === "text/plain" && out.text === undefined) out.text = decoded;
    else if (part.mimeType === "text/html" && out.html === undefined) out.html = decoded;
  }
  for (const p of part.parts ?? []) walkParts(p, out);
}

function toPulled(m: GmailMessage, address: string): PulledMessage | null {
  const sourceRef = header(m, "Message-ID") || m.id;
  if (!sourceRef || !m.id) return null;
  const from = parseAddress(header(m, "From"));
  const bodies: { text?: string; html?: string; attachments: boolean } = { attachments: false };
  walkParts(m.payload, bodies);
  const ms = parseInt(m.internalDate ?? "", 10);
  return {
    sourceRef,
    threadRef: m.threadId || m.id,
    direction: (m.labelIds ?? []).includes("SENT") ? "outbound" : "inbound",
    fromName: from.name,
    fromEmail: from.email,
    toEmail: header(m, "To"),
    cc: header(m, "Cc"),
    subject: header(m, "Subject"),
    sentAt: isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString(),
    bodyHtml: bodies.html ?? null,
    bodyText: bodies.text ?? (bodies.html ? htmlToText(bodies.html) : null),
    hasAttachments: bodies.attachments,
    provider: "gmail",
    address,
  };
}

/** Fetch one message by id. format=metadata for dry-runs (headers only), full for landing. */
async function getMessage(
  accessToken: string,
  id: string,
  address: string,
  format: "metadata" | "full",
): Promise<PulledMessage | null> {
  const meta =
    format === "metadata"
      ? "&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID"
      : "";
  const m = (await gmailFetch(
    `${GMAIL}/messages/${id}?format=${format}${meta}`,
    accessToken,
  )) as GmailMessage;
  return toPulled(m, address);
}

/** Message ids newest-first, paged, up to `cap` — resumable: `start` continues
 *  from a prior run's nextPageToken, and the unconsumed token comes back so a
 *  capped run can resume exactly where it stopped (the Sync-until-mirrored
 *  loop, RD 2026-07-03: "the sync job should sync every mail record"). */
async function listIds(
  accessToken: string,
  cap: number,
  start?: string,
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const ids: string[] = [];
  let pageToken: string | null = start ?? null;
  while (ids.length < cap) {
    const url =
      `${GMAIL}/messages?maxResults=${Math.min(cap - ids.length, 100)}` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const page = await gmailFetch(url, accessToken);
    const rows = (page?.messages ?? []) as { id?: string }[];
    for (const r of rows) if (r.id) ids.push(r.id);
    pageToken = (page?.nextPageToken as string | undefined) ?? null;
    if (!pageToken || rows.length === 0) break;
  }
  return { ids: ids.slice(0, cap), nextPageToken: pageToken };
}

// Backfill cursor encoding: while the initial mirror is still walking the
// mailbox, the cursor is `bf:<pageToken>|<historyId>` — the page to resume
// from plus the historyId captured when the walk STARTED (mail arriving
// mid-walk has newer history records, so the incremental phase that follows
// misses nothing; the ingest_key upsert makes any overlap a no-op). Once the
// walk completes, the cursor collapses to the bare historyId and pulls turn
// incremental. Parsing tolerates pageTokens containing '|' via lastIndexOf.
const BF_PREFIX = "bf:";
function parseBackfillCursor(cursor: string): { page: string; hist: string } | null {
  if (!cursor.startsWith(BF_PREFIX)) return null;
  const sep = cursor.lastIndexOf("|");
  if (sep < 0) return null;
  return { page: cursor.slice(BF_PREFIX.length, sep), hist: cursor.slice(sep + 1) };
}

/** Build the Gmail connector for one connected account. */
export function gmailConnector(address: string): Connector {
  return {
    async refreshAccessToken(refreshToken) {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AUTH_GOOGLE_ID ?? "",
          client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) {
        throw new Error(`gmail token refresh ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const j = (await res.json()) as { access_token: string; expires_in: number };
      return { accessToken: j.access_token, expiresIn: j.expires_in };
    },

    async mailboxTotal(accessToken) {
      const profile = await gmailFetch(`${GMAIL}/profile`, accessToken);
      const n = Number(profile?.messagesTotal ?? NaN);
      return Number.isFinite(n) ? n : null;
    },

    async listNewest(accessToken, n) {
      const { ids } = await listIds(accessToken, n);
      const out: PulledMessage[] = [];
      for (const id of ids) {
        const pm = await getMessage(accessToken, id, address, "metadata");
        if (pm) out.push(pm);
      }
      return out;
    },

    async pullSince(accessToken, cursor, cap) {
      let ids: string[] = [];
      let nextCursor: string | null = null;

      // Mid-backfill: keep walking the mailbox from the stored page until the
      // whole account is mirrored; only then switch to incremental history.
      const bf = cursor ? parseBackfillCursor(cursor) : null;
      if (bf) {
        const walk = await listIds(accessToken, cap, bf.page);
        ids = walk.ids;
        nextCursor = walk.nextPageToken
          ? `${BF_PREFIX}${walk.nextPageToken}|${bf.hist}`
          : bf.hist; // walk complete — incremental resumes from the start-of-walk historyId
        cursor = "handled-as-backfill";
      } else if (cursor) {
        // Incremental: history since the stored historyId (messagesAdded only).
        // History records are consumed whole (may overshoot the cap by one
        // record); on a cap-out the cursor resumes at the LAST PROCESSED
        // record id, never the mailbox head — the overflow is never skipped.
        const base = `${GMAIL}/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&maxResults=100`;
        const seen = new Set<string>();
        let pageToken: string | undefined;
        let lastRecordId: string | null = null;
        let capped = false;
        do {
          const page = await gmailFetch(base + (pageToken ? `&pageToken=${pageToken}` : ""), accessToken, true);
          if (page === null) {
            // startHistoryId expired (Gmail 404) — reset to a fresh full pull
            ids = [];
            nextCursor = null;
            cursor = null;
            break;
          }
          for (const h of (page.history ?? []) as { id?: string; messagesAdded?: { message?: { id?: string } }[] }[]) {
            if (ids.length >= cap) {
              capped = true;
              break;
            }
            for (const a of h.messagesAdded ?? []) {
              const id = a.message?.id;
              if (id && !seen.has(id)) {
                seen.add(id);
                ids.push(id);
              }
            }
            if (h.id) lastRecordId = String(h.id);
          }
          if (capped) {
            nextCursor = lastRecordId ?? cursor;
            break;
          }
          pageToken = page.nextPageToken as string | undefined;
          if (!pageToken) {
            nextCursor = page.historyId ? String(page.historyId) : (lastRecordId ?? cursor);
          }
        } while (pageToken);
      }

      if (!cursor) {
        // First pull (or expired cursor): start the full-mailbox walk. The
        // historyId is captured NOW so mail arriving mid-walk is covered by
        // the incremental phase; the walk itself continues run over run via
        // the bf: cursor until every record is mirrored (RD 2026-07-03).
        const profile = await gmailFetch(`${GMAIL}/profile`, accessToken);
        const hist = profile?.historyId ? String(profile.historyId) : null;
        const walk = await listIds(accessToken, cap);
        ids = walk.ids;
        nextCursor = walk.nextPageToken && hist
          ? `${BF_PREFIX}${walk.nextPageToken}|${hist}`
          : hist;
      }

      const messages: PulledMessage[] = [];
      for (const id of ids) {
        const pm = await getMessage(accessToken, id, address, "full");
        if (pm) messages.push(pm);
      }
      return { messages, nextCursor };
    },
  };
}
