import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Sentinel (RD's top-risk directive): one job — watch access activity in
// app.audit_log and flag what doesn't fit. Usage here is predictable (RD's
// phone + desktop, later the Mayor's), so deviation is the signal. It FLAGS,
// never blocks (R1): window = last 25h (1h overlap so an hourly cron can't
// drop rows), baseline = the 30 days before that. Any 'alarm' → 503 so uptime
// pingers fire; 'review'-only → 200 with ok:false (travel happens — RD said
// don't over-lock). Never throws — a check that fails IS a finding. Every
// finding also lands in canonical.agent_memory (agent_key 'sentinel') so
// repeat anomalies read as "seen 4x this month". First-response steps per
// finding live in docs/OPS_RUNBOOK.md §6. Gated exactly like cron/ops-watch.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return false;
}

const WINDOW_HOURS = 25; // 1h overlap on an hourly cron — nothing falls between runs
const BASELINE_DAYS = 30; // what "normal" looks like

type Severity = "review" | "alarm";

interface Finding {
  check: "new_ip" | "new_device" | "geo_deviation" | "off_hours" | "volume" | "check_failed";
  severity: Severity;
  detail: string; // by construction: "<stable key> — <volatile detail>" (memory title = the stable key)
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Fold one finding into the Sentinel's memory — same upsert idiom as
// lib/agent-runner.ts persistRun. Title = check + the stable key (the part of
// detail before " — "), so ON CONFLICT dedups across runs and
// occurrence_count becomes "seen Nx"; the volatile detail rides in body.
// Fire-and-forget like logAudit: a memory outage must not break the watch.
async function remember(f: Finding): Promise<void> {
  const kind = f.severity === "alarm" ? "open_issue" : "pattern";
  const title = `${f.check}: ${f.detail.split(" — ")[0]}`;
  try {
    await query(
      `INSERT INTO canonical.agent_memory (agent_key, kind, title, body)
       VALUES ('sentinel', $1, $2, $3)
       ON CONFLICT (agent_key, kind, title) DO UPDATE SET
         occurrence_count = canonical.agent_memory.occurrence_count + 1,
         status = 'open',
         body = EXCLUDED.body,
         last_seen = now()`,
      [kind, title, f.detail],
    );
  } catch (err) {
    console.error("[sentinel] memory write failed:", errMsg(err));
  }
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (DEMO) {
    // fixtures serve the app in demo mode — there is no ledger to watch
    return NextResponse.json({ ok: true, mode: "demo", note: "DEMO mode: nothing to watch; live checks require DATABASE_URL." });
  }

  // the in-app enable switch (app.agent_configs, FEAT-19)
  const off = await query<{ agent_key: string }>(
    `SELECT agent_key FROM app.agent_configs WHERE agent_key = 'sentinel' AND NOT enabled`,
  ).catch(() => [] as { agent_key: string }[]);
  if (off.length) {
    return NextResponse.json({ ok: true, skipped: "disabled by operator" });
  }

  const findings: Finding[] = [];
  const P = [WINDOW_HOURS, BASELINE_DAYS];

  // (a) NEW IP — window IPs the 30-day baseline has never seen. While the
  // baseline is still empty (first month) this downgrades to 'review' —
  // alarming on every IP of a brand-new install would be noise, not signal.
  try {
    const baseline = await query<{ ip: string }>(
      `SELECT DISTINCT meta->>'ip' AS ip FROM app.audit_log
        WHERE at <= now() - make_interval(hours => $1)
          AND at >  now() - make_interval(hours => $1) - make_interval(days => $2)
          AND meta->>'ip' IS NOT NULL`,
      P,
    );
    const known = new Set(baseline.map((r) => r.ip));
    const fresh = await query<{
      ip: string; first_action: string; n: number;
      device: string | null; city: string | null; country: string | null;
    }>(
      `SELECT meta->>'ip' AS ip,
              (array_agg(action ORDER BY at))[1]           AS first_action,
              COUNT(*)::int                                AS n,
              (array_agg(meta->>'device' ORDER BY at))[1]  AS device,
              (array_agg(meta->>'city' ORDER BY at))[1]    AS city,
              (array_agg(meta->>'country' ORDER BY at))[1] AS country
         FROM app.audit_log
        WHERE at > now() - make_interval(hours => $1) AND meta->>'ip' IS NOT NULL
        GROUP BY 1`,
      [WINDOW_HOURS],
    );
    for (const r of fresh) {
      if (known.has(r.ip)) continue;
      findings.push({
        check: "new_ip",
        severity: known.size === 0 ? "review" : "alarm",
        detail: `${r.ip} — first '${r.first_action}', ${r.n} row(s); device ${r.device ?? "?"}; ${r.city ?? "?"}, ${r.country ?? "?"}${known.size === 0 ? " (no IP baseline yet — learning)" : ""}`,
      });
    }
  } catch (err) {
    findings.push({ check: "check_failed", severity: "review", detail: `new_ip check — ${errMsg(err)}` });
  }

  // (b) NEW DEVICE CLASS per actor — a device this actor's baseline doesn't
  // hold. An actor with no baseline at all (first month / first login) is
  // 'review', not 'alarm'. Actor is the session email; pre-auth rows group
  // under '(no-session)' so deviations still surface before L0.1 lands.
  try {
    const baseline = await query<{ actor: string; device: string }>(
      `SELECT DISTINCT COALESCE(actor, '(no-session)') AS actor, meta->>'device' AS device
         FROM app.audit_log
        WHERE at <= now() - make_interval(hours => $1)
          AND at >  now() - make_interval(hours => $1) - make_interval(days => $2)
          AND meta->>'device' IS NOT NULL`,
      P,
    );
    const byActor = new Map<string, Set<string>>();
    for (const r of baseline) {
      if (!byActor.has(r.actor)) byActor.set(r.actor, new Set());
      byActor.get(r.actor)!.add(r.device);
    }
    const fresh = await query<{ actor: string; device: string; n: number; first_action: string }>(
      `SELECT COALESCE(actor, '(no-session)') AS actor, meta->>'device' AS device,
              COUNT(*)::int AS n, (array_agg(action ORDER BY at))[1] AS first_action
         FROM app.audit_log
        WHERE at > now() - make_interval(hours => $1) AND meta->>'device' IS NOT NULL
        GROUP BY 1, 2`,
      [WINDOW_HOURS],
    );
    for (const r of fresh) {
      const knownDevices = byActor.get(r.actor);
      if (knownDevices?.has(r.device)) continue;
      findings.push({
        check: "new_device",
        severity: knownDevices ? "alarm" : "review",
        detail: `${r.actor} · ${r.device} — ${r.n} row(s), first '${r.first_action}'${knownDevices ? "" : " (no device baseline for this actor yet — learning)"}`,
      });
    }
  } catch (err) {
    findings.push({ check: "check_failed", severity: "review", detail: `new_device check — ${errMsg(err)}` });
  }

  // (c) GEO DEVIATION — outside the expected country/region. 'review' only:
  // travel happens, and the Mayor's phone shouldn't set off sirens from a
  // conference hotel. Tune with EXPECTED_COUNTRY / EXPECTED_REGIONS.
  const expectedCountry = process.env.EXPECTED_COUNTRY || "US";
  const expectedRegions = (process.env.EXPECTED_REGIONS || "IL")
    .split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const geos = await query<{ country: string; region: string | null; city: string | null; n: number; ips: number }>(
      `SELECT meta->>'country' AS country, meta->>'region' AS region,
              (array_agg(meta->>'city'))[1] AS city,
              COUNT(*)::int AS n, COUNT(DISTINCT meta->>'ip')::int AS ips
         FROM app.audit_log
        WHERE at > now() - make_interval(hours => $1) AND meta->>'country' IS NOT NULL
        GROUP BY 1, 2`,
      [WINDOW_HOURS],
    );
    for (const g of geos) {
      const offCountry = g.country !== expectedCountry;
      const offRegion = !offCountry && g.region != null && !expectedRegions.includes(g.region);
      if (!offCountry && !offRegion) continue;
      findings.push({
        check: "geo_deviation",
        severity: "review",
        detail: `${g.country}/${g.region ?? "?"} — ${g.n} row(s) from ${g.ips} ip(s), city ${g.city ?? "?"} (expected ${expectedCountry} / ${expectedRegions.join("|")})`,
      });
    }
  } catch (err) {
    findings.push({ check: "check_failed", severity: "review", detail: `geo_deviation check — ${errMsg(err)}` });
  }

