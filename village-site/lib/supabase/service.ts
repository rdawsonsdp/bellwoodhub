import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client that uses the service role key. It is used by the public
// form endpoints (which must write rows visitors are not allowed to read back)
// and never reaches the browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasServiceSupabase = Boolean(url && serviceKey);

export function serviceSupabase(): SupabaseClient {
  if (!url || !serviceKey) throw new Error("Supabase service role is not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
