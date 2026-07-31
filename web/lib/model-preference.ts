/*
 * model-preference.ts — the model tier the USER picked, stored server-side.
 *
 * It lives in app.user_state (not localStorage) for one reason: the cron agents
 * have no browser. "The agents will run with that model" (RD 2026-07-31) only
 * works if the choice is readable from a background job, so the Ask box and the
 * hourly cabinet pass resolve the same row.
 *
 * Single-tenant today — one row keyed by SETTINGS_OWNER. When the app becomes
 * multi-user, key it on the session email instead and the rest stands.
 */
import { query } from "./db";
import { MODEL_OPUS } from "./agents/constants";

const SETTINGS_OWNER = "__workspace__";
const KEY = "model_id";

/** Opus 5 unless the user says otherwise. */
export const DEFAULT_MODEL_ID = MODEL_OPUS;

/** Cached briefly: every agent run and every Ask reads this, and the value
 *  changes about once a month. A stale read costs one request at the old tier. */
let cache: { id: string; at: number } | null = null;
const TTL_MS = 30_000;

export async function getModelId(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.id;
  try {
    const rows = await query<{ value: { id?: string } }>(
      `SELECT value FROM app.user_state WHERE user_email = $1 AND key = $2 LIMIT 1`,
      [SETTINGS_OWNER, KEY],
    );
    const id = rows[0]?.value?.id ?? DEFAULT_MODEL_ID;
    cache = { id, at: Date.now() };
    return id;
  } catch {
    // A settings outage must never take Ask down — fall back to the default.
    return DEFAULT_MODEL_ID;
  }
}

/** Stores the id VERBATIM. It is validated against the live catalog by the
 *  route before it gets here; silently rewriting an unrecognised id to the
 *  default is what made the picker display one model while running another. */
export async function setModelId(id: string): Promise<string> {
  await query(
    `INSERT INTO app.user_state (user_email, key, value, updated_at)
          VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (user_email, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SETTINGS_OWNER, KEY, JSON.stringify({ id })],
  );
  cache = { id, at: Date.now() };
  return id;
}
