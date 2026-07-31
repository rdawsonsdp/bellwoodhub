# Dashboard Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Dashboard to three panels — what's coming up, which email is urgent, what's waiting on the mayor's approval — plus the Ask bar, on both mobile and desktop.

**Architecture:** Extract the three panels into shared presentational components under `components/chief/dashboard/` that take data as props and hold no fetching logic. `DashboardHub` (desktop) and `NeedsToKnowCard` (mobile) each become thin containers that fetch and arrange those same three panels in the same order, so the two platforms can no longer drift. Conflict detection is a pure function in `lib/` with its own test; everything it needs (`ends_at`) already exists in the table and is simply not selected today.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, inline styles + `lib/cos-design` tokens, Postgres via `lib/db`. Tests are hand-rolled `check()` scripts run with `npx tsx`, per the existing `eval/` idiom — there is no test framework in this repo.

## Global Constraints

- Everything must work in DEMO_MODE (`DEMO = !process.env.DATABASE_URL || DEMO_MODE==="1"`). API routes branch `if (DEMO) return demoX()`.
- Mobile (`MobileApp.tsx`, ≤768px) and desktop (`ChiefApp.tsx`) are separate components. Every change lands in BOTH.
- Inline styles with tokens from `lib/cos-design` (`C`, `FONT`) and the `P` / `SANS` palette exported from `DashboardHub.tsx`. No CSS modules.
- Live builds show honest empty states. Never render fixtures in a live build.
- All commands run from `web/`, never the repo root.
- Typecheck (`npx tsc --noEmit`) and build (`npm run build`) before any deploy.
- Do not commit or push unless the user asks.

---

### Task 1: Conflict detection as a pure function

**Files:**
- Create: `web/lib/event-conflicts.ts`
- Test: `web/eval/event-conflicts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export interface ConflictInput { id: string; date: string; endDate: string | null; allDay: boolean }` and `export function markConflicts(events: ConflictInput[]): Map<string, string[]>` — maps each event id to the ids it overlaps. Task 2 and Task 4 both call `markConflicts`.

- [ ] **Step 1: Write the failing test**

Create `web/eval/event-conflicts.test.ts`:

```ts
/*
 * event-conflicts.test.ts — the overlap rule for the Dashboard's
 * "Today & coming up" panel.
 *
 *   cd web && npx tsx eval/event-conflicts.test.ts
 *
 * Rules under test: timed events overlap when their intervals intersect;
 * touching endpoints do not overlap; all-day events never conflict with
 * timed events; a missing end time is treated as a 60-minute default.
 */
import { markConflicts, type ConflictInput } from "../lib/event-conflicts";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const ev = (id: string, start: string, end: string | null, allDay = false): ConflictInput =>
  ({ id, date: start, endDate: end, allDay });

function main() {
  console.log("overlap detection");

  const overlapping = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
    ev("b", "2026-07-30T14:30:00Z", "2026-07-30T15:30:00Z"),
  ]);
  check("intersecting intervals conflict both ways",
    overlapping.get("a")?.includes("b") === true && overlapping.get("b")?.includes("a") === true);

  const touching = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
    ev("b", "2026-07-30T15:00:00Z", "2026-07-30T16:00:00Z"),
  ]);
  check("back-to-back events do not conflict", touching.size === 0, `got ${touching.size}`);

  const separate = markConflicts([
    ev("a", "2026-07-30T09:00:00Z", "2026-07-30T10:00:00Z"),
    ev("b", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
  ]);
  check("disjoint events do not conflict", separate.size === 0);

  const allDay = markConflicts([
    ev("a", "2026-07-30T00:00:00Z", null, true),
    ev("b", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
  ]);
  check("all-day never conflicts with a timed event", allDay.size === 0, `got ${allDay.size}`);

  const noEnd = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", null),
    ev("b", "2026-07-30T14:30:00Z", "2026-07-30T15:30:00Z"),
  ]);
  check("missing end time defaults to 60 minutes and still conflicts",
    noEnd.get("a")?.includes("b") === true);

  const three = markConflicts([
    ev("a", "2026-07-30T14:00:00Z", "2026-07-30T17:00:00Z"),
    ev("b", "2026-07-30T14:30:00Z", "2026-07-30T15:00:00Z"),
    ev("c", "2026-07-30T16:00:00Z", "2026-07-30T16:30:00Z"),
  ]);
  check("one long event conflicts with both overlappers",
    three.get("a")?.length === 2 && three.get("b")?.length === 1 && three.get("c")?.length === 1,
    JSON.stringify([...three]));

  check("empty input is empty output", markConflicts([]).size === 0);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd web && npx tsx eval/event-conflicts.test.ts
```

