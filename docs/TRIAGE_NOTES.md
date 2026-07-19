# Triage & "What Needs You" — operator notes

Implements SPEC v1 (classify + rank + correct). One feature; non-goals per §9 of
the spec are NOT built (learned-rule loop, Morning Brief, calendar, drafting,
model-judgment mode).

## What it does

A system-level pass over the tenant's mail — **not an agent**. It buckets every
recent thread into `needs_reply` / `awaiting_others` / `fyi` and ranks the
`needs_reply` items by named, explainable weights. Each item carries a
plain-English **reason templated from which rules fired** (never model prose —
the FOIA-defensibility guarantee). The exec corrects any item; corrections apply
at read time without re-running the pass.

## How to run the pass

- **Cron:** `/api/cron/triage` — pre-dawn (`0 11 * * *`, ~6am CT) + hourly
  (`0 12-22 * * *`), registered in `web/vercel.json`. `CRON_SECRET`-gated.
- **On-demand (testing):** `POST /api/cron/triage` with
  `Authorization: Bearer $CRON_SECRET`. Prints `{threads, needsReply,
  awaitingOthers, fyi}`.

The pass windows to threads from the last **45 days**, capped at **400 threads**
per run (bounds model calls). Only inbound mail from non-automated senders hits
the model; outbound → `awaiting_others` and no-reply/marketing senders → `fyi`
are decided in code.

## The rules (where they live)

- **Weights:** `web/lib/triage/weights.ts` — one legible object. This *is* "how I
  prioritize." Edit here to change ranking.
- **Signals / bucketing:** `web/lib/triage/signals.ts` — pure, deterministic.
- **Soft signals:** `web/lib/triage/soft-signals.ts` — the one batched Haiku
  call. Returns **flags** (deadline date + informational-only), never an opinion.
  A marketing deadline is explicitly *not* the reader's deadline; a sales/cold
  blast is informational even when it "wants a reply."
- **Reason template:** `web/lib/triage/reason.ts` — fired signals → phrase
  fragments → the sentence. No model writes the reason.

## Corrections

`POST /api/triage/correct` `{messageId, correction}` where correction ∈
`not_important` | `bump_up` | `not_waiting_on_me`. Append-only to
`app.triage_corrections`. The read path (`lib/triage/read.ts`) applies the
**latest correction per message** as an overlay:

- `not_important` → shown under FYI
- `not_waiting_on_me` → shown under Awaiting others
- `bump_up` → pinned to the top of Needs you

**Verified:** correcting an item leaves its `message_triage` row untouched
(bucket unchanged) — the effect is purely the read overlay, no re-classification.

## Important-senders list ("People who matter" rail)

Lives in `app.important_senders`, **editable in-app** so the exec can update it
without a developer (RD directive, 2026-07-19). Seeded with per-tenant defaults
(`web/lib/triage/senders.ts`) on first pass; the exec adds/removes via the right
rail on the Needs You screen. `GET/POST/DELETE /api/triage/senders`.

## Where it lives (UI)

New **"Needs You"** nav screen (`components/chief/NeedsYouScreen.tsx`), desktop
and mobile. Main column = ranked list with reason + the three corrections; right
rail = the editable senders list; awaiting-others / FYI collapsed below.

## DEMO_MODE

`DEMO_MODE=1` renders the screen from `web/lib/triage/demo.ts` fixtures (one item
per bucket + a two-signal item) with no DB and no API keys.

## §10 open questions — decided

1. **Important-senders source:** table + in-app editor, seeded with defaults.
   (Chosen over a config file because the exec must edit it without a developer.)
2. **UI placement:** dedicated "Needs You" screen, not the Hub's agent-driven
   "Needs you now" block (different data source; the spec cautions against
   mixing them).
3. **Cron cadence:** separate `/api/cron/triage` route, pre-dawn + hourly.

## Verification (against the real ~14.5k-message mailbox)

- Pass writes one current row per thread; re-run replaces, never accumulates.
- Every `needs_reply` item has a bucket, score, ≥1 fired signal, non-empty
  templated reason.
- No exec-outbound thread in `needs_reply`; no newsletter/no-reply/marketing in
  `needs_reply` (49 → 5 after the soft-signal fix; the genuine business
  follow-up ranks #1).
- RLS verified: all three tables at INFO (deny-all), none anon-readable (BUG-3
  guard).
- Correction removes an item on re-render without re-running the pass.

## Known limitations (v1, by design)

- One cadence tuned for freshness; not per-exec-timezone.
- Cold recruiter threads the exec *has replied into* can still surface (real
  back-and-forth is indistinguishable from wanted correspondence by rule alone)
  — the correction is the escape hatch, and its data feeds the future
  learned-rule loop (non-goal here).
- The pass reads the `gov` lane; extend the query when a tenant triages a walled
  lane too.
