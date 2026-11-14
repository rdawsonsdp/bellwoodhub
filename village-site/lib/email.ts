import { Resend } from "resend";

// All outgoing email goes through Resend. Without RESEND_API_KEY (local
// development, previews) emails are logged instead of sent, so every form
// still works end to end.
const apiKey = process.env.RESEND_API_KEY;
// TODO(content): set EMAIL_FROM to an address on the Village's verified domain.
const from = process.env.EMAIL_FROM ?? "Village of Bellwood <onboarding@resend.dev>";

export const hasResend = Boolean(apiKey);

export async function sendEmail(message: {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<{ ok: boolean }> {
  if (!apiKey) {
    console.info("[email not sent — RESEND_API_KEY is not set]", message.subject, "→", message.to);
    return { ok: true };
  }
  const { error } = await new Resend(apiKey).emails.send({ from, ...message });
  if (error) console.error("sendEmail failed", error.message);
  return { ok: !error };
}

/** Add someone to the newsletter audience in Resend (when one is configured). */
export async function addNewsletterContact(email: string): Promise<{ ok: boolean }> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) return { ok: true };
  const { error } = await new Resend(apiKey).contacts.create({ email, audienceId, unsubscribed: false });
  if (error) console.error("addNewsletterContact failed", error.message);
  return { ok: !error };
}
