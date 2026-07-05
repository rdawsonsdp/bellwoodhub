import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { auth } from "@/lib/auth";
import { logAudit, requestMeta } from "@/lib/audit";
import { POST as ingestEmail } from "../cron/ingest-email/route";
import { POST as ingestCalendar } from "../cron/ingest-calendar/route";
import { POST as embedMail } from "../cron/embed-mail/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a manual sync is a full email + calendar + embed pass

// The counter under the Sync button (RD 2026-07-03): live totals of what has
// been mirrored so far. Demo returns nulls — the button hides the line.
export async function GET() {
  try {
    if (DEMO) {
      return NextResponse.json({ messages: null, calendarEvents: null, lastSyncedAt: null });
    }
    const { query } = await import("@/lib/db");
    const rows = await query<{ messages: string; indexed: string; calendar_events: string; last_synced_at: string | null }>(
      `SELECT (SELECT count(*) FROM canonical.messages)      AS messages,
              (SELECT count(DISTINCT message_id) FROM canonical.chunks) AS indexed,
              (SELECT count(*) FROM app.calendar_events)      AS calendar_events,
              (SELECT max(last_synced_at)::text FROM pipeline.connector_accounts) AS last_synced_at`,
    );
    return NextResponse.json({
      messages: Number(rows[0]?.messages ?? 0),
      // ING-4 reconciliation: mirrored vs. embedded-for-search
      indexed: Number(rows[0]?.indexed ?? 0),
      calendarEvents: Number(rows[0]?.calendar_events ?? 0),
      lastSyncedAt: rows[0]?.last_synced_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// The Sync button (RD 2026-07-03): a user-triggered pull that replaces the
// cron on environments where Vercel doesn't fire schedules (preview/pilot)
// and gives the Mayor "refresh now" control everywhere. Runs the SAME
// ingest handlers the crons use — in-process, authorized with CRON_SECRET —
// so there is exactly one ingest code path.
export async function POST(req: NextRequest) {
  try {
    // The middleware already session-gates this route when AUTH_ENABLED=1;
    // this in-route check keeps the gate when the route is reached directly
    // (local dev with middleware off still allows, for smoke tests).
    const session = process.env.AUTH_ENABLED === "1" ? await auth() : null;
    if (process.env.AUTH_ENABLED === "1" && !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (DEMO) {
      return NextResponse.json({ ok: true, mode: "demo", note: "Demo mode — nothing to sync." });
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    const internal = (path: string) =>
      new NextRequest(new URL(path, req.nextUrl.origin), {
        headers: { authorization: `Bearer ${secret}` },
      });

    const emailRes = await ingestEmail(internal("/api/cron/ingest-email"));
    const email = await emailRes.json();
    const calRes = await ingestCalendar(internal("/api/cron/ingest-calendar"));
    const calendar = await calRes.json();
    // ING-4: embed what just landed (and work down the backlog). A short
    // budget keeps the whole pass under maxDuration; the button's
    // auto-continue loop finishes the backlog across passes.
    const embedRes = await embedMail(internal("/api/cron/embed-mail?budget=60000"));
    const embed = await embedRes.json();

    // more to do? — the button auto-continues while any account is
    // mid-backfill or the search index is still catching up to the mirror
    const results = (email?.results ?? []) as { backfillRemaining?: boolean }[];
    const backfillRemaining = results.some((r) => r.backfillRemaining);
    const embedRemaining = Number(embed?.remaining ?? 0) > 0;

    await logAudit({
      actor: session?.user?.email ?? null,
      action: "sync.manual",
      meta: { email, calendar, embed, backfillRemaining, embedRemaining },
      req,
    });
    return NextResponse.json({ ok: !!(email.ok && calendar.ok && embed.ok !== false), backfillRemaining, embedRemaining, email, calendar, embed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
