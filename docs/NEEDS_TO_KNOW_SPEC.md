# "Needs to Know" — spec v1

*The agents brief the mayor.* A third attention lane on the morning Hub: not
action (that's **Needs you now** = drafts to approve, and **Needs you** = mail to
reply to) but **awareness**. Each agent judges — non-deterministically — which of
its findings the mayor should simply *know*, and those rise here. The Fire agent:
"structure fire on Main St yesterday, no injuries." The Utility agent: "water rates
rose 12% — Q3 budget impact." No reply, no approval; just informed.

**Locked decisions (RD, 2026-07-20):**
1. **Each agent self-assesses** — judgment stays with the domain expert; no extra
   model call. A deterministic pass dedups/ranks/caps.
2. **Dismissible** via a seen-ledger — "Got it" acknowledges; won't resurface.
3. **One calm section** — urgent sorts to top with a red dot; no interrupts.

## The judgment (non-deterministic, bounded)

The agent decides what rises — but every notice is held to the same deterministic
guardrails that make this product FOIA-defensible:

- **Cite or stay silent.** Every notice carries ≥1 citation to a real landed
  message — reusing the citation-validation guard (known-set checked against
  `canonical.messages`; no laundered/hallucinated notices). See
  `lib/agent-runner.ts`.
- **Awareness only.** A notice is `observe` — never an action. `validateRunOutput`
  rejects any notice that implies a send/draft (autonomy ceiling).
- **The rubric (in the agent prompt).** *Rises:* material change, public-safety
  event, financial impact, a commitment/deadline the mayor made, reputational/press
  risk, something anomalous vs. the baseline. *Does not rise:* routine, marketing,
  already-actioned, duplicate of a prior day's notice.
- **Templated notability, agent-written headline.** The agent writes the headline
  and the one-line "why it matters" in its own voice; `notability` is a fixed enum
  (drives ordering/color, not prose).

## Data model

Extend the agent run output (persisted in `canonical.agent_runs.output`):

```ts
notices: Array<{
  headline: string;               // "Structure fire on Main St — no injuries"
  detail: string;                 // 1–2 sentences: the agent's read / why it matters
  notability: "fyi" | "notable" | "urgent";
  sourceMessageIds: string[];     // citations (canonicalized + corpus-validated)
}>
```

- Added to the runner's output schema + prompt; `validateRunOutput` enforces
  citations and the autonomy ceiling exactly as it does for `digest`.
- Citations run through the same `resolveCitation` + corpus-existence filter as
  digest points, so notice links resolve (open the email by `source_ref`).

**Seen-ledger** (dismissal) — new table, own RLS + REVOKE (migration discipline):

```sql
app.notice_acks (
  tenant     uuid,
  notice_key text,          -- stable hash: agent_key + normalized headline (+ first citation)
  acked_at   timestamptz default now(),
  primary key (tenant, notice_key)
)
```

A notice's `notice_key` is deterministic so the same finding re-raised tomorrow
maps to the same key and stays dismissed. (Mirror `app.triage_corrections`: RLS on,
`REVOKE ALL FROM anon, authenticated`, verify with `get_advisors`.)

## Read path / roll-up  (`lib/needs-to-know.ts`)

Across the **latest run per agent**:
1. Collect all `notices`.
2. Drop any whose citations don't resolve (defensive; the runner already validates).
3. **Dedup** by `notice_key` (and near-identical headline within an agent).
4. Drop any `notice_key` present in `app.notice_acks` (dismissed).
5. **Order:** `urgent` → `notable` → `fyi`, then recency.
6. **Cap** at ~5–7; if more, a "+N more" affordance.

Each surviving notice carries its agent identity (avatar + name), notability, the
why-line, and a citation that opens the source email.

## UI

New **"Needs to know"** section on the Hub `WallScreen`, placed **below "Needs you
now"** and above/beside the agent grid (attention order: approve → reply → know).
Mobile + desktop both (non-negotiable — build in both `MobileApp`/`ChiefApp` paths;
`WallScreen` is shared, so mostly one component + a `TriageHubCard`-style card).

Each row:
- Agent avatar + name (whose read this is)
- Notability dot (red = urgent, amber = notable, muted = fyi)
- **Headline** (click → opens the source email via the fixed `source_ref` path)
- Why-line (the agent's assessment)
- **"Got it"** control → `POST /api/needs-to-know/ack {noticeKey}` → row disappears,
  won't return.

Empty state: *"Your agents have nothing to flag this morning."* (Silence here is
fine — liveness is already shown by the agent cards and Needs you.)

## DEMO_MODE

Fixtures in `lib/needs-to-know` demo path: the fire notice + the utility/water-rates
notice + one `fyi`, one dismissible example. No DB, no keys.

## API

- `GET /api/needs-to-know` → the rolled-up, ack-filtered list (branches `if (DEMO)`).
- `POST /api/needs-to-know/ack {noticeKey}` → append to `app.notice_acks`.

## Cron / freshness

No new cron — notices are produced by the existing agent runs
(`/api/cron/agent-runs`). The Hub reads the latest run per agent, so notices are as
fresh as the last agent pass (hourly).

## Non-goals (v1)

- No central "briefer" editorial pass (agents self-assess; can layer later if noisy).
- No push/interrupt for urgent (listed only).
- No cross-day trend synthesis ("third fire this month") — that's the agent-memory
  pattern work, a separate feature.

## Build order

1. Migration: `app.notice_acks` (+ RLS/REVOKE, verify not anon-readable).
2. Runner: add `notices` to output schema + prompt rubric; validate citations +
   autonomy in `validateRunOutput`.
3. `lib/needs-to-know.ts`: roll-up (dedup/ack-filter/rank/cap) + `notice_key`.
4. API: `GET /api/needs-to-know`, `POST /api/needs-to-know/ack` (+ DEMO).
5. UI: `NeedsToKnowCard` on `WallScreen`, wired in both shells; ack flow.
6. DEMO fixtures. Typecheck + build. Verify against RD's real mailbox.
