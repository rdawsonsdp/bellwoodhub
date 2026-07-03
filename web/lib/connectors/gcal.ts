/*
 * gcal.ts — Google Calendar connector (the pilot's schedule source). Plain
 * fetch against the Calendar v3 REST API — no SDK dependency, matching
 * gmail.ts. Scope calendar.readonly only; the refresh token is the SAME
 * Google grant the Gmail connector uses (pipeline.connector_accounts, one
 * row per Google account), so the OAuth consent must include the calendar
 * scope or the pull 403s honestly.
 *
 * Read-only forever: this module lists events, nothing else — no create,
 * no respond, no delete. Landing into app.calendar_events is the cron
 * route's job (app/api/cron/ingest-calendar), so the connector stays
 * testable without a database.
 */

const GCAL = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One calendar event, mapped to the app.calendar_events row shape. */
export interface PulledEvent {
  eventRef: string; // Google event id
  title: string | null; // summary
  startsAt: string; // start.dateTime, or start.date for all-day
  endsAt: string | null;
  allDay: boolean; // date-only start
  status: string; // confirmed / tentative / cancelled
  location: string | null;
  raw: Record<string, unknown>; // the provider event, verbatim
}

/** Mint an access token from the stored refresh token — the same
 *  AUTH_GOOGLE_ID/_SECRET flow as gmailConnector.refreshAccessToken
 *  (mirrored here; gmail.ts keeps its copy inside the Connector). */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`gcal token refresh ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: j.access_token, expiresIn: j.expires_in };
}

/** GET a Calendar URL with backoff on 429/403-rate — same posture as gmailFetch. */
async function calFetch(url: string, accessToken: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) {
      const after = parseInt(res.headers.get("retry-after") ?? "2", 10);
      await sleep(Math.min(isNaN(after) ? 2 : after, 30) * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`gcal ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }
  throw new Error("gcal: still throttled after 4 attempts");
}

interface GcalEvent {
  id?: string;
  summary?: string;
  status?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

function toPulled(e: GcalEvent): PulledEvent | null {
  const startsAt = e.start?.dateTime || e.start?.date;
  if (!e.id || !startsAt) return null;
  return {
    eventRef: e.id,
    title: e.summary ?? null,
    startsAt,
    endsAt: e.end?.dateTime || e.end?.date || null,
    allDay: !!e.start?.date, // all-day events carry date, not dateTime
    status: e.status ?? "confirmed",
    location: e.location ?? null,
    raw: e as Record<string, unknown>,
  };
}

/** Upcoming events on the primary calendar, recurring instances expanded
 *  (singleEvents), oldest first. The window (−7d … +60d by default) is the
 *  rolling mirror ingest-calendar replaces wholesale each run. */
export async function listUpcoming(
  accessToken: string,
  opts: { timeMinDaysAgo?: number; timeMaxDaysAhead?: number } = {},
): Promise<PulledEvent[]> {
  const { timeMinDaysAgo = 7, timeMaxDaysAhead = 60 } = opts;
  const now = Date.now();
  const timeMin = new Date(now - timeMinDaysAgo * 86_400_000).toISOString();
  const timeMax = new Date(now + timeMaxDaysAhead * 86_400_000).toISOString();
  const base =
    `${GCAL}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250` +
    `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;

  const out: PulledEvent[] = [];
  let pageToken: string | undefined;
  do {
    const page = await calFetch(base + (pageToken ? `&pageToken=${pageToken}` : ""), accessToken);
    for (const e of (page.items ?? []) as GcalEvent[]) {
      const pe = toPulled(e);
      if (pe) out.push(pe);
    }
    pageToken = page.nextPageToken as string | undefined;
  } while (pageToken);
  return out;
}
