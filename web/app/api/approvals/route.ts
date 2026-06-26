import { NextRequest, NextResponse } from "next/server";
import { listDrafts, createDraft, setDraftStatus } from "@/lib/screens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ drafts: await listDrafts("pending") });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Actions: draft (generate + persist), approve, discard. 'approve' records the
// human decision; it does NOT send (R3 — no send connector in Phase 0).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "draft" && typeof body.messageId === "string") {
      const draft = await createDraft(body.messageId, typeof body.intent === "string" ? body.intent : undefined);
      return NextResponse.json({ draft });
    }
    if ((body.action === "approve" || body.action === "discard") && typeof body.draftId === "string") {
      await setDraftStatus(body.draftId, body.action === "approve" ? "approved" : "discarded");
      return NextResponse.json({ drafts: await listDrafts("pending") });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
