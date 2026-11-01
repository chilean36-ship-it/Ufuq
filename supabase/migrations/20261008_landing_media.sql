-- Landing page media overrides (applied to the live project). Public read, main-admin write.
create table if not exists public.landing_media (
  slot text primary key, image_url text, video_url text, image_path text, video_path text,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null
);
alter table public.landing_media enable row level security;
create policy landing_media_read on public.landing_media for select to anon, authenticated using (true);
create policy landing_media_ins on public.landing_media for insert to authenticated with check (public.is_super_admin());
create policy landing_media_upd on public.landing_media for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy landing_media_del on public.landing_media for delete to authenticated using (public.is_super_admin());
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('landing-media','landing-media',true,52428800,array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;
create policy landing_media_obj_read on storage.objects for select to anon, authenticated using (bucket_id = 'landing-media');
create policy landing_media_obj_ins on storage.objects for insert to authenticated with check (bucket_id = 'landing-media' and public.is_super_admin());
create policy landing_media_obj_upd on storage.objects for update to authenticated using (bucket_id = 'landing-media' and public.is_super_admin()) with check (bucket_id = 'landing-media' and public.is_super_admin());
create policy landing_media_obj_del on storage.objects for delete to authenticated using (bucket_id = 'landing-media' and public.is_super_admin());
