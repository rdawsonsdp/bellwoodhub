import { cacheLife, cacheTag } from "next/cache";
import { hasSupabase, publicSupabase } from "@/lib/supabase/public";
import { placeholderEvents, placeholderNews } from "@/lib/placeholder/news";
import type { EventItem, NewsItem } from "@/lib/types";

export async function getNews(limit = 200): Promise<NewsItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("news");

  if (!hasSupabase) return placeholderNews().slice(0, limit);
  const { data, error } = await publicSupabase()
    .from("news")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) console.error("getNews failed", error.message);
  return (data as NewsItem[] | null) ?? [];
}

export async function getNewsBySlug(slug: string): Promise<NewsItem | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("news");

  if (!hasSupabase) return placeholderNews().find((n) => n.slug === slug) ?? null;
  const { data } = await publicSupabase().from("news").select("*").eq("slug", slug).maybeSingle();
  return (data as NewsItem | null) ?? null;
}

/** All published events, soonest first. */
export async function getEvents(): Promise<EventItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");

  if (!hasSupabase) return placeholderEvents().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const { data, error } = await publicSupabase()
    .from("events")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(1000);
  if (error) console.error("getEvents failed", error.message);
  return (data as EventItem[] | null) ?? [];
}

export async function getUpcomingEvents(limit = 3): Promise<EventItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");

  const now = new Date().toISOString();
  return (await getEvents()).filter((e) => (e.ends_at ?? e.starts_at) >= now).slice(0, limit);
}

export async function getEventBySlug(slug: string): Promise<EventItem | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("events");

  if (!hasSupabase) return placeholderEvents().find((e) => e.slug === slug) ?? null;
  const { data } = await publicSupabase().from("events").select("*").eq("slug", slug).maybeSingle();
  return (data as EventItem | null) ?? null;
}