Expected: FAIL — cannot find module `../lib/event-conflicts`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/event-conflicts.ts`:

```ts
/*
 * event-conflicts.ts — which calendar events collide.
 *
 * The Dashboard's "Today & coming up" panel flags overlaps so the mayor sees a
 * double-booking without reading times. Advisory only: a conflict never hides
 * or reorders an event.
 *
 * All-day events are excluded. A village-wide "Public Works Week" all-day entry
 * overlaps every meeting that week, which would flag the whole calendar and
 * teach the mayor to ignore the badge.
 */

/** Google gives no end time for some entries; assume a one-hour meeting. */
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd web && npx tsx eval/event-conflicts.test.ts
```

Expected: every check prints `✓`, final line `PASS`, exit 0.

- [ ] **Step 5: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no output.

---

### Task 2: `/api/events` returns end times and conflict flags

**Files:**
- Modify: `web/app/api/events/route.ts:36-60`
- Modify: `web/lib/demo/index.ts:85-89` (the `DemoEvent` interface)

**Interfaces:**
- Consumes: `markConflicts`, `ConflictInput` from Task 1.
- Produces: every event object in the `/api/events` response gains `endDate: string | null`, `allDay: boolean`, and `conflictsWith: string[]`. Tasks 3 and 4 read `conflictsWith.length > 0` to render the flag.

- [ ] **Step 1: Widen the `DemoEvent` type**

In `web/lib/demo/index.ts`, replace the interface at line 85:

```ts
export interface DemoEvent {
  id: string; title: string; who: string | null; role: string; dueLabel: string;
  status: "open" | "late" | "done"; stream: StreamKey; topic: string | null;
  messageId: string; date: string; why: string; source?: "gov" | "gmail";
  /** ISO end; null when the provider omitted it (fixtures leave it null) */
  endDate?: string | null;
  allDay?: boolean;
  /** ids of events this one overlaps — filled in by /api/events, never stored */
  conflictsWith?: string[];
}
```

The three new fields are optional so the existing JSON fixtures under
`lib/demo/data/` continue to typecheck untouched.

- [ ] **Step 2: Select `ends_at` and attach conflicts in the live branch**

In `web/app/api/events/route.ts`, add `ends_at` to the `CalRow` interface:

```ts
interface CalRow {
  id: string;
  account_address: string;
  title: string | null;
  starts_at: Date;
  ends_at: Date | null;
  all_day: boolean;
  location: string | null;
}
```

Change the query at line 37 to select it:

```ts
const rows = await query<CalRow>(
  `SELECT id, account_address, title, starts_at, ends_at, all_day, location
     FROM app.calendar_events
    WHERE status <> 'cancelled'
      AND starts_at >= now() - interval '7 days'
      AND starts_at <  now() + interval '60 days'
    ORDER BY starts_at`,
);
```

Add `endDate` and `allDay` to the mapped event object, immediately after the
existing `date` field:

```ts
date: starts.toISOString(),
endDate: r.ends_at ? new Date(r.ends_at).toISOString() : null,
allDay: r.all_day,
```

- [ ] **Step 3: Attach conflicts to whichever branch produced the events**

Add the import at the top of `web/app/api/events/route.ts`:

```ts
import { markConflicts } from "@/lib/event-conflicts";
```

Add this helper above `GET`:

```ts
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
```

Wrap both return paths — the live one and the `demoEvents()` one — so the demo
Dashboard shows conflicts too. Every `NextResponse.json({ events, stats })` in
this file becomes `NextResponse.json({ events: withConflicts(events), stats })`.

- [ ] **Step 4: Verify the shape in DEMO mode**

```bash
cd web && DEMO_MODE=1 npx next dev -p 3201 &
sleep 8
curl -s 'http://localhost:3201/api/events' | python3 -m json.tool | head -30
kill %1
```

Expected: each event object contains `endDate`, `allDay`, and `conflictsWith`
keys. The demo fixtures have no end times, so most `conflictsWith` will be `[]`
unless two fixture events start within the same hour.

- [ ] **Step 5: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no output.

---

### Task 3: Unblock calendar ingest

**Files:**
- Modify: `web/app/api/cron/ingest-calendar/route.ts:39-42`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: rows in `app.calendar_events`, which Task 2's route reads.

**Background:** calendar rides the Gmail grant. The account row for
`rdawson@strategicdataproducts.com` sits at `status='error'` after a Gmail 404 on
mail sync, and this route selects only `status='active'` accounts — so a mail
failure silently disqualifies calendar ingest even though the grant and refresh
token are both fine. Mail and calendar are independent capabilities on one grant
and must fail independently.

- [ ] **Step 1: Widen account selection**

Replace the query at line 39:

```ts
// Calendar rides the Gmail grant but is a SEPARATE capability: a mail-sync
// failure (status='error') must not disqualify calendar ingest. Any account
// that is not explicitly revoked/disconnected is a candidate; the per-account
// try/catch below handles a token that turns out to be dead.
const accounts = await query<AccountRow>(
  `SELECT id, address FROM pipeline.connector_accounts
    WHERE provider = 'gmail'
      AND status NOT IN ('revoked', 'disconnected')
    ORDER BY created_at`,
);
```

- [ ] **Step 2: Confirm the status values you just excluded actually exist**

```bash
cd /Users/robd/u01/mayor && node -e "
const {Client}=require('./web/node_modules/pg');
require('./web/node_modules/dotenv').config({path:'web/.env.local'});
const c=new Client({connectionString:process.env.DATABASE_URL});
c.connect().then(()=>c.query(\"SELECT status, count(*) FROM pipeline.connector_accounts WHERE provider='gmail' GROUP BY status\"))
 .then(r=>{console.table(r.rows);return c.end();});
"
```

Expected: shows the statuses in use. If `revoked` / `disconnected` are not the
actual strings, correct the `NOT IN` list to match what the table really
contains before continuing — do not guess.

- [ ] **Step 3: Run the ingest against the live grant**

```bash
cd /Users/robd/u01/mayor && grep -m1 CRON_SECRET web/.env.local
# then, with that value:
curl -s "http://localhost:3200/api/cron/ingest-calendar?k=<CRON_SECRET>" | python3 -m json.tool
```

Expected: a per-account result object. A failure here naming the token
("no refresh token on file") means re-consent is genuinely required and the user
must be told — do not work around it.

- [ ] **Step 4: Confirm rows landed and reach the API**

```bash
curl -s http://localhost:3200/api/events | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('events:', len(d['events']))
for e in d['events'][:5]:
    print(' ', e['dueLabel'], '|', e['title'], '| conflicts:', len(e.get('conflictsWith',[])))
"
```

Expected: a non-zero count with real titles. If it stays `0`, stop and report —
that means the grant is not usable and the panel ships with its empty state.

---

### Task 4: The three shared panel components

**Files:**
- Create: `web/components/chief/dashboard/panels.tsx`

**Interfaces:**
- Consumes: `P`, `SANS`, `WCard`, `btnSolid`, `btnOutline` from `../DashboardHub`; `PressingItem` from `@/lib/morning`; `QueueItem` from `@/lib/queue`; `DemoEvent` from `@/lib/demo`.
- Produces: three components consumed by Tasks 5 and 6:
  - `UpcomingPanel({ events, loading, onGoCalendar }: { events: DemoEvent[]; loading: boolean; onGoCalendar?: () => void })`
  - `UrgentEmailPanel({ items, loading, onOpenEmail }: { items: PressingItem[]; loading: boolean; onOpenEmail?: (mid: string) => void })`
  - `WaitingOnYouPanel({ items, loading, onGoQueue }: { items: QueueItem[]; loading: boolean; onGoQueue?: () => void })`

All three are presentational: they fetch nothing, own no effects, and render
identically on mobile and desktop. Width is controlled by the container.

- [ ] **Step 1: Write the panels**

Create `web/components/chief/dashboard/panels.tsx`:

```tsx
"use client";
/*
 * panels.tsx — the three things the Dashboard exists to say:
 * what's coming up, which mail is urgent, what's waiting on the mayor.
 *
 * Presentational only — no fetching, no effects. MobileApp and ChiefApp each
 * fetch and pass the same props, so the two platforms cannot drift again.
 *
 * HONESTY RULE (house non-negotiable): empty states name the real reason.
 * Nothing here is decorative.
 */
import type { PressingItem } from "@/lib/morning";
import type { QueueItem } from "@/lib/queue";
import type { DemoEvent } from "@/lib/demo";
import { P, SANS, WCard, btnSolid, btnOutline } from "../DashboardHub";

/* ── shared chrome ──────────────────────────────────────────────────────── */
function PanelHead({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: P.text2 }}>{title}</span>
      {typeof count === "number" && count > 0 && (
        <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 800, color: P.text }}>{count}</span>
      )}
      {hint && <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 10.5, color: P.text3 }}>{hint}</span>}
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 15, borderRadius: 6, background: "rgba(20,51,92,.07)", animation: "dashSkeleton 1.4s ease-in-out infinite", animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.text3, lineHeight: 1.55 }}>{children}</div>;
}

