import { NextRequest, NextResponse } from "next/server";
import { listDrafts, createDraft, setDraftStatus } from "@/lib/screens";
import { DEMO, demoDrafts, demoDecideDraft, demoSaveDraft } from "@/lib/demo";
import { logAudit } from "@/lib/audit";
import { canSend } from "@/lib/send-cage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TENANT = "00000000-0000-0000-0000-000000000001";

interface SendOutcome {
  sent: boolean;
  note: string;
}

/** The caged transmission (L1.7): runs AFTER the approve is recorded. The
 *  human decision and the send are separate facts — a cage refusal or a
 *  provider error leaves the draft approved, with the outcome on the row
 *  (sent_at / send_error) and in the ledger. */
async function sendApprovedDraft(draftId: string, req: NextRequest): Promise<SendOutcome> {
  const { query } = await import("@/lib/db");
  const rows = await query<{
    recipients: string | null; subject: string | null; body: string | null;
    to_message_id: string | null; kind: string;
  }>(
    `SELECT recipients, subject, body, to_message_id, kind
       FROM app.drafts WHERE draft_id = $1 AND tenant_id = $2`,
    [draftId, TENANT],
  );
  const d = rows[0];
  if (!d) return { sent: false, note: "draft not found" };
  if (d.kind !== "draft_reply" || !d.to_message_id) {
    return { sent: false, note: "approved — not a reply draft, nothing to transmit" };
  }

  const verdict = canSend(d.recipients);
  if (!verdict.allowed) {
    await query(`UPDATE app.drafts SET send_error = $2 WHERE draft_id = $1`, [draftId, `cage: ${verdict.reason}`]);
    void logAudit({ actor: null, action: "draft.send.caged", objectType: "draft", objectRef: draftId, meta: { reason: verdict.reason }, req });
    return { sent: false, note: `approved — not sent: ${verdict.reason}` };
  }

  try {
    // resolve the original message's account + provider thread for a true reply
    const ctx = await query<{ source_thread_ref: string | null; account: string | null; provider: string | null }>(
      `SELECT t.source_thread_ref, m.provenance->>'_account' AS account, m.provenance->>'_provider' AS provider
         FROM canonical.messages m LEFT JOIN canonical.threads t ON t.thread_id = m.thread_id
        WHERE m.source_ref = $1 AND m.tenant_id = $2 LIMIT 1`,
      [d.to_message_id, TENANT],
    );
    const c = ctx[0];
    if (!c?.account || c.provider !== "gmail") {
      return { sent: false, note: "approved — sending is wired for Gmail accounts only (Outlook send lands with the Mayor's Entra consent)" };
    }
    const acct = await query<{ id: string }>(
      `SELECT id FROM pipeline.connector_accounts WHERE provider = 'gmail' AND address = $1 LIMIT 1`,
      [c.account],
    );
    if (!acct[0]) return { sent: false, note: "approved — no connected account for this mailbox" };
    const { getRefreshToken } = await import("@/lib/connectors/token-store");
    const refreshToken = await getRefreshToken(acct[0].id);
    if (!refreshToken) return { sent: false, note: "approved — no token on file; sign in again" };
    const { sendGmailReply } = await import("@/lib/connectors/gmail-send");
    const providerId = await sendGmailReply(refreshToken, {
      to: d.recipients ?? "",
      from: c.account,
      subject: d.subject ?? "(no subject)",
      bodyText: d.body ?? "",
      inReplyTo: d.to_message_id,
      gmailThreadId: c.source_thread_ref,
    });
    await query(`UPDATE app.drafts SET sent_at = NOW(), send_error = NULL WHERE draft_id = $1`, [draftId]);
    void logAudit({ actor: null, action: "draft.sent", objectType: "draft", objectRef: draftId, meta: { to: d.recipients, subject: d.subject, providerId }, req });
    return { sent: true, note: `sent to ${d.recipients}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(`UPDATE app.drafts SET send_error = $2 WHERE draft_id = $1`, [draftId, message.slice(0, 500)]).catch(() => {});
    void logAudit({ actor: null, action: "draft.send.failed", objectType: "draft", objectRef: draftId, meta: { error: message.slice(0, 300) }, req });
    return { sent: false, note: `approved — send failed: ${message.slice(0, 200)}` };
  }
}

export async function GET() {
  try {
    if (DEMO) return NextResponse.json({ drafts: demoDrafts("pending"), sendLive: false });
    // sendLive: the cage is armed — approving here really transmits
    return NextResponse.json({ drafts: await listDrafts("pending"), sendLive: process.env.SEND_ENABLED === "1" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Actions: draft (generate + persist), approve, discard. 'approve' records the
// human decision, THEN attempts the caged transmission (L1.7): SEND_ENABLED +
// SAFE_SEND_ALLOWLIST gate what actually leaves; the response carries the
// outcome so the UI can say "sent" vs "approved, not sent" honestly.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if ((body.action === "approve" || body.action === "discard") && typeof body.draftId === "string") {
      // actor: null until L0.1 threads the session email through
      void logAudit({ actor: null, action: `draft.${body.action}`, objectType: "draft", objectRef: body.draftId, req });
      if (DEMO) return NextResponse.json({ drafts: demoDecideDraft(body.draftId) });
      await setDraftStatus(body.draftId, body.action === "approve" ? "approved" : "discarded");
      const outcome = body.action === "approve" ? await sendApprovedDraft(body.draftId, req) : null;
      return NextResponse.json({ drafts: await listDrafts("pending"), ...(outcome ?? {}) });
    }
    if (body.action === "save" && typeof body.draftId === "string") {
      void logAudit({ actor: null, action: "draft.save", objectType: "draft", objectRef: body.draftId, req });
      if (DEMO) return NextResponse.json({ drafts: demoSaveDraft(body.draftId, { subject: body.subject, body: body.body }) });
      // Live edit-persist not yet wired; return the current list so the UI stays consistent.
      return NextResponse.json({ drafts: await listDrafts("pending") });
    }
    if (body.action === "draft" && typeof body.messageId === "string") {
      if (DEMO) return NextResponse.json({ error: "Drafting is disabled in the demo." }, { status: 400 });
      const draft = await createDraft(body.messageId, typeof body.intent === "string" ? body.intent : undefined);
      return NextResponse.json({ draft });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
