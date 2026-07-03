# Ops Runbook — the watch, the alerts, the ledgers

> For RD, go-live week. One endpoint (`/api/cron/ops-watch`) answers "is the
> pipeline healthy?"; this page says how to get alerted when it isn't and what
> to do first for each finding. Closes compliance gaps 5.4 (alerting) and 5.6
> (audit immutability — see `migrations/009_audit_guard.sql`).

---

## 1. The health endpoint

`GET /api/cron/ops-watch?k=<CRON_SECRET>` (or `Authorization: Bearer <CRON_SECRET>`)

- Healthy → **200** `{"ok":true,"findings":[]}`
- Anything wrong → **503** `{"ok":false,"findings":[...]}` — so both
  status-code and keyword monitors alert.
- DEMO mode → 200 `{"ok":true,"mode":"demo"}` (nothing to watch without a DB).
- Every run writes one `ops.health` row to `app.audit_log`.

Pilot host: `https://bellwood-hub-pilot.vercel.app`.

## 2. Getting alerted — pick one (or both)

**Option A — external uptime monitor (recommended; free tier is enough).**
UptimeRobot or BetterStack: add an HTTP(S) monitor on
`https://bellwood-hub-pilot.vercel.app/api/cron/ops-watch?k=<CRON_SECRET>`,
interval 5–15 min, alert on non-200 (optionally also keyword-match `"ok":true`).
**The secret rides in the URL** — the monitor's config now holds a production
credential, so treat the monitor account as secret storage: MFA on, no shared
dashboards, and rotate `CRON_SECRET` if the monitor account is ever in doubt.

**Option B — Vercel Log Drains + alerts.**
Vercel dashboard → Team → **Observability → Log Drains** → Add Drain (point at
BetterStack/Datadog/any HTTPS sink), sources = Functions, project = the hub;
then set an alert in the sink on `[/api/cron/ops-watch]` errors or on any
function 5xx. Catches all cron failures, not just this route, but needs a
paid-ish sink and RD dashboard access to Vercel.

## 3. Findings — what they mean, what to do first

| `check` | Meaning | First response |
|---|---|---|
| `db_unreachable` | The `SELECT 1` probe failed — Supabase down, project paused, or `DATABASE_URL` wrong | Supabase dashboard → bellwood-mayor: is the project paused? Confirm `DATABASE_URL` uses the **Session Pooler** host (the direct `db.<ref>` host is IPv6-only). Other checks are skipped until this clears. |
| `connector_error` | An account in `pipeline.connector_accounts` sits at `status='error'`; ingest flagged it and moved on. Detail carries provider/address/`last_error`. Usually an expired/revoked refresh token. | Read `last_error`. Token errors → re-consent via the sign-in flow (the grant doubles as mail consent, GO_LIVE L0.1); the row flips back to active on the next successful pull. |
| `connector_stalled` | An **active** account's `last_synced_at` is > 3 h old — the ingest cron isn't running or isn't finishing | Vercel → the project → Logs, filter `/api/cron/ingest-email`: did the cron fire? Is `CRON_SECRET` set in this environment (it was once left unset and 401'd silently — GO_LIVE L0.6)? Trigger manually with `?k=` and watch the response. |
| `dead_letters` | `pipeline.ingest_log` has rows in `state='dead_lettered'` — messages the pipeline gave up on | Inspect them (SQL below), read the `error` column, fix the cause, replay from `pipeline.raw_objects` (RAW is immutable — nothing is lost). |
| `check_failed` | The watch itself couldn't run one of its queries | Read the detail; usually a schema drift (missing migration) — apply the latest `migrations/*.sql`. |

## 4. Cron entry (carried in `web/vercel.json` by the go-live cron work)

```json
{ "path": "/api/cron/ops-watch", "schedule": "0 */1 * * *" }
```

Hourly on the hour. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
automatically once the env var is set. Note the Vercel cron only *runs* the
checks (and writes the `ops.health` ledger row) — the *alerting* is §2; a
cron that finds problems but has no monitor watching it is a diary, not an alarm.

## 5. The two ledgers (incident review)

**Audit ledger — `app.audit_log`** (`migrations/004_audit.sql`; trigger-guarded
append-only since `migrations/009_audit_guard.sql`). Every read and decision:
Ask queries, email opens, approve/discard, agent runs, `ops.health` beats.