  // (d) OFF-HOURS — interactive use (page access, Ask, drafting) between
  // 23:00 and 05:00 America/Chicago. One finding per actor, so the memory
  // occurrence count reads "this actor works nights" after a few weeks.
  try {
    const nights = await query<{ actor: string; n: number; actions: string[]; first_at: string; last_at: string }>(
      `SELECT COALESCE(actor, '(no-session)') AS actor, COUNT(*)::int AS n,
              array_agg(DISTINCT action) AS actions,
              MIN(at)::text AS first_at, MAX(at)::text AS last_at
         FROM app.audit_log
        WHERE at > now() - make_interval(hours => $1)
          AND (action IN ('access.page', 'ask.query') OR action LIKE 'draft.%')
          AND (EXTRACT(HOUR FROM at AT TIME ZONE 'America/Chicago') >= 23
               OR EXTRACT(HOUR FROM at AT TIME ZONE 'America/Chicago') < 5)
        GROUP BY 1`,
      [WINDOW_HOURS],
    );
    for (const r of nights) {
      findings.push({
        check: "off_hours",
        severity: "review",
        detail: `${r.actor} — ${r.n} interactive row(s) between 23:00–05:00 America/Chicago (${r.actions.join(", ")}); ${r.first_at} → ${r.last_at}`,
      });
    }
  } catch (err) {
    findings.push({ check: "check_failed", severity: "review", detail: `off_hours check — ${errMsg(err)}` });
  }

