-- Re-creates what cleanup_unused_media_2026-10-03.sql removed (tables were empty, so no data to restore).
create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  group_code text not null references public.groups(code) on delete cascade,
  kind text not null, title text not null, description text not null default '',
  file_url text not null, r2_key text not null, mime text, size_bytes bigint,
  duration_seconds integer not null default 0, batch_id uuid not null default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_items_group_created_idx on public.media_items (group_code, created_at desc);
create index if not exists media_items_r2_key_idx on public.media_items (r2_key);
alter table public.media_items enable row level security;
create policy media_items_select on public.media_items for select to authenticated using (teaches_group(group_code) or group_code in (select my_group_codes()));
create policy media_items_insert_teacher on public.media_items for insert to authenticated with check (teaches_group(group_code));
create policy media_items_update_teacher on public.media_items for update to authenticated using (teaches_group(group_code)) with check (teaches_group(group_code));
create policy media_items_delete_teacher on public.media_items for delete to authenticated using (teaches_group(group_code));

create table if not exists public.saved_media (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, media_id)
);
alter table public.saved_media enable row level security;
create policy saved_media_select_own on public.saved_media for select to authenticated using (user_id = (select auth.uid()));
create policy saved_media_insert_own on public.saved_media for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.media_items m where m.id = saved_media.media_id));
create policy saved_media_delete_own on public.saved_media for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.delete_media_item(p_id uuid) returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_group text; v_key text;
begin
  select group_code, r2_key into v_group, v_key from public.media_items where id = p_id;
  if v_key is null then return null; end if;
  if not public.teaches_group(v_group) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.media_items where id = p_id;
  if exists (select 1 from public.media_items where r2_key = v_key) then return null; end if;
  return v_key;
end $$;
