-- Who can read and write what.
--   Visitors (anon key): read published content only.
--   Staff (signed in + a row in profiles): read and write everything.
--   Form submissions are written by the server with the service role key, so
--   visitors can never read other people's requests or the subscriber list.

do $$
declare t text;
begin
  foreach t in array array['profiles','departments','staff','alerts','news','events','newsletters',
    'meeting_types','meetings','documents','bids','payment_types','service_categories',
    'service_requests','faqs','properties','subscribers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "staff manage %1$s" on public.%1$I for all to authenticated
      using ((select public.is_staff())) with check ((select public.is_staff()))', t);
  end loop;

  -- Tables every visitor may read in full.
  foreach t in array array['departments','staff','newsletters','meeting_types','meetings','documents',
    'bids','faqs']
  loop
    execute format('create policy "public read %1$s" on public.%1$I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Tables where visitors only see rows that are switched on.
create policy "public read active alerts" on public.alerts
  for select to anon, authenticated using (is_active);
create policy "public read published news" on public.news
  for select to anon, authenticated using (is_published and published_at <= now());
create policy "public read published events" on public.events
  for select to anon, authenticated using (is_published);
create policy "public read active payment types" on public.payment_types
  for select to anon, authenticated using (is_active);
create policy "public read active categories" on public.service_categories
  for select to anon, authenticated using (is_active);
create policy "public read available properties" on public.properties
  for select to anon, authenticated using (is_available);

-- A signed-in user may read their own profile (the admin area checks it).
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- ── Storage ──────────────────────────────────────────────────────────────────
-- "documents": agendas, minutes, budgets, newsletters, bid packets (public).
-- "images": news and event photos (public).
-- "request-photos": photos residents attach to a problem report (private).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', true, 26214400, array['application/pdf']),
  ('images', 'images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('request-photos', 'request-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy "staff manage site files" on storage.objects for all to authenticated
  using (bucket_id in ('documents','images','request-photos') and (select public.is_staff()))
  with check (bucket_id in ('documents','images','request-photos') and (select public.is_staff()));
