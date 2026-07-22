import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prepareDeterministic, prepareUtterance, saveNote, listNotes, setNoteStatus } from "@/lib/cos-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * /api/cos-notes — the Mayor's own notes (FEAT-36, walk-ins).
 *
 *   GET               → open notes (the "Your notes" block + the briefing)
 *   POST {transcript} → PREPARE: classify note-vs-question + clean. NO WRITE —
 *                       confirm-first; the client saves on the Keep tap.
 *   POST {title,body,source} → SAVE the confirmed note.
 *   PATCH {id,status} → check off ('done') / reopen ('open').
 *
 * DEMO: deterministic classifier + fixture notes — keyless, no DB.
 */

const DEMO_NOTES = [
  { id: "demo-n1", title: "Tree removal — Forrest Street", body: "Resident walk-in: cut the downed tree on Forrest Street.", source: "voice", status: "open", createdAt: new Date(Date.now() - 864e5).toISOString(), stale: false },
  { id: "demo-n2", title: "Call Ms. Alvarez re: block party", body: "Follow up on the 24th Ave block-party permit before Friday.", source: "voice", status: "open", createdAt: new Date(Date.now() - 4 * 864e5).toISOString(), stale: true },
];

async function gate() {
  if (process.env.AUTH_ENABLED !== "1") return null;
  const session = await auth();
  return session?.user?.email ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    if (DEMO) return NextResponse.json({ notes: DEMO_NOTES });
    const denied = await gate();
    if (denied) return denied;
    return NextResponse.json({ notes: await listNotes("open") });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { transcript?: string; title?: string; body?: string; source?: string };

    // PREPARE — classify + clean, no write (confirm-first)
    if (typeof body.transcript === "string" && body.transcript.trim()) {
      if (DEMO) return NextResponse.json(prepareDeterministic(body.transcript));
      const denied = await gate();
      if (denied) return denied;
      return NextResponse.json(await prepareUtterance(body.transcript));
    }

    // SAVE — the confirmed note
    if (typeof body.body === "string" && body.body.trim()) {
      if (DEMO) return NextResponse.json({ ok: true, id: `demo-${Date.now()}` });
      const denied = await gate();
      if (denied) return denied;
      const source = body.source === "text" ? "text" : "voice";
      const id = await saveNote(body.title ?? "", body.body, source);
      void logAudit({ actor: null, action: "cos_note.create", objectType: "cos_note", objectRef: id, req });
      return NextResponse.json({ ok: true, id });
    }

    return NextResponse.json({ error: "Provide transcript (prepare) or title+body (save)." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
    if (!id || (status !== "done" && status !== "open")) {
      return NextResponse.json({ error: "Provide id and status ('done'|'open')." }, { status: 400 });
    }
    if (DEMO) return NextResponse.json({ ok: true });
    const denied = await gate();
    if (denied) return denied;
    await setNoteStatus(id, status);
    void logAudit({ actor: null, action: `cos_note.${status}`, objectType: "cos_note", objectRef: id, req });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