```sql
-- what happened in the last 24 hours, newest first
SELECT at, actor, action, object_type, object_ref, meta
  FROM app.audit_log
 WHERE at > now() - interval '24 hours'
 ORDER BY at DESC LIMIT 200;
```

**Ingest ledger — `pipeline.ingest_log`** (`pipeline/0002_pipeline.sql`). The
per-message state machine: `landed → staged → canonical`, or `dead_lettered`
with the error preserved.

```sql
-- everything the pipeline gave up on, with why
SELECT ingest_key, source, source_ref, state, error, updated_at
  FROM pipeline.ingest_log
 WHERE state = 'dead_lettered'
 ORDER BY updated_at DESC;
```

## 6. The Sentinel — access anomaly watch

`GET /api/cron/sentinel?k=<CRON_SECRET>` (same gate as ops-watch). Hourly at
**:30** — offset from ops-watch so the two watches don't blur into one signal:

```json
{ "path": "/api/cron/sentinel", "schedule": "30 * * * *" }
```

Window = last 25h; baseline = the 30 days before. Semantics differ from
ops-watch by design (RD: flag, don't over-lock):

- Clean → **200** `{"ok":true,"findings":[]}`
- `review` findings only → **200** `{"ok":false,...}` — no siren; read the report
- Any `alarm` → **503** — the uptime monitor (§2) pages
- Every run writes one `sentinel.report` row to `app.audit_log`; every finding
  also upserts into `canonical.agent_memory` (agent_key `sentinel`) so repeats
  read as "seen 4x this month". Full spec: `docs/agents/sentinel-agent.md`.

### Findings — what they mean, what to do first

| `check` | Severity | Meaning | First response |
|---|---|---|---|
| `new_ip` | alarm | An IP the 30-day baseline has never seen touched the app | **Verify with RD/the Mayor first**: traveling? new network or device? If yes — no action; the IP joins the baseline within a day. If **no**: rotate `AUTH_SECRET` (kills all sessions), force provider re-consent (Google/Microsoft), then pull everything that IP did (SQL below) and review it row by row. |
| `new_device` | alarm | An actor used a device class not in their own baseline | Same verification as `new_ip`; a real account takeover usually trips both. Unexplained → treat exactly like an unexplained `new_ip`. |
| `geo_deviation` | review | Access from outside `EXPECTED_COUNTRY`/`EXPECTED_REGIONS` | Ask whoever it resolves to. Legit recurring location (second home, conference circuit) → add the region to `EXPECTED_REGIONS` rather than living with the flag. |
| `off_hours` | review | Interactive use (page/Ask/draft) 23:00–05:00 America/Chicago | Usually the Mayor being a night owl — confirm once; after that the memory row's occurrence count tells the story. Paired with a `new_ip` it stops being benign. |
| `volume` | review >5x / alarm >20x | Window rows vs the baseline daily average | Look at the window's top actions/actors: a monitor misconfigured to hammer, a runaway script, or — worst case — enumeration/exfiltration. 20x+ with a new IP = incident, not tuning. |
| `check_failed` | review | The Sentinel couldn't run one of its own queries | Read the detail; usually schema drift — apply the latest `migrations/*.sql` (same as ops-watch `check_failed`). |

```sql
-- everything a suspect IP did, oldest first — the review after a new_ip alarm
SELECT at, actor, action, object_type, object_ref, meta
  FROM app.audit_log
 WHERE meta->>'ip' = '<ip>'
 ORDER BY at ASC;
```

### Known blind spot (machine auth)

**401s never reach the ledger** — middleware rejects unauthenticated requests
*before* any audit write, so failed probes against the API are invisible to
the Sentinel (it says so in every response's `meta.limitation`). Log Drains
(§2 Option B) are the eventual fix: they capture rejected requests at the
platform edge. Until then, the Sentinel sees what got *in*, not what bounced.

### Tuning

- `EXPECTED_COUNTRY` (default `US`) · `EXPECTED_REGIONS` (comma list, default
  `IL`) — set in Vercel env; add a region ahead of planned travel.
- First 30 days the baseline is still building: `new_ip`/`new_device`
  self-downgrade to `review` while their baseline sets are empty, so a fresh
  install doesn't cry wolf on day one.
