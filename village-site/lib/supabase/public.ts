import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read-only client for public content. It uses the anon key and no cookies,
// so everything it reads is governed by the "public can read published rows"
// policies in supabase/migrations.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until Supabase keys are set. The site then runs on lib/placeholder data. */
export const hasSupabase = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function publicSupabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error("Supabase is not configured");
  client ??= createClient(url, anonKey, { auth: { persistSession: false } });
  return client;
}