/* ── 1. Today & coming up ───────────────────────────────────────────────── */
export function UpcomingPanel({ events, loading, onGoCalendar }: {
  events: DemoEvent[];
  loading: boolean;
  onGoCalendar?: () => void;
}) {
  const upcoming = events.slice(0, 6);
  return (
    <WCard>
      <PanelHead title="Today & coming up" hint="next 7 days" />
      {loading ? <Skeleton rows={3} /> : upcoming.length === 0 ? (
        <Empty>No calendar is connected yet, so there is nothing to show. Events appear here the moment it syncs.</Empty>
      ) : (
        <div style={{ display: "grid", gap: 11 }}>
          {upcoming.map((e) => {
            const conflicted = (e.conflictsWith?.length ?? 0) > 0;
            return (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: conflicted ? P.red : P.amber, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 800, color: P.text }}>{e.dueLabel}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: P.text2, overflowWrap: "anywhere" }}>{e.title}</div>
                  {conflicted && (
                    <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: P.red, marginTop: 3 }}>
                      Conflicts with {e.conflictsWith!.length} other event{e.conflictsWith!.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {onGoCalendar && (
        <button onClick={onGoCalendar} style={{ ...btnOutline, alignSelf: "flex-start", marginTop: 13 }}>Full calendar ›</button>
      )}
    </WCard>
  );
}

/* ── 2. Urgent email ────────────────────────────────────────────────────── */
export function UrgentEmailPanel({ items, loading, onOpenEmail }: {
  items: PressingItem[];
  loading: boolean;
  onOpenEmail?: (mid: string) => void;
}) {
  return (
    <WCard>
      <PanelHead title="Urgent email" count={items.length} />
      {loading ? <Skeleton rows={4} /> : items.length === 0 ? (
        <Empty>Nothing urgent in the mail right now.</Empty>
      ) : (
        <div className="scrl" style={{ display: "grid", gap: 0, overflowY: "auto", maxHeight: 520, margin: "0 -18px" }}>
          {items.map((a, i) => (
            <div key={i} style={{ padding: "13px 18px", borderTop: i ? `1px solid ${P.border}` : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: i === 0 ? P.red : i < 3 ? P.amber : "#A8A29A", flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 800, color: P.text, lineHeight: 1.3, overflowWrap: "anywhere" }}>{a.title}</span>
              </div>
              {a.why && (
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.text2, lineHeight: 1.5, marginTop: 5, overflowWrap: "anywhere" }}>{a.why}</div>
              )}
              {a.messageId && onOpenEmail && (
                <button onClick={() => onOpenEmail(a.messageId!)} style={{ ...btnSolid, marginTop: 10 }}>Open email ↗</button>
              )}
            </div>
          ))}
        </div>
      )}
    </WCard>
  );
}

/* ── 3. Waiting on you ──────────────────────────────────────────────────── */
export function WaitingOnYouPanel({ items, loading, onGoQueue }: {
  items: QueueItem[];
  loading: boolean;
  onGoQueue?: () => void;
}) {
  return (
    <WCard>
      <PanelHead title="Waiting on you" count={items.length} />
      {loading ? <Skeleton rows={2} /> : items.length === 0 ? (
        <Empty>Nothing waiting on you — the queue is clear.</Empty>
      ) : (
        <div style={{ display: "grid", gap: 11 }}>
          {items.slice(0, 5).map((q) => (
            <div key={q.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: P.amber, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 800, color: P.text, overflowWrap: "anywhere" }}>{q.subject}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: P.text3, overflowWrap: "anywhere" }}>to {q.to}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {onGoQueue && items.length > 0 && (
        <button onClick={onGoQueue} style={{ ...btnSolid, alignSelf: "flex-start", marginTop: 13 }}>Review &amp; approve ›</button>
      )}
    </WCard>
  );
}
```

- [ ] **Step 2: Add the skeleton keyframe**

Append to `web/app/globals.css`:

```css
/* Dashboard panel loading skeleton (RD 2026-07-30) */
@keyframes dashSkeleton {
  0%, 100% { opacity: .45; }
  50%      { opacity: .9; }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no output. The file is not yet imported anywhere, so this only proves
it compiles.

---

### Task 5: Desktop Dashboard renders the three panels

**Files:**
- Modify: `web/components/chief/DashboardHub.tsx:346-438` (the default export only)

**Interfaces:**
- Consumes: `UpcomingPanel`, `UrgentEmailPanel`, `WaitingOnYouPanel` from Task 4.
- Produces: `DashboardHub` keeps its existing prop signature minus `onGoSync`, `onGoAgents`, `onGoActivity`, and `onOpenAgent`, which no longer have a consumer on this screen. Task 7 removes the now-unused arguments at the `WallScreen` call site.

**Keep the exports.** `P`, `SANS`, `WCard`, `WHead`, `btnSolid`, and `btnOutline`
are imported by `NeedsYouScreen.tsx:17`, `AgentsPage.tsx:10`, and Task 4's
`panels.tsx`. Deleting them breaks three files.

- [ ] **Step 1: Replace the default export**

Replace everything from `/* ── the grid ── */` (line 346) to the end of the file:

```tsx
/* ── the Dashboard ──────────────────────────────────────────────────────────
   Three panels, in the order the mayor asks the questions: what's coming up,
   what mail is urgent, what needs my sign-off. Plus the Ask bar in the shell
   above. The widget grid (sync chart, priority matrix, recent actions, active
   agents, the working theater) was removed 2026-07-30 — the agents behind the
   answers are implementation detail, and the mayor wants the data.
   ─────────────────────────────────────────────────────────────────────────── */
export default function DashboardHub({ onOpenEmail, onGoApprovals, onGoCalendar }: {
  onOpenEmail?: (mid: string) => void;
  onGoApprovals: () => void;
  onGoCalendar?: () => void;
}) {
  const [sum, setSum] = useState<MorningSummary | null>(null);
  const [events, setEvents] = useState<DemoEvent[] | null>(null);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/morning-summary", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona: getCosPersona(), hour: new Date().getHours() }),
    }).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: MorningSummary) => live && setSum(d))
      .catch(() => live && setSum({ pressing: [] } as unknown as MorningSummary));
    fetch("/api/events").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { events?: DemoEvent[] }) => live && setEvents(d.events ?? []))
      .catch(() => live && setEvents([]));
    fetch("/api/queue").then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { items?: QueueItem[] }) => live && setQueue(d.items ?? []))
      .catch(() => live && setQueue([]));
    return () => { live = false; };
  }, []);

  return (
    <div style={{ background: P.bg, borderRadius: 20, padding: 16, marginTop: 18, display: "grid", gap: 14, maxWidth: 820 }}>
      <UpcomingPanel events={events ?? []} loading={events === null} onGoCalendar={onGoCalendar} />
      <UrgentEmailPanel items={sum?.pressing ?? []} loading={sum === null} onOpenEmail={onOpenEmail} />
      <WaitingOnYouPanel items={queue ?? []} loading={queue === null} onGoQueue={onGoApprovals} />
    </div>
  );
}
```

- [ ] **Step 2: Fix the imports at the top of the file**

`WallPayload`, `AgentAvatar`, and `PressingItem` may become unused in this file
once the widgets below are deleted in Step 3. Update the import block to:

```tsx
import { useEffect, useState } from "react";
import { FONT } from "@/lib/cos-design";
import { getCosPersona, type MorningSummary, type PressingItem } from "@/lib/morning";
import type { QueueItem } from "@/lib/queue";
import type { DemoEvent } from "@/lib/demo";
import { AgentAvatar } from "./AgentBadge";
import { UpcomingPanel, UrgentEmailPanel, WaitingOnYouPanel } from "./dashboard/panels";
```

Note this creates a circular import (`DashboardHub` → `panels` → `DashboardHub`)
for the `P` / `SANS` / `WCard` tokens. ES modules handle this because the tokens
are consumed at render time, not module-evaluation time. Verify with the build in
Task 8; if the build warns, move `P`, `SANS`, `WCard`, `btnSolid`, and
`btnOutline` into a new `web/components/chief/dashboard/tokens.ts` and re-export
them from `DashboardHub.tsx` so existing importers keep working.

- [ ] **Step 3: Delete the retired widgets**

Delete these exported functions from `DashboardHub.tsx`, which now have no
callers: `WorkingTheater` (line 68), `SecurityAlertsCard` (98), `MetricCard`
(188), `EventsWidget` (202), `SyncChartWidget` (228), `MatrixWidget` (268),
`ListMetricsCard` (300), `ActiveAgentsCard` (325).

Before deleting each, confirm it has no other importer:

```bash
cd web && for f in WorkingTheater SecurityAlertsCard MetricCard EventsWidget SyncChartWidget MatrixWidget ListMetricsCard ActiveAgentsCard; do
  echo "$f: $(grep -rl "$f" components app lib --include=*.tsx --include=*.ts | grep -v DashboardHub.tsx | tr '\n' ' ')"
done
```

Expected: `AgentsPage.tsx` still imports `WorkingTheater` (`AgentsPage.tsx:10`).
**Keep `WorkingTheater`** — it is used on the Agents page, which is staying.
Delete the other seven only if the command shows no other file.

- [ ] **Step 4: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no output. Errors here will point at `WallScreen.tsx` still passing
removed props — Task 7 fixes that; if you are running tasks in order, fix the
call site now by removing the dropped props.

---

### Task 6: Mobile Dashboard renders the same three panels

**Files:**
- Modify: `web/components/chief/NeedsToKnowCard.tsx:39-244` (the default export)

**Interfaces:**
- Consumes: the three panels from Task 4.
- Produces: `NeedsToKnowCard` keeps its existing props (`mobile`, `onOpenEmail`, `onGoNeedsYou`, `onGoApprovals`, `onOpenAgent`) so `WallScreen.tsx:138` does not need to change signature; `onOpenAgent` becomes unused and is dropped in Task 7.

**Keep `StoryMode`** (line 251) — it is the swipeable card deck and is reachable
from this component. The Brief masthead, the pressing-item list, and the "Coming
up" list inside `NeedsToKnowCard` are replaced by the three panels; `StoryMode`
stays as an optional full-screen read.

- [ ] **Step 1: Replace the card body with the three panels**

In the default export, keep the existing `sum` and `notes` fetching effects and
the `StoryMode` toggle. Replace the rendered body (the masthead, pressing list,
notes list, and "Coming up" block) with:

```tsx
<div style={{ display: "grid", gap: 12 }}>
  <UpcomingPanel events={events ?? []} loading={events === null} onGoCalendar={undefined} />
  <UrgentEmailPanel items={sum?.pressing ?? []} loading={sum === null} onOpenEmail={onOpenEmail} />
  <WaitingOnYouPanel items={queue ?? []} loading={queue === null} onGoQueue={onGoApprovals} />
</div>
```

- [ ] **Step 2: Add the two fetches this component did not have**

`NeedsToKnowCard` fetches `/api/morning-summary` and `/api/cos-notes` today. Add
events and queue alongside them, inside the same effect:

```tsx
fetch("/api/events").then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((d: { events?: DemoEvent[] }) => live && setEvents(d.events ?? []))
  .catch(() => live && setEvents([]));
fetch("/api/queue").then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((d: { items?: QueueItem[] }) => live && setQueue(d.items ?? []))
  .catch(() => live && setQueue([]));
```

with the matching state declarations:

```tsx
const [events, setEvents] = useState<DemoEvent[] | null>(null);
const [queue, setQueue] = useState<QueueItem[] | null>(null);
```

and imports:

```tsx
import type { QueueItem } from "@/lib/queue";
import type { DemoEvent } from "@/lib/demo";
import { UpcomingPanel, UrgentEmailPanel, WaitingOnYouPanel } from "./dashboard/panels";
```

- [ ] **Step 3: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no output.

---

### Task 7: Navigation — desktop More menu, retire the duplicate Approvals screen

**Files:**
- Modify: `web/components/chief/ChiefApp.tsx:78` (Screen union), `:119` (allowlist), `:196` (render switch), `:262-295` (sidebar groups)
- Modify: `web/components/chief/WallScreen.tsx:137-143` (drop removed props)
- Modify: `web/components/chief/MobileApp.tsx:290-303` (NAV_ITEMS grouping)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports.

- [ ] **Step 1: Retire the desktop `settings` (Approvals) screen**

`Queue` and `Approvals` are the same job. In `ChiefApp.tsx`:

- Remove `"settings"` from the `Screen` union at line 78.
- Remove `{item("settings", "Approvals", <Ico d={ICON.approvals} />)}` at line 291.
- Remove the `settings` case from the render switch at line 196.
- Delete the now-unused `Approvals` component (line 1420) after confirming
  nothing else references it:

```bash
cd web && grep -rn "Approvals" components/chief/ChiefApp.tsx | head
```

Any `go("settings")` call sites become `go("queue")`.

- [ ] **Step 2: Collapse the operator group into a More disclosure**

Replace the `{operator && (...)}` block at lines 282-294 with a collapsible
group. Add near the other `useState` calls in `Sidebar`:

```tsx
const [moreOpen, setMoreOpen] = useState(false);
```

and replace the block:

```tsx
{operator && (
  <>
    <button onClick={() => setMoreOpen((m) => !m)} className={collapsed ? "navTip" : undefined}
      data-tip={collapsed ? "More" : undefined} aria-label="More"
      aria-expanded={moreOpen}
      style={{
        textAlign: "left", cursor: "pointer", border: 0, borderRadius: 11,
        padding: collapsed ? "11px 0" : "10px 12px", marginTop: 10,
        display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : undefined,
        gap: 12, fontFamily: FONT.sans, fontSize: 14, fontWeight: 600,
        background: "transparent", color: C.text3,
      }}>
      <Ico d={["M4 12h16", "M4 6h16", "M4 18h16"]} />
      {!collapsed && <span style={{ flex: 1 }}>More</span>}
      {!collapsed && <span style={{ transform: moreOpen ? "rotate(90deg)" : undefined, display: "inline-block", fontSize: 12 }}>›</span>}
    </button>
    {moreOpen && (
      <>
        {item("brief", "Emails", <Ico d={ICON.mail} />)}
        {item("track", "Calendar", <Ico d={ICON.events ?? ICON.track} />)}
        {item("memory", "History", <Ico d={ICON.memory} />)}
        {item("agents", "Agents", <Star w={18} c="currentColor" />)}
        {item("sources", "Sources", <Ico d={ICON.sources} />)}
        {item("sync", "Sync", <Ico d={["M21 12a9 9 0 1 1-2.6-6.3", "M21 3v6h-6"]} />)}
        {item("activity", "Activity", <Ico d={["M12 7v5l3.5 2", "M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z"]} />)}
        {item("admin", "Admin", <Ico d={ICON.admin} />)}
      </>
    )}
  </>
)}
```

Also remove the standalone `{item("agents", "Agents", …)}` at line 272 and its
sub-menu block at lines 273-281 — Agents now lives inside More. Update the
Operator-toggle help text at line 309 to match:

```tsx
Reveals Emails, Calendar, History, Agents, Sources, Sync, Activity, and Admin
under More. The Mayor&apos;s view is Dashboard · Email Actions · Queue · Ask.
```

- [ ] **Step 3: Update the Mayor-mode allowlist**

Line 119 becomes, matching the four top-level destinations:

```tsx
const MAYOR_SCREENS: Screen[] = ["today", "needsyou", "queue", "ask"];
```

- [ ] **Step 4: Fix the `WallScreen` call site**

At `WallScreen.tsx:141`, `DashboardHub` no longer takes `wall`, `onOpenAgent`,
`onGoNeedsYou`, `onGoSync`, `onGoAgents`, or `onGoActivity`:

```tsx
<DashboardHub onOpenEmail={onOpenEmail} onGoApprovals={onGoApprovals} onGoCalendar={onGoCalendar} />
```

Leave the mobile `NeedsToKnowCard` call at line 138 as it is; its signature did
not change.

- [ ] **Step 5: Group the mobile drawer under More**

In `MobileApp.tsx`, the tab bar (lines 245-266) does not change. In `NavMenu`
(line 307), split `NAV_ITEMS` into the four primary destinations and the rest,
rendering the rest under a "More" heading. Update `MAYOR_SCREENS` at line 93 to
match desktop:

```tsx
const MAYOR_SCREENS: Screen[] = ["today", "needsyou", "queue", "ask"];
```

and add above `NAV_ITEMS`:

```tsx
/** The four destinations the Mayor sees. Everything else lives under More. */
const PRIMARY: Screen[] = ["today", "needsyou", "queue", "ask"];
```

In `NavMenu`, render `NAV_ITEMS.filter(([s]) => PRIMARY.includes(s))` first, then
— when `operator` — a `More` heading followed by
`NAV_ITEMS.filter(([s]) => !PRIMARY.includes(s))`.

- [ ] **Step 6: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no output.

---

### Task 8: Verify end to end

**Files:** none modified.

- [ ] **Step 1: Run the unit test**

```bash
cd web && npx tsx eval/event-conflicts.test.ts
```

Expected: `PASS`.

- [ ] **Step 2: Typecheck and production build**

```bash
cd web && npx tsc --noEmit && npm run build
```

Expected: both clean. A circular-import warning naming `DashboardHub` means you
must do the `tokens.ts` extraction described in Task 5, Step 2.

- [ ] **Step 3: Verify the live dashboard**

```bash
cd web && npm run dev -- -p 3200 &
sleep 10
curl -s -o /dev/null -w 'hub: %{http_code}\n' -L http://localhost:3200/hub
for r in events queue morning-summary; do
  echo "--- /api/$r"
  curl -s -X POST -H 'content-type: application/json' -d '{"persona":"chief","hour":9}' "http://localhost:3200/api/$r" 2>/dev/null | head -c 200 ||
  curl -s "http://localhost:3200/api/$r" | head -c 200
  echo
done
```

Expected: `hub: 200` and all three routes returning JSON.

- [ ] **Step 4: Verify DEMO mode, which is the demo build**

```bash
cd web && DEMO_MODE=1 npx next dev -p 3201 &
sleep 10
curl -s -o /dev/null -w 'demo hub: %{http_code}\n' -L http://localhost:3201/hub
curl -s http://localhost:3201/api/events | head -c 200
kill %1
```

Expected: `demo hub: 200` and fixture events with `conflictsWith` present.

- [ ] **Step 5: Report honestly**

State which panels showed real data and which showed empty states, and confirm
mobile and desktop render the same three panels in the same order. Per the house
rule, the mayor's phone is the final look-and-feel check — say so rather than
claiming mobile was visually verified.

---

## Self-review notes

- **Spec coverage:** Panel 1 → Tasks 2, 3, 4, 5, 6. Panel 2 → Tasks 4, 5, 6.
  Panel 3 → Tasks 4, 5, 6. Conflict detection → Task 1. Removed widgets →
  Task 5 Step 3. Navigation / More → Task 7. Retire desktop Approvals →
  Task 7 Step 1. Calendar wiring → Task 3. Verification → Task 8.
- **Known risk:** the circular import in Task 5 Step 2, with the `tokens.ts`
  escape hatch spelled out.
- **Known risk:** Task 3 depends on a live Google refresh token. If it is dead,
  the panel ships with its empty state and the user must be told — Task 3
  Step 3 says so explicitly.
