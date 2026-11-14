import { cacheLife, cacheTag } from "next/cache";
import { hasSupabase, publicSupabase } from "@/lib/supabase/public";
import { placeholderAlerts } from "@/lib/placeholder/alerts";
import type { Alert } from "@/lib/types";

/** The alert to show at the top of every page, or null when none is switched on. */
export async function getActiveAlert(): Promise<Alert | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("alerts");

  if (!hasSupabase) return placeholderAlerts.find((a) => a.is_active) ?? null;

  const now = new Date().toISOString();
  const { data, error } = await publicSupabase()
    .from("alerts")
    .select("*")
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("getActiveAlert failed", error.message);
    return null;
  }
  return (data?.[0] as Alert | undefined) ?? null;
}
