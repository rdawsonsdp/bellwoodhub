/*
 * gmail-send.ts — the caged send path (GO_LIVE_PLAN L1.7). Sends a REPLY via
 * the Gmail API: RFC 2822 raw message, base64url, threaded onto the original
 * conversation (threadId + In-Reply-To/References headers). Reached ONLY from
 * the approve handler AFTER lib/send-cage says yes — this module does no
 * gating of its own and must never be called from anywhere else.
 *
 * Requires the gmail.send scope on the account's refresh token (the consent
 * captured at sign-in; accounts consented before the scope was added must
 * re-consent — the API returns 403 insufficient scopes until then).
 */
import { refreshGoogleAccessToken } from "./gcal";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailReply {
  to: string;
  from: string; // the connected account — Gmail rewrites mismatches anyway
  subject: string;
  bodyText: string;
  inReplyTo: string | null; // the original RFC Message-ID, e.g. <abc@mail.gmail.com>
  gmailThreadId: string | null; // provider thread ref — keeps the reply in-conversation
}

/** RFC 2822 message, base64url-encoded for the Gmail API. */
export function buildRawReply(r: GmailReply): string {
  const msgId = r.inReplyTo ? (r.inReplyTo.startsWith("<") ? r.inReplyTo : `<${r.inReplyTo}>`) : null;
  const headers = [
    `To: ${r.to}`,
    `From: ${r.from}`,
    `Subject: ${r.subject}`,
    ...(msgId ? [`In-Reply-To: ${msgId}`, `References: ${msgId}`] : []),
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
  ];
  const raw = `${headers.join("\r\n")}\r\n\r\n${r.bodyText}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/** Send through the account's refresh token. Returns the provider message id. */
export async function sendGmailReply(refreshToken: string, reply: GmailReply): Promise<string> {
  const { accessToken } = await refreshGoogleAccessToken(refreshToken);
  const res = await fetch(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      raw: buildRawReply(reply),
      ...(reply.gmailThreadId ? { threadId: reply.gmailThreadId } : {}),
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    if (res.status === 403) {
      throw new Error(`gmail send 403 — the account's token predates the send scope; sign out and sign in again to re-consent (${text})`);
    }
    throw new Error(`gmail send ${res.status}: ${text}`);
  }
  const j = (await res.json()) as { id?: string };
  return j.id ?? "";
}
