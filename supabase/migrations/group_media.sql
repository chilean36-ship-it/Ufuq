-- Teacher "Media" section: videos/audio published to one, several or all of a teacher's groups.
-- Files live in Cloudflare R2 (bucket "ufuq-media"); these tables only hold the metadata + who can see it.
-- APPLIED to the Supabase project (ldbthwpikixtykwmvudy) on 2026-10-03 as migration "group_media".

create table if not exists public.group_media (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('video','audio')),
  title            text not null,
  description      text not null default '',
  file_url         text not null,
  r2_key           text not null unique,
  mime_type        text,
  size_bytes       bigint,
  duration_seconds integer not null default 0,
  uploaded_by      uuid not null default auth.uid(),
  created_at       timestamptz not null default now()
);

create table if not exists public.group_media_targets (
  media_id   uuid not null references public.group_media(id) on delete cascade,
  group_code text not null,
  primary key (media_id, group_code)
);
create index if not exists group_media_targets_group_idx on public.group_media_targets (group_code);

-- Helpers are SECURITY DEFINER so the two tables' policies never recurse into each other.
create or replace function public.ufuq_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher','admin'));
$$;
create or replace function public.ufuq_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.ufuq_my_group_codes() returns setof text
language sql stable security definer set search_path = public as $$
  select group_code from public.group_members where user_id = auth.uid()
  union
  select group_code from public.teacher_groups where teacher_id = auth.uid();
$$;
create or replace function public.ufuq_media_owned(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_media where id = m and uploaded_by = auth.uid());
$$;

alter table public.group_media enable row level security;
alter table public.group_media_targets enable row level security;

drop policy if exists group_media_select on public.group_media;
create policy group_media_select on public.group_media for select to authenticated using (
  uploaded_by = (select auth.uid()) or public.ufuq_is_admin()
  or exists (select 1 from public.group_media_targets t
             where t.media_id = group_media.id and t.group_code in (select public.ufuq_my_group_codes()))
);
drop policy if exists group_media_insert on public.group_media;
create policy group_media_insert on public.group_media for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.ufuq_is_staff());
drop policy if exists group_media_update on public.group_media;
create policy group_media_update on public.group_media for update to authenticated
  using (uploaded_by = (select auth.uid()) or public.ufuq_is_admin())
  with check (uploaded_by = (select auth.uid()) or public.ufuq_is_admin());
drop policy if exists group_media_delete on public.group_media;
create policy group_media_delete on public.group_media for delete to authenticated
  using (uploaded_by = (select auth.uid()) or public.ufuq_is_admin());

drop policy if exists group_media_targets_select on public.group_media_targets;
create policy group_media_targets_select on public.group_media_targets for select to authenticated using (
  group_code in (select public.ufuq_my_group_codes()) or public.ufuq_media_owned(media_id) or public.ufuq_is_admin()
);
drop policy if exists group_media_targets_insert on public.group_media_targets;
create policy group_media_targets_insert on public.group_media_targets for insert to authenticated with check (
  public.ufuq_media_owned(media_id)
  and (public.ufuq_is_admin() or group_code in (select group_code from public.teacher_groups where teacher_id = (select auth.uid())))
);
drop policy if exists group_media_targets_delete on public.group_media_targets;
create policy group_media_targets_delete on public.group_media_targets for delete to authenticated
  using (public.ufuq_media_owned(media_id) or public.ufuq_is_admin());
-- Hardening: a teacher must not be able to point a row at someone else's R2 object (it would get a signed link for it).
alter table public.group_media drop constraint if exists group_media_key_shape;
alter table public.group_media add constraint group_media_key_shape
  check (r2_key like 'groups/%' or r2_key like ('shared/' || uploaded_by::text || '/%'));

create or replace function public.ufuq_media_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.r2_key is distinct from old.r2_key or new.uploaded_by is distinct from old.uploaded_by
     or new.file_url is distinct from old.file_url or new.kind is distinct from old.kind then
    raise exception 'group_media: file reference is immutable';
  end if;
  return new;
end $$;
drop trigger if exists group_media_immutable on public.group_media;
create trigger group_media_immutable before update on public.group_media
  for each row execute function public.ufuq_media_immutable();

create or replace function public.ufuq_media_target_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  select r2_key into k from public.group_media where id = new.media_id;
  if k like 'groups/%' then
    -- single-group files live in groups/<that group>/… and can be linked to that group only
    if split_part(k, '/', 2) <> left(regexp_replace(new.group_code, '[^a-zA-Z0-9_-]+', '-', 'g'), 64)
       or exists (select 1 from public.group_media_targets where media_id = new.media_id and group_code <> new.group_code) then
      raise exception 'group_media_targets: file does not belong to this group';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ufuq_media_target_guard() from public, anon, authenticated;
drop trigger if exists group_media_target_guard on public.group_media_targets;
create trigger group_media_target_guard before insert on public.group_media_targets
  for each row execute function public.ufuq_media_target_guard();
