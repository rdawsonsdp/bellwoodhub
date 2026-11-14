import { cacheLife, cacheTag } from "next/cache";
import { hasSupabase, publicSupabase } from "@/lib/supabase/public";
import { placeholderMeetingTypes, placeholderMeetings } from "@/lib/placeholder/meetings";
import type { Meeting, MeetingType } from "@/lib/types";

export async function getMeetingTypes(): Promise<MeetingType[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("meetings");

  if (!hasSupabase) return placeholderMeetingTypes;
  const { data, error } = await publicSupabase().from("meeting_types").select("*").order("sort_order");
  if (error) console.error("getMeetingTypes failed", error.message);
  return (data as MeetingType[] | null) ?? [];
}

/** Every meeting, newest first. The archive is small enough to filter in the browser. */
export async function getMeetings(): Promise<Meeting[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("meetings");

  if (!hasSupabase) {
    return placeholderMeetings().sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }
  const { data, error } = await publicSupabase()
    .from("meetings")
    .select("*, meeting_type:meeting_types(*)")
    .order("starts_at", { ascending: false })
    .limit(2000);
  if (error) console.error("getMeetings failed", error.message);
  return (data as Meeting[] | null) ?? [];
}

/** The next few meetings that haven't happened yet, soonest first. */
export async function getUpcomingMeetings(limit = 3): Promise<Meeting[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("meetings");

  const now = new Date().toISOString();
  const all = await getMeetings();
  return all
    .filter((m) => m.starts_at >= now && !m.is_cancelled)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, limit);
}
