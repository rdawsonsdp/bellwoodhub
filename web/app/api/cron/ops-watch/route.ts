import { NextRequest, NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The ops watch (compliance gap 5.4): one URL an external uptime pinger can
// hit hourly. Green = 200 + {ok:true}; any finding = 503 + {ok:false, findings}
// so both status-code and keyword monitors alert. Checks: connector accounts
// in error, active accounts stalled > STALL_HOURS, dead-lettered ingest rows,
// and a DB liveness probe. Never throws — a check that fails IS a finding.
// First-response steps per finding live in docs/OPS_RUNBOOK.md. Gated exactly
// like cron/ingest-email.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return false;
}

const STALL_HOURS = 3; // ingest cron is hourly — 3h of silence means it's stuck

interface Finding {
  check: "db_unreachable" | "connector_error" | "connector_stalled" | "dead_letters" | "check_failed";
  detail: string;
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (DEMO) {
    // fixtures serve the app in demo mode — there is no pipeline to watch
    return NextResponse.json({ ok: true, mode: "demo", note: "DEMO mode: nothing to watch; live checks require DATABASE_URL." });
  }

  const findings: Finding[] = [];

  // (d first) liveness probe — if the DB itself is down, one finding says so;
  // running the other checks would just repeat the same connection error.
  let dbUp = true;
  try {
    await query(`SELECT 1`);
  } catch (err) {
    dbUp = false;
    findings.push({ check: "db_unreachable", detail: `SELECT 1 failed: ${errMsg(err)}` });
  }

  if (dbUp) {
    // (a) connector accounts flipped to status='error' by the ingest cron
    try {
      const errored = await query<{ provider: string; address: string; last_error: string | null }>(
        `SELECT provider, address, last_error FROM pipeline.connector_accounts
          WHERE status = 'error' ORDER BY provider, address`,
      );
      for (const a of errored) {
        findings.push({
          check: "connector_error",
          detail: `${a.provider}:${a.address} — ${a.last_error ?? "no last_error recorded"}`,
        });
      }
    } catch (err) {
      findings.push({ check: "check_failed", detail: `connector_error check: ${errMsg(err)}` });
    }

    // (b) active accounts the hourly ingest hasn't touched in STALL_HOURS
    try {
      const stalled = await query<{ provider: string; address: string; last_synced_at: string | null }>(
        `SELECT provider, address, last_synced_at FROM pipeline.connector_accounts
          WHERE status = 'active'
            AND (last_synced_at IS NULL OR last_synced_at < NOW() - make_interval(hours => $1))
          ORDER BY provider, address`,
        [STALL_HOURS],
      );
      for (const a of stalled) {
        findings.push({
          check: "connector_stalled",
          detail: `${a.provider}:${a.address} — last synced ${a.last_synced_at ?? "never"} (> ${STALL_HOURS}h ago)`,
        });
      }
    } catch (err) {
      findings.push({ check: "check_failed", detail: `connector_stalled check: ${errMsg(err)}` });
    }

    // (c) messages the pipeline gave up on
    try {
      const dead = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pipeline.ingest_log WHERE state = 'dead_lettered'`,
      );
      if (dead[0] && dead[0].n > 0) {
        findings.push({ check: "dead_letters", detail: `${dead[0].n} ingest_log row(s) in state='dead_lettered'` });
      }
    } catch (err) {
      findings.push({ check: "check_failed", detail: `dead_letters check: ${errMsg(err)}` });
    }
  }

  const ok = findings.length === 0;
  // one ledger row per run — the watch watches itself (logAudit never throws)
  void logAudit({ actor: null, action: "ops.health", meta: { ok, findings: findings.length } });
  return NextResponse.json({ ok, findings }, { status: ok ? 200 : 503 });
}

export const GET = handle;
export const POST = handle;
