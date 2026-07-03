/*
 * types.ts — the email connector contract (docs/EMAIL_INGESTION.md stages 3–4).
 *
 * A Connector is provider-shaped fetch code and nothing else: it refreshes an
 * access token, lists newest headers (the stage-3 dry run — writes nothing),
 * and pulls incrementally from a persisted cursor (stage 4). Landing into
 * pipeline/canonical is the cron route's job (app/api/cron/ingest-email), so
 * connectors stay testable without a database. Read-only forever: no
 * connector method sends, moves, or deletes mail.
 */

export interface PulledMessage {
  sourceRef: string; // RFC Message-ID (Graph internetMessageId / Gmail Message-ID header)
  threadRef: string; // Graph conversationId / Gmail threadId
  direction: "inbound" | "outbound" | "internal";
  fromName: string | null;
  fromEmail: string | null;
  toEmail: string | null; // comma-joined
  cc: string | null; // comma-joined
  subject: string | null;
  sentAt: string; // ISO timestamp
  bodyHtml: string | null;
  bodyText: string | null;
  hasAttachments: boolean;
  provider: "outlook" | "gmail";
  address: string; // the connected account the message was pulled from
}

export interface Connector {
  /** Mint a short-lived access token from the stored refresh token. */
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  /** Stage-3 dry run: newest N messages (headers; bodies may be absent). Writes nothing. */
  listNewest(accessToken: string, n: number): Promise<PulledMessage[]>;
  /** Stage-4 incremental pull from a persisted cursor (null = first pull, capped).
   *  nextCursor is persisted by the caller; null means "keep the old cursor". */
  pullSince(
    accessToken: string,
    cursor: string | null,
    cap: number,
  ): Promise<{ messages: PulledMessage[]; nextCursor: string | null }>;
}

/**
 * Minimal HTML→text so an HTML-only body still yields a usable bodyText.
 * A stand-in until clean_text parity (stage 5) — the real quote/sig stripper
 * lives in clean_text.py and runs in the Python backfill.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
