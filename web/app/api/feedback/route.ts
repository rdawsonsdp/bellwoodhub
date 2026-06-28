import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTAL = "https://project-status-ten.vercel.app";
const REPO = process.env.GITHUB_REPO || "rdawsonsdp/bellwoodhub";

/*
 * /api/feedback — the Mayor's quick notes (typed or voice) from the footer button.
 *
 * When GITHUB_TOKEN is set, each note opens a real GitHub issue in REPO and the
 * dialog links straight to it. Without a token (keyless demo) it still captures
 * the note in memory and links to the project portal, so nothing breaks.
 */
interface Note { id: string; text: string; page?: string; at: string; issueUrl?: string }
const notes: Note[] = [];
let seq = 0;

async function createGitHubIssue(text: string, page?: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const title = `Mayor feedback: ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`;
    const md = `${text}\n\n---\n_Submitted via the in-app feedback button${page ? ` · page \`${page}\`` : ""}._`;
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "bellwood-hub-feedback",
      },
      body: JSON.stringify({ title, body: md }),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => ({} as { html_url?: string }));
    return typeof d.html_url === "string" ? d.html_url : null;
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Empty note." }, { status: 400 });
    const page = typeof body.page === "string" ? body.page : undefined;
    seq += 1;
    const id = `FB-${seq}`;
    const issueUrl = await createGitHubIssue(text, page);
    notes.unshift({ id, text, page, at: new Date().toISOString(), issueUrl: issueUrl ?? undefined });
    return NextResponse.json({ ok: true, id, url: issueUrl ?? PORTAL, kind: issueUrl ? "issue" : "portal" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
