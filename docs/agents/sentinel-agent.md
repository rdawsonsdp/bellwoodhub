# Sentinel — Access Monitor

- **Key:** `sentinel`
- **Autonomy:** R1 (read-only · flags for human review · never blocks, never acts)
- **Status:** active
- **Watches:** `app.audit_log` — the access/audit ledger, and only that
- **Posture:** RD's top-risk directive — the #1 project risk is the Mayor's
  email being accessed by attackers **through this app**. The Sentinel is the
  *active auditing* layer of the layered-breaks answer: logging alone is a
  diary; someone has to read it.

## Mission

Watch every access to the record and flag what does not fit. The hub's usage
pattern is small and predictable — RD's phone and desktop, later the Mayor's —
which makes deviation itself the signal. The Sentinel builds a 30-day baseline
of known IPs, device classes, and locations from the audit ledger, then reviews
the last 25 hours against it, every hour.

## Identity & scope

The Sentinel reads **exactly one thing: `app.audit_log`** (actor, action,
timestamps, and the request metadata — IP, device class, geo — that access
logging stamps into `meta`). It never reads mail content, message bodies,
drafts, documents, or anything in `canonical.messages`. It writes two things:
its findings into `canonical.agent_memory` (agent key `sentinel`) and one
`sentinel.report` row per run into the same audit ledger it watches — the
watcher is watched too.

## Checks

Window = last **25h** (1h overlap so an hourly cron can't drop rows);
baseline = the **30 days** before the window. A check that errors becomes a
`check_failed` finding — the run never throws.

| Check | What it looks for | Severity |
|---|---|---|
| `new_ip` | An IP in the window that the 30-day baseline has never seen (reports IP, first action, row count, device, city/country) | **alarm** (`review` while the baseline is still empty — first month) |
| `new_device` | A device class an actor has never used before, per that actor's own baseline | **alarm** (`review` for an actor with no baseline yet) |
| `geo_deviation` | Country ≠ `EXPECTED_COUNTRY` (default `US`), or region outside `EXPECTED_REGIONS` (default `IL`) | **review** — travel happens; don't over-lock |
| `off_hours` | Interactive actions (`access.page`, `ask.query`, `draft.*`) between 23:00–05:00 America/Chicago | **review** |
| `volume` | Window row count > 5× the baseline daily average / > 20× | **review** / **alarm** |
| `check_failed` | One of the checks above errored (schema drift, DB hiccup) | **review** |

Response: `{ok, findings:[{check, severity, detail}], meta}`. Any **alarm** →
HTTP **503** (uptime pingers fire); **review**-only → **200** with `ok:false`
(surfaces in the report, no siren).

## Memory — "seen 4x this month"

Every finding upserts into `canonical.agent_memory` under `agent_key
'sentinel'`: **alarm → `open_issue`**, **review → `pattern`**; title = check +
the stable key of the finding (the IP, the actor·device pair, the geo). On
conflict `(agent_key, kind, title)` the row's `occurrence_count` bumps and
`last_seen` refreshes — so a recurring anomaly reads as *"off_hours:
mayor@… — seen 4x this month"* instead of four disconnected flags.

## What it will NEVER do

- **Block traffic** — it flags; a human decides. No firewall rules, no session
  kills, no lockouts (RD: don't lock the app down so hard it's unusable).
- **Read message bodies** — its scope is the access ledger, not the corpus.
- **Act autonomously** — R1. It produces findings; every response is a human's.

## Known blind spot (machine auth)

**401s never reach the ledger** — middleware rejects unauthenticated requests
*before* any audit write, so failed probes against the API surface are
invisible to the Sentinel. It states this limitation in every response
(`meta.limitation`). Vercel **Log Drains** are the eventual fix
(`docs/OPS_RUNBOOK.md` §2 Option B): they capture every request at the
platform edge, including the rejected ones.

## Escalation path

1. **alarm** → the endpoint returns 503 → the same uptime monitor that watches
   `ops-watch` (OPS_RUNBOOK §2) pages **RD**.
2. **review** → 200 with `ok:false` + a memory row; RD reads findings in the
   response / agent memory on his own cadence.
3. First-response steps per check live in `docs/OPS_RUNBOOK.md` §6 — the short
   version: verify with RD/the Mayor first (travel? new phone?); only then
   rotate `AUTH_SECRET`, force provider re-consent, and review the ledger for
   everything that IP touched.

## Schedule (Routines)

Hourly at **:30** — offset 30 minutes from `ops-watch` (on the hour) so one
bad hour produces two distinct signals, not one blur. Carried in
`web/vercel.json`; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
DEMO mode returns `{ok:true, mode:"demo"}` — there is no ledger to watch
without a database.

## Tuning knobs

- `EXPECTED_COUNTRY` — ISO country code access is expected from (default `US`).
- `EXPECTED_REGIONS` — comma-separated region codes (default `IL`). Add a
  region before a planned trip to pre-quiet the geo check.
- First 30 days: the baseline is still building, so `new_ip` / `new_device`
  self-downgrade to `review` while their baseline sets are empty.

## Failure modes

- DB unreachable → every check fails soft into `check_failed` findings;
  `ops-watch` alarms on the DB itself, so the pager is still covered.
- Access rows missing `meta.ip`/`meta.device` (older rows predating access
  logging) → those rows are simply skipped by IP/device checks; the volume and
  off-hours checks still see them.

## Scaling notes

Per-tenant: the baseline is whatever that tenant's ledger says is normal — no
hardcoded users or IPs. New expected geography = env change, not a code change.
