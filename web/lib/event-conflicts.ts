/*
 * event-conflicts.ts — which calendar events collide.
 *
 * The Dashboard's "Today & coming up" panel flags overlaps so a double-booking
 * reads at a glance without parsing times. Advisory only: a conflict never
 * hides or reorders an event.
 *
 * All-day events are excluded. A week-long all-day entry overlaps every meeting
 * that week, which would flag the whole calendar and teach the reader to ignore
 * the badge.
 */

/** Google omits the end time on some entries; assume a one-hour meeting. */
const DEFAULT_MINUTES = 60;

export interface ConflictInput {
  id: string;
  /** ISO start */
  date: string;
  /** ISO end, or null when the provider omitted it */
  endDate: string | null;
  allDay: boolean;
}

interface Span { id: string; start: number; end: number }

function span(e: ConflictInput): Span | null {
  const start = new Date(e.date).getTime();
  if (!Number.isFinite(start)) return null;
  const parsedEnd = e.endDate ? new Date(e.endDate).getTime() : NaN;
  const end = Number.isFinite(parsedEnd) && parsedEnd > start
    ? parsedEnd
    : start + DEFAULT_MINUTES * 60_000;
  return { id: e.id, start, end };
}

/**
 * Map of event id → ids it overlaps. Events with no conflicts are absent, so
 * `.size === 0` means a clean calendar. Touching endpoints (one ends exactly as
 * the next begins) are not a conflict.
 */
export function markConflicts(events: ConflictInput[]): Map<string, string[]> {
  const spans = events.filter((e) => !e.allDay).map(span).filter((s): s is Span => s !== null);
  const out = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const cur = out.get(a);
    if (cur) cur.push(b);
    else out.set(a, [b]);
  };
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const x = spans[i], y = spans[j];
      if (x.start < y.end && y.start < x.end) {
        add(x.id, y.id);
        add(y.id, x.id);
      }
    }
  }
  return out;
}
