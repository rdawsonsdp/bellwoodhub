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
import { DEFAULT_TIER, tierById, type ModelTier } from "./agents/constants";

const SETTINGS_OWNER = "__workspace__";
const KEY = "model_tier";

/** Cached briefly: every agent run and every Ask reads this, and the value
 *  changes about once a month. A stale read costs one request at the old tier. */
let cache: { id: string; at: number } | null = null;
const TTL_MS = 30_000;

export async function getModelTierId(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.id;
  try {
    const rows = await query<{ value: { id?: string } }>(
      `SELECT value FROM app.user_state WHERE user_email = $1 AND key = $2 LIMIT 1`,
      [SETTINGS_OWNER, KEY],
    );
    const id = rows[0]?.value?.id ?? DEFAULT_TIER;
    cache = { id, at: Date.now() };
    return id;
  } catch {
    // A settings outage must never take Ask down — fall back to the default.
    return DEFAULT_TIER;
  }
}

export async function getModelTier(): Promise<ModelTier> {
  return tierById(await getModelTierId());
}

export async function setModelTierId(id: string): Promise<ModelTier> {
  const tier = tierById(id); // normalises an unknown id to the default
  await query(
    `INSERT INTO app.user_state (user_email, key, value, updated_at)
          VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (user_email, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SETTINGS_OWNER, KEY, JSON.stringify({ id: tier.id })],
  );
  cache = { id: tier.id, at: Date.now() };
  return tier;
}
