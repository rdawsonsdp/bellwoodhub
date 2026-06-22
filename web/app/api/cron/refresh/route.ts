import { NextRequest, NextResponse } from "next/server";
import { query, toVector } from "@/lib/db";
import { openai, EMBED_MODEL } from "@/lib/openai";
import { generateBatch } from "@/lib/cron-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const N = 250; // records per weekly refresh
const DAY_MS = 86_400_000;
const EMAIL_COLS = [
  "message_id", "thread_id", "direction", "from_name", "from_email", "to_email",
  "cc", "subject", "date_sent", "body_raw", "body_clean", "topic", "is_synthetic",
];

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse if unconfigured
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true; // Vercel Cron
  if (req.nextUrl.searchParams.get("k") === secret) return true; // manual trigger
  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Anchor to the current week — but never behind the newest existing record,
    // and always advance at least a week so "this week" stays fresh.
    const maxRows = await query<{ m: Date | null }>("SELECT max(date_sent) AS m FROM poc.emails");
    const dbMax = maxRows[0]?.m ? new Date(maxRows[0].m as unknown as string).getTime() : Date.now();
    const anchor = new Date(Math.max(Date.now(), dbMax + 7 * DAY_MS));
    const runTs = Date.now();

    const nParam = parseInt(req.nextUrl.searchParams.get("n") || "", 10);
    const n = Number.isFinite(nParam) ? Math.min(N, Math.max(1, nParam)) : N;
    const recs = generateBatch(anchor, runTs, n);

    // Dry run: generate + return a sample without touching the DB.
    if (req.nextUrl.searchParams.get("dry")) {
      const dates = recs.map((e) => e.date_sent.slice(0, 10)).sort();
      return NextResponse.json({
        dry: true,
        count: recs.length,
        anchor: anchor.toISOString().slice(0, 10),
        date_range: [dates[0], dates[dates.length - 1]],
        topics: [...new Set(recs.map((e) => e.topic))],
        sample: recs.slice(0, 4).map((e) => ({
          date: e.date_sent.slice(0, 10),
          from: e.from_name,
          topic: e.topic,
          subject: e.subject,
        })),
      });
    }

    // 1) insert emails (batched), map message_id -> id (new rows only)
    const idByMsg = new Map<string, string>();
    for (let i = 0; i < recs.length; i += 100) {
      const batch = recs.slice(i, i + 100);
      const params: unknown[] = [];
      const rows = batch.map((e) => {
        const b = params.length;
        params.push(
          e.message_id, e.thread_id, e.direction, e.from_name, e.from_email,
          e.to_email, e.cc, e.subject, e.date_sent, e.body_raw, e.body_clean,
          e.topic, e.is_synthetic,
        );
        return "(" + EMAIL_COLS.map((_, k) => `$${b + k + 1}`).join(",") + ")";
      });
      const out = await query<{ id: string; message_id: string }>(
        `INSERT INTO poc.emails (${EMAIL_COLS.join(",")}) VALUES ${rows.join(",")}
         ON CONFLICT (message_id) DO NOTHING RETURNING id, message_id`,
        params,
      );
      for (const r of out) idByMsg.set(r.message_id, r.id);
    }

    const fresh = recs.filter((e) => idByMsg.has(e.message_id));

    // 2) embed each body and insert one chunk per email
    let chunks = 0;
    for (let i = 0; i < fresh.length; i += 128) {
      const batch = fresh.slice(i, i + 128);
      const resp = await openai().embeddings.create({
        model: EMBED_MODEL,
        input: batch.map((e) => e.body_clean),
      });
      const params: unknown[] = [];
      const rows = batch.map((e, j) => {
        const emb = resp.data[j].embedding as number[];
        const b = params.length;
        params.push(idByMsg.get(e.message_id), 0, e.body_clean, Math.ceil(e.body_clean.length / 4), toVector(emb));
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::extensions.vector)`;
      });
      await query(
        `INSERT INTO poc.email_chunks (email_id, chunk_index, chunk_text, token_count, embedding)
         VALUES ${rows.join(",")} ON CONFLICT (email_id, chunk_index) DO NOTHING`,
        params,
      );
      chunks += batch.length;
    }

    // 3) entities (person / address / business)
    const entVals: unknown[][] = [];
    for (const e of fresh) {
      const eid = idByMsg.get(e.message_id)!;
      for (const ent of e.entities) entVals.push([eid, ent.type, ent.value, ent.norm]);
    }
    let entities = 0;
    for (let i = 0; i < entVals.length; i += 400) {
      const batch = entVals.slice(i, i + 400);
      const params: unknown[] = [];
      const rows = batch.map((v) => {
        const b = params.length;
        params.push(v[0], v[1], v[2], v[3]);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
      });
      await query(
        `INSERT INTO poc.email_entities (email_id, entity_type, entity_value, entity_norm)
         VALUES ${rows.join(",")} ON CONFLICT (email_id, entity_type, entity_norm) DO NOTHING`,
        params,
      );
      entities += batch.length;
    }

    const newest = fresh.reduce((mx, e) => (e.date_sent > mx ? e.date_sent : mx), "");
    return NextResponse.json({
      ok: true,
      inserted: fresh.length,
      chunks,
      entities,
      anchor: anchor.toISOString().slice(0, 10),
      newest: newest.slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/cron/refresh]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
