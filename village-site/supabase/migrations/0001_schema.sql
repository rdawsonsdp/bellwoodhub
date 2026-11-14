-- Village of Bellwood website — content schema.
-- Text that needs translating has an English column and a matching "_es" column.
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists pgcrypto;

-- Keep updated_at current on every edit.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Staff accounts ───────────────────────────────────────────────────────────
-- One row per person allowed into /admin. Signing up in Supabase Auth is not
-- enough: an admin must add the profile row.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'editor' check (role in ('editor', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()));
$$;

-- ── Departments and staff ────────────────────────────────────────────────────
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_es text,
  summary text not null default '',
  summary_es text,
  what_we_do text not null default '',      -- plain text, blank line between paragraphs
  what_we_do_es text,
  head_name text,
  head_title text,
  phone text,
  email text,
  address text,
  hours text,
  hours_es text,
  -- [{ "title", "title_es", "body", "body_es", "link_url", "link_label", "link_label_es" }]
  common_tasks jsonb not null default '[]',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments (id) on delete set null,
  name text not null,
  title text not null,
  title_es text,
  phone text,
  email text,
  is_department_head boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- ── Alert banner ─────────────────────────────────────────────────────────────
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'emergency')),
  message text not null,
  message_es text,
  link_url text,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ── News, events, newsletters ────────────────────────────────────────────────
create table public.news (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  title_es text,
  summary text not null default '',
  summary_es text,
  body text not null default '',
  body_es text,
  image_url text,
  image_alt text,            -- required in /admin whenever there is an image
  image_alt_es text,
  department_id uuid references public.departments (id) on delete set null,
  is_published boolean not null default false,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  title_es text,
  description text not null default '',
  description_es text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_all_day boolean not null default false,
  image_url text,
  image_alt text,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_es text,
  issue_date date not null,
  file_url text not null,
  updated_at timestamptz not null default now()
);

-- ── Meetings ─────────────────────────────────────────────────────────────────
create table public.meeting_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_es text,
  sort_order int not null default 0
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_type_id uuid not null references public.meeting_types (id),
  title text,                -- optional, e.g. "Special meeting"
  title_es text,
  starts_at timestamptz not null,
  location text,
  agenda_url text,
  minutes_url text,
  video_url text,            -- for a future livestream / video archive
  is_cancelled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index meetings_starts_at_idx on public.meetings (starts_at desc);

-- ── Documents (department files, budgets, audits, TIF reports) ──────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_es text,
  category text not null default 'department'
    check (category in ('department', 'budget', 'audit', 'tif', 'form', 'other')),
  department_id uuid references public.departments (id) on delete set null,
  fiscal_year int,
  file_url text not null,
  updated_at timestamptz not null default now()
);

-- ── Bids & RFPs ──────────────────────────────────────────────────────────────
create table public.bids (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_es text,
  bid_number text,
  description text not null default '',
  description_es text,
  department_id uuid references public.departments (id) on delete set null,
  posted_on date not null default current_date,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed', 'awarded', 'cancelled')),
  awarded_to text,
  file_url text,
  updated_at timestamptz not null default now()
);

-- ── Pay a bill ───────────────────────────────────────────────────────────────
create table public.payment_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  title_es text,
  covers text not null,      -- what this payment is for, in plain words
  covers_es text,
  need_ready text,           -- what to have in hand before you start
  need_ready_es text,
  vendor_name text not null,
  vendor_url text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ── Report a problem ─────────────────────────────────────────────────────────
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_es text,
  department_id uuid references public.departments (id) on delete set null,
  notify_email text,         -- overrides the department's email when set
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,          -- short code given to the resident
  category_id uuid references public.service_categories (id) on delete set null,
  category_name text not null,             -- kept even if the category is later removed
  location text not null,
  description text not null,
  photo_path text,                         -- path in the private "request-photos" bucket
  contact_name text,
  contact_email text,
  contact_phone text,
  locale text not null default 'en',
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'closed')),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_requests_created_idx on public.service_requests (created_at desc);

-- ── FAQs, properties, subscribers ────────────────────────────────────────────
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  question_es text,
  answer text not null,
  answer_es text,
  topic text not null default 'General',
  topic_es text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_es text,
  address text not null,
  property_type text not null default 'commercial',
  size text,
  zoning text,
  tif_district text,
  description text not null default '',
  description_es text,
  contact_name text,
  contact_phone text,
  contact_email text,
  listing_url text,
  image_url text,
  image_alt text,
  is_available boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  list text not null default 'newsletter' check (list in ('newsletter', 'alerts')),
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  check (email is not null or phone is not null),
  unique (email, list)
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['departments','staff','alerts','news','events','newsletters','meetings',
    'documents','bids','payment_types','service_requests','faqs','properties']
  loop
    execute format('create trigger touch_%1$s before update on public.%1$s
      for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
