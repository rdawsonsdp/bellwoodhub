// Shapes of the content rows staff edit in /admin. Column names match the
// Supabase tables in supabase/migrations. Text that needs translating has an
// English column and a matching "_es" column.

export type AlertSeverity = "info" | "warning" | "emergency";

export type Alert = {
  id: string;
  severity: AlertSeverity;
  message: string;
  message_es: string | null;
  link_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
};

export type MeetingType = {
  id: string;
  slug: string;
  name: string;
  name_es: string | null;
  sort_order: number;
};

export type Meeting = {
  id: string;
  meeting_type_id: string;
  title: string | null;
  title_es: string | null;
  starts_at: string;
  location: string | null;
  agenda_url: string | null;
  minutes_url: string | null;
  video_url: string | null;
  is_cancelled: boolean;
  meeting_type: MeetingType;
};

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  title_es: string | null;
  summary: string;
  summary_es: string | null;
  body: string;
  body_es: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_alt_es: string | null;
  department_id: string | null;
  is_published: boolean;
  published_at: string;
};

export type EventItem = {
  id: string;
  slug: string;
  title: string;
  title_es: string | null;
  description: string;
  description_es: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  is_all_day: boolean;
  image_url: string | null;
  image_alt: string | null;
  is_published: boolean;
};

export type PaymentType = {
  id: string;
  slug: string;
  title: string;
  title_es: string | null;
  covers: string;
  covers_es: string | null;
  need_ready: string | null;
  need_ready_es: string | null;
  vendor_name: string;
  vendor_url: string;
  sort_order: number;
  is_active: boolean;
};
