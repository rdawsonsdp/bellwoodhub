/*
 * cos-notes.ts — the Mayor's own notes (FEAT-36, walk-ins).
 *
 * One smart button: the mayor holds Ask and just TALKS. prepareUtterance()
 * decides whether the transcript is a QUESTION (route to Ask) or a NOTE
 * ("remember to cut the tree on Forrest Street" → an open follow-up), and
 * cleans a note into a staff-item: punctuation fixed, a short title extracted.
 * Confirm-first: nothing is written until the client calls saveNote() on the
 * mayor's Keep tap.
 *
 * Keyless-safe by design: the Haiku call is best-effort; a deterministic
 * classifier + first-words title always works, so DEMO and key-outage paths
 * behave identically to the happy path, just less polished.
 */
import { query } from "./db";
import { TENANT_ID } from "./tenant";

export interface PreparedUtterance {
  kind: "note" | "question";
  /** short staff-item title, e.g. "Tree removal — Forrest Street" (notes only) */
  title: string;
  /** the cleaned full text (notes) or the transcript unchanged (questions) */
  body: string;
}

export interface CosNote {
  id: string;
  title: string;
  body: string;
  source: "voice" | "text";
  status: "open" | "done";
  createdAt: string;
  /** briefing nudge: open longer than NUDGE_DAYS */
  stale: boolean;
}

/** Open notes older than this get a "still open" nudge in the briefing. */
export const NUDGE_DAYS = 3;

// ── deterministic fallback (also the DEMO classifier) ────────────────────────

const QUESTION_RE = /^(what|when|who|where|why|how|did|do|does|is|are|was|were|can|could|show|find|list|any|has|have)\b|\?\s*$/i;

export function prepareDeterministic(transcript: string): PreparedUtterance {
  const t = transcript.trim();
  if (QUESTION_RE.test(t)) return { kind: "question", title: "", body: t };
  // strip the spoken preamble, keep the instruction as the note body
  const body = t.replace(/^(remember( to)?|note( to self)?|reminder( to)?|tell (the )?(chief|staff|team)( to)?|add( a)? (note|reminder))[,:\s]+/i, "").trim() || t;
  const words = body.split(/\s+/);
  const title = words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : "");
  return { kind: "note", title: title.charAt(0).toUpperCase() + title.slice(1), body };
}

// ── the smart route (Haiku when a key is present) ────────────────────────────

export async function prepareUtterance(transcript: string): Promise<PreparedUtterance> {
  const base = prepareDeterministic(transcript);
  if (!process.env.ANTHROPIC_API_KEY) return base;
  try {
    const { complete } = await import("./agents/claude");
    const out = await complete({
      task: "classify",
      maxTokens: 300,
      system:
        `You triage one spoken utterance from a mayor into his own staff system. ` +
        `Decide: is it a QUESTION about his records/calendar (route to search), or a NOTE — ` +
        `something he wants remembered or followed up ("remember to cut the tree on Forrest Street", ` +
        `a walk-in request, a task, an observation)? Statements and instructions are notes; ` +
        `only genuine information requests are questions. ` +
        `For a note, clean the speech into a written follow-up: fix punctuation/casing, drop filler ` +
        `("um", "remember to"), KEEP every concrete fact (names, streets, dates) exactly as spoken — never add any. ` +
        `Respond with ONLY JSON: {"kind":"note"|"question","title":string,"body":string}. ` +
        `"title": ≤8 words, noun-first like a staff item ("Tree removal — Forrest Street"). ` +
        `"body": the cleaned note, 1–2 sentences. For a question, title="" and body=the transcript unchanged.`,
      user: transcript.trim(),
    });
    const j = JSON.parse(out.trim().replace(/^```json?\s*|\s*```$/g, "")) as Partial<PreparedUtterance>;
    if ((j.kind === "note" || j.kind === "question") && typeof j.body === "string" && j.body.trim()) {
      return { kind: j.kind, title: (j.title ?? "").trim() || base.title, body: j.body.trim() };
    }
    return base;
  } catch {
    return base; // model trouble must never block a walk-in note
  }
}

// ── persistence ──────────────────────────────────────────────────────────────

type Row = { id: string; body: string; source: "voice" | "text"; status: "open" | "done"; created_at: string; stale: boolean };

/** The stored body is "Title\nBody" — the schema stays one column (018), the
 *  title is presentation. Split on read; degrade to first-line title. */
const pack = (title: string, body: string) => (title && title !== body ? `${title}\n${body}` : body);
const unpack = (stored: string): { title: string; body: string } => {
  const nl = stored.indexOf("\n");
  if (nl > 0 && nl <= 90) return { title: stored.slice(0, nl), body: stored.slice(nl + 1) };
  return { title: stored.split(/\s+/).slice(0, 8).join(" "), body: stored };
};

export async function saveNote(title: string, body: string, source: "voice" | "text"): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO app.cos_notes (tenant, body, source) VALUES ($1, $2, $3) RETURNING id`,
    [TENANT_ID, pack(title.trim(), body.trim()).slice(0, 2000), source],
  );
  return rows[0].id;
}

export async function listNotes(status: "open" | "all" = "open", limit = 20): Promise<CosNote[]> {
  const rows = await query<Row>(
    `SELECT id, body, source, status, created_at::text,
            (status = 'open' AND created_at < now() - make_interval(days => $3)) AS stale
       FROM app.cos_notes
      WHERE tenant = $1 AND ($2 = 'all' OR status = $2)
      ORDER BY status = 'open' DESC, created_at DESC
      LIMIT $4`,
    [TENANT_ID, status, NUDGE_DAYS, limit],
  );
  return rows.map((r) => ({ id: r.id, ...unpack(r.body), source: r.source, status: r.status, createdAt: r.created_at, stale: r.stale }));
}

export async function setNoteStatus(id: string, status: "open" | "done"): Promise<void> {
  await query(
    `UPDATE app.cos_notes SET status = $2, done_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END
      WHERE tenant = $1 AND id = $3`,
    [TENANT_ID, status, id],
  );
}
