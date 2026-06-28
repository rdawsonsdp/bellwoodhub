import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTAL = "https://project-status-ten.vercel.app";

/*
 * /api/feedback — the Mayor's quick notes (typed or voice) from the footer
 * button. Captured here and acknowledged with a link to the project portal.
 *
 * Demo: in-memory (resets on cold start). NEXT: forward each note to the portal
 * as a durable tracked issue (GitHub issue or Supabase) and notify the dev team,
 * so "FB-n" is a real clickable issue when they log into the portal.
 */
interface Note { id: string; text: string; page?: string; at: string }
const notes: Note[] = [];
let seq = 0;

export async function GET() {
  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Empty note." }, { status: 400 });
    seq += 1;
    const id = `FB-${seq}`;
    notes.unshift({ id, text, page: typeof body.page === "string" ? body.page : undefined, at: new Date().toISOString() });
    return NextResponse.json({ ok: true, id, url: PORTAL });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
