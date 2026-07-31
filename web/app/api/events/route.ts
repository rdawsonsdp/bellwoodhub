import { NextResponse } from "next/server";
import { DEMO, demoEvents, type DemoEvent } from "@/lib/demo";
import { markConflicts } from "@/lib/event-conflicts";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Mayor's local clock — dueLabel renders in his day, not the server's.
const TZ = "America/Chicago";

interface CalRow {
  id: string;
  account_address: string;
  title: string | null;
  starts_at: Date;
  ends_at: Date | null;
  all_day: boolean;
  location: string | null;
}

/** "Sun Jun 28 · 5:00 PM" — the gmail-calendar fixture idiom. */
function dueLabel(d: Date, allDay: boolean): string {
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
  if (allDay) return `${day} · all day`;
  return `${day} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}`;
}

// Events — actionable items derived from the seed corpus (demo). Each links to
// its source email. Live: the app.calendar_events mirror (Google Calendar via
// cron/ingest-calendar) mapped to the same shape; no source email to drill to,
// so messageId stays empty. Empty table → honest empty, never fixtures.
/** Stamp conflictsWith onto every event. Advisory — order is never changed. */
function withConflicts(events: DemoEvent[]): DemoEvent[] {
  const conflicts = markConflicts(events.map((e) => ({
    id: e.id,
    date: e.date,
    endDate: e.endDate ?? null,
    allDay: e.allDay ?? false,
  })));
  return events.map((e) => ({ ...e, conflictsWith: conflicts.get(e.id) ?? [] }));
}

export async function GET() {
  try {
    if (!DEMO) {
      const rows = await query<CalRow>(
        `SELECT id, account_address, title, starts_at, ends_at, all_day, location
           FROM app.calendar_events
          WHERE status <> 'cancelled'
            AND starts_at >= now() - interval '7 days'
            AND starts_at <  now() + interval '60 days'
          ORDER BY starts_at`,
      );
      const now = Date.now();
      const events: DemoEvent[] = rows.map((r) => {
        const starts = new Date(r.starts_at);
        return {
          id: r.id,
          title: r.title ?? "(untitled)",
          who: r.location ?? r.account_address,
          role: "Calendar",
          dueLabel: dueLabel(starts, r.all_day),
          status: "open" as const,
          stream: "Resident" as const,
          topic: null,
          messageId: "",
          date: starts.toISOString(),
          endDate: r.ends_at ? new Date(r.ends_at).toISOString() : null,
          allDay: r.all_day,
          why: "Google Calendar event",
          source: "gmail" as const, // gcal rides the Gmail grant → the Gmail lane in the UI
        };
      });
      const open = events.filter((e) => new Date(e.date).getTime() >= now).length;
      return NextResponse.json({ events: withConflicts(events), stats: { open, late: 0, done: 0 } });
    }
    const d = demoEvents();
    return NextResponse.json({ ...d, events: withConflicts(d.events) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
