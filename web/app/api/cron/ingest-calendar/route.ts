import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getRefreshToken } from "@/lib/connectors/token-store";
import { refreshGoogleAccessToken, listUpcoming } from "@/lib/connectors/gcal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // one windowed list call per account — far lighter than mail

// The calendar mirror (pilot: RD's Google Calendar, Tuesday: the Mayor's):
// for every 'active' Gmail connector_accounts row — the calendar rides the
// SAME Google grant as mail — refresh the token, list the primary calendar's
// −7d…+60d window, and replace that account's slice of app.calendar_events
// wholesale (delete-then-insert: cancellations and reschedules never linger
// in a rolling 60-day mirror). Feeds /api/events and the Wall's "Coming up"
// card. Gated exactly like cron/ingest-email.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return false;
}

interface AccountRow {
  id: string;
  address: string;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (DEMO) {
      // fixtures serve the calendar in demo mode — there is nothing to pull
      return NextResponse.json({ ok: true, mode: "demo", note: "DEMO mode: fixture events serve the app; live ingest requires DATABASE_URL + active connector_accounts rows." });
    }
    const accounts = await query<AccountRow>(
      `SELECT id, address FROM pipeline.connector_accounts
        WHERE status = 'active' AND provider = 'gmail' ORDER BY created_at`,
    );
    const results: Record<string, unknown>[] = [];
    for (const a of accounts) {
      try {
        // token lives in Supabase Vault, resolved by ref (Gap 5.3) — never read inline
        const refreshToken = await getRefreshToken(a.id);
        if (!refreshToken) throw new Error("no refresh token on file — re-consent via sign-in");
        const { accessToken } = await refreshGoogleAccessToken(refreshToken);
        const events = await listUpcoming(accessToken, { timeMinDaysAgo: 7, timeMaxDaysAhead: 60 });

        // Replace this account's window wholesale — the mirror is the window.
        await query(
          `DELETE FROM app.calendar_events WHERE provider = 'gcal' AND account_address = $1`,
          [a.address],
        );
        for (const e of events) {
          await query(
            `INSERT INTO app.calendar_events
               (provider, account_address, event_ref, title, starts_at, ends_at, all_day, status, location, raw)
             VALUES ('gcal', $1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (provider, account_address, event_ref) DO UPDATE SET
               title = EXCLUDED.title, starts_at = EXCLUDED.starts_at,
               ends_at = EXCLUDED.ends_at, all_day = EXCLUDED.all_day,
               status = EXCLUDED.status, location = EXCLUDED.location,
               raw = EXCLUDED.raw, synced_at = now()`,
            [a.address, e.eventRef, e.title, e.startsAt, e.endsAt, e.allDay, e.status, e.location, JSON.stringify(e.raw)],
          );
        }
        results.push({ ok: true, account: a.address, pulled: events.length });
      } catch (err) {
        // record and keep the fleet moving — deliberately NOT flipping the
        // account to status='error' (that would stall MAIL ingest too; a
        // missing calendar.readonly scope must never take the inbox down)
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[/api/cron/ingest-calendar] gmail:${a.address}`, message);
        results.push({ ok: false, account: a.address, error: message });
      }
    }
    void logAudit({ actor: null, action: "ingest.calendar", meta: { accounts: accounts.length, results } });
    return NextResponse.json({ ok: results.every((r) => r.ok), accounts: accounts.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/cron/ingest-calendar]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