  // (e) VOLUME — window rows vs the baseline daily average. >5x is worth a
  // look ('review'); >20x is exfiltration-shaped ('alarm'). Skipped while the
  // baseline is empty — there is no "normal" to deviate from yet.
  try {
    const [v] = await query<{ window_n: number; baseline_n: number }>(
      `SELECT (COUNT(*) FILTER (WHERE at > now() - make_interval(hours => $1)))::int  AS window_n,
              (COUNT(*) FILTER (WHERE at <= now() - make_interval(hours => $1)))::int AS baseline_n
         FROM app.audit_log
        WHERE at > now() - make_interval(hours => $1) - make_interval(days => $2)`,
      P,
    );
    const avg = (v?.baseline_n ?? 0) / BASELINE_DAYS;
    if (v && avg > 0) {
      const ratio = v.window_n / avg;
      if (ratio > 20) {
        findings.push({ check: "volume", severity: "alarm", detail: `window >20x baseline — ${v.window_n} rows in ${WINDOW_HOURS}h vs ${avg.toFixed(1)}/day baseline average` });
      } else if (ratio > 5) {
        findings.push({ check: "volume", severity: "review", detail: `window >5x baseline — ${v.window_n} rows in ${WINDOW_HOURS}h vs ${avg.toFixed(1)}/day baseline average` });
      }
    }
  } catch (err) {
    findings.push({ check: "check_failed", severity: "review", detail: `volume check — ${errMsg(err)}` });
  }

  // findings become the Sentinel's memory — repeats bump occurrence_count
  for (const f of findings) await remember(f);

  const alarms = findings.filter((f) => f.severity === "alarm").length;
  const reviews = findings.length - alarms;
  const ok = findings.length === 0;
  // one ledger row per run — the watcher is watched too (logAudit never throws)
  void logAudit({ actor: null, action: "sentinel.report", meta: { ok, alarms, reviews } });
  return NextResponse.json(
    {
      ok,
      findings,
      meta: {
        windowHours: WINDOW_HOURS,
        baselineDays: BASELINE_DAYS,
        // (f) known blind spot, stated honestly rather than papered over
        limitation:
          "401s never reach this ledger — middleware rejects unauthenticated requests before any audit write, so failed machine-auth probes are invisible here. Vercel Log Drains are the eventual fix (OPS_RUNBOOK §2 Option B).",
      },
    },
    { status: alarms > 0 ? 503 : 200 },
  );
}

export const GET = handle;
export const POST = handle;
