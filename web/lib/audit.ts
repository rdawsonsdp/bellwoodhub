/*
 * audit.ts — the audit ledger (ISS-5, Go-Live L0.4). Every read and decision
 * leaves a row in app.audit_log (migrations/004_audit.sql): Ask queries,
 * email opens, approve/discard/fix-it, agent runs, queue reads. Append-only
 * by convention — this module only ever INSERTs.
 *
 * Access telemetry (top-risk directive): pass `req` and every row also
 * carries WHO/WHERE/WHAT-DEVICE — requestMeta() reads Vercel's injected
 * headers (x-forwarded-for, user-agent, x-vercel-ip-*) and the fields merge
 * into meta, where migrations/010 indexes them for the Sentinel's
 * baseline/deviation queries.
 *
 * Fire-and-forget: logAudit never throws (an audit outage must never break
 * the request it records), so callers may `void logAudit(...)` and move on.
 * DEMO mode (no DATABASE_URL): a console line stands in for the row.
 */
import type { NextRequest } from "next/server";
import { DEMO } from "./demo";
import { query } from "./db";

export interface RequestMeta {
  ip: string | null; // first hop of x-forwarded-for, else x-real-ip
  ua: string | null; // raw user-agent
  device: "mobile" | "desktop" | "bot" | "unknown";
  city: string | null; // x-vercel-ip-* geo (city arrives URI-encoded)
  country: string | null;
  region: string | null;
}

// Never throws — logAudit calls this outside its own try/catch.
export function requestMeta(req: NextRequest | Request): RequestMeta {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) || null;
  const ua = h.get("user-agent");
  let device: RequestMeta["device"] = "unknown";
  if (ua) {
    if (/bot|crawler|spider|scrape|headless|curl|wget/i.test(ua)) device = "bot";
    else if (/Mobi|Android|iPhone/i.test(ua)) device = "mobile";
    else device = "desktop";
  }
  const city = h.get("x-vercel-ip-city");
  let decodedCity: string | null = city;
  if (city) {
    try {
      decodedCity = decodeURIComponent(city);
    } catch {
      /* malformed encoding — keep the raw value */
    }
  }
  return {
    ip,
    ua,
    device,
    city: decodedCity,
    country: h.get("x-vercel-ip-country"),
    region: h.get("x-vercel-ip-country-region"),
  };
}

export interface AuditEntry {
  actor?: string | null; // session email — null until L0.1 auth threads it through
  action: string; // dotted verb: 'ask.query', 'email.open', 'draft.approve', …
  objectType?: string; // kind of thing touched ('draft', 'message', …)
  objectRef?: string; // its identity (draft_id, message_id, …)
  meta?: Record<string, unknown>;
  req?: NextRequest | Request; // when present, requestMeta(req) merges into meta
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  // action-specific keys win over the telemetry keys on (unlikely) collision
  const meta = entry.req ? { ...requestMeta(entry.req), ...(entry.meta ?? {}) } : (entry.meta ?? {});
  if (DEMO) {
    console.log(`[audit] ${entry.action}`, {
      actor: entry.actor ?? null,
      objectType: entry.objectType ?? null,
      objectRef: entry.objectRef ?? null,
      meta,
    });
    return;
  }
  try {
    await query(
      `INSERT INTO app.audit_log (actor, action, object_type, object_ref, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.actor ?? null,
        entry.action,
        entry.objectType ?? null,
        entry.objectRef ?? null,
        JSON.stringify(meta),
      ],
    );
  } catch (err) {
    // never throw — audit failure must not break the audited request
    console.error("[audit] write failed:", err instanceof Error ? err.message : err);
  }
}
