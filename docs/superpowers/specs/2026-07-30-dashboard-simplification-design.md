# Dashboard simplification — design

**Date:** 2026-07-30
**Status:** approved, ready for implementation planning

## Problem

The Dashboard asks the mayor to read seven widgets, a greeting banner, a floating
narrative overlay, a footer stat bar, and a twelve-icon unlabeled nav rail before
he learns anything. The three facts he actually opens the app for are buried
among machinery that exists to show off how the system works.

Worse, "the Dashboard" is two unrelated components that have drifted apart:
desktop renders `DashboardHub`, mobile renders `NeedsToKnowCard`
(`WallScreen.tsx:137-143`). They share data sources and nothing else.

## Outcome

A person opens the app and immediately knows three things:

1. What is coming up, and whether anything conflicts.
2. Which emails are urgent.
3. What is waiting on his approval.

Plus a search bar to ask anything about the record. Nothing else belongs on this
screen. The agents behind the answers are implementation detail — the end user
wants the data, not the org chart.

## Layout

Both platforms render the same three panels in the same order. Mobile and
desktop stay separate components per the house rule, but they stop being
different products.

```
┌──────────────────────────────────────┐
│  🔍  Ask anything about the record   │   pinned, both platforms
└──────────────────────────────────────┘

  TODAY & COMING UP             next 7d
  ┌──────────────────────────────────┐
  │ Thu 5:00p  Village Board mtg     │
  │ Fri 9:00a  ⚡ conflicts w/ FOIA   │
  └──────────────────────────────────┘

  URGENT EMAIL                      14
  ┌──────────────────────────────────┐
  │ ⚠ Account recovery — unresolved  │
  │   active account takeover risk   │
  │                     [Open email] │
  └──────────────────────────────────┘

  WAITING ON YOU                     2
  ┌──────────────────────────────────┐
  │ Re: Water billing — A. Whitaker  │
  │ draft ready       [Review][Send] │
  └──────────────────────────────────┘
```

### Panel 1 — Today & coming up

Source: `GET /api/events`, next 7 days. Row is time, title, location.

**Conflict detection is new.** Nothing computes overlaps today. Two events whose
intervals intersect are both flagged. All-day events do not conflict with timed
events. The flag is advisory — it never hides or reorders an event.

Empty state names the actual reason (no calendar connected vs. connected and
genuinely clear). Never fixtures in a live build.

### Panel 2 — Urgent email

Source: the ranked issue list already in the `/api/wall` payload — the current
`SecurityAlertsCard`. This is the strongest thing on the existing page and needs
no new data work.

Row: severity, subject, one line of why it ranked, `Open email`. The `View agent`
action is removed. The agent-avatar `WorkingTheater` loading animation is removed
in favor of a plain skeleton.

### Panel 3 — Waiting on you

Source: `GET /api/queue`. Row is recipient, subject, `Review` / `Send`.

This is the R3 human gate and its strictness does not change. Nothing sends
without an explicit human action.

## Removed from the Dashboard

Greeting banner and village logo · the floating Chief-of-Staff narrative overlay ·
Sync Progress · Priority Matrix · Recent Email Actions · Active Agents ·
`WorkingTheater` · the footer stat bar.

These are deletions from *this screen*, not from the app. Sync, Activity, and
Agents remain reachable from More.

## Navigation

Mobile's tab bar is already close to correct and does not change:
Dashboard · Email Actions · Queue · Ask (FAB).

Desktop's twelve-icon rail collapses to those same four destinations plus a
single **More** disclosure holding the operator screens: Emails, Calendar,
History, Sources, Sync, Activity, Admin, Agents. The existing Mayor/Operator
toggle continues to gate what appears inside More.

Nothing is deleted from navigation.

## Consolidation: retire the desktop Approvals screen

Four surfaces currently front the same approve-a-draft loop: "Email Actions"
(`needsyou`), "Queue", desktop "Approvals" (`settings`, `ChiefApp.tsx:196`), and
the Dashboard's "Pending approvals" card. This is the largest single source of
"which one do I use?" in the product.

Desktop "Approvals" is retired. Queue does the same job on both platforms, and
the Dashboard's "Waiting on you" panel deep-links into it.

## Calendar wiring

`app.calendar_events` is empty, so `/api/events` returns `[]`. The cause is not a
missing grant.

- The Google grant exists on `rdawson@strategicdataproducts.com` and has already
  mirrored 125,459 messages.
- Calendar rides that same Gmail grant (`cron/ingest-calendar/route.ts:13`).
- That account's row is `status='error'` from a Gmail 404 on the last mail sync.
- `cron/ingest-calendar` selects only `status='active'` accounts, so it skips the
  account entirely.

**A mail-sync failure silently disqualifies calendar ingest.** Calendar and mail
ride one grant but are independent capabilities and must fail independently. The
account selection is widened to accounts holding a usable refresh token, and
calendar ingest is run to confirm real events land.

Known and accepted: the events shown are the developer's calendar, not a mayor's.
That is the documented pilot arrangement in the route's own comments.

## Non-goals

- No change to triage ranking, agent behavior, or autonomy levels.
- No change to the R3 send gate.
- No new screens.
- No refactor of `ChiefApp.tsx` / `MobileApp.tsx` beyond the nav and dashboard
  work described here.

## Constraints

- Everything works in DEMO_MODE, on both mobile and desktop.
- Inline styles and `lib/cos-design` tokens; no CSS modules.
- Typecheck and a clean production build before any deploy.
- Live builds show honest empty states rather than fixtures.
