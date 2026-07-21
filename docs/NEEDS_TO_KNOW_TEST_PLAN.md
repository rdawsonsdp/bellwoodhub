# Needs to Know (Chief of Staff briefing) — test plan

Tests the live intelligence briefing end-to-end against the real mailbox
(`bellwoodhub-agent-test`, RD's Gmail). Run locally, `DEMO_MODE=0`, auth off.

## Inputs (T0)
- **T0.1** Run all agents: `POST /api/cron/agent-runs` (Bearer CRON_SECRET) → every agent `ok`, produces run headlines + any actItems/drafts.
- **T0.2** Run triage: `POST /api/cron/triage` → `needsReply` populated & ranked.

## Assembly (T1) — `POST /api/morning-summary`
- **T1.1** Returns 200 with a `MorningSummary`.
- **T1.2** `narrative` is model-voiced (`live: true`) and factual — mentions only items present in `pressing`/`calendar` (no invented items or numbers).
- **T1.3** `pressing` = actions (pending drafts, tag `draft ready`) + top email issues (triage, tag `needs reply`), ranked, deduped, ≤6, **every item has a `messageId`** where one exists.
- **T1.4** `calendar` = upcoming events from `app.calendar_events` (or empty, honestly).
- **T1.5** `agents` = real latest run headlines (excludes `chief`).
- **T1.6** `counts.needYou` = drafts + triage needs_reply.

## Links resolve (T2)
- **T2.1** Every `pressing[].messageId` opens a real email: `GET /api/email?mid=<id>` → 200.

## Tuning / persona (T3)
- **T3.1** `tone: "brisk"` yields a shorter, more direct narrative than `warm`.
- **T3.2** `persona.instructions` are honored (voice shifts when set).
- **T3.3** `persona.mayorName` appears in the greeting.

## Resilience (T4)
- **T4.1** Live-path failure falls back to the fixture briefing (never 500) — the Hub always renders.
- **T4.2** Empty inputs (no triage/drafts/calendar) → baseline narrative renders honestly ("you're clear").

## Hub render (T5)
- **T5.1** The Hub shows one **"Needs to know"** section (narrative + ranked issues + Coming up); the separate "Needs you" preview and "Needs you now" block are gone (combined).
- **T5.2** Tapping an issue opens the real email; "All email issues →" / "Approvals →" navigate.

## Regression (T6)
- **T6.1** `npx tsc --noEmit` clean; `npm run build` clean.
- **T6.2** `/hub` → 200 (auth off) / 307 (auth on).
