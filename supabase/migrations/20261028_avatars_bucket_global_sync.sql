-- Profile photos (global avatar): a public 'avatars' bucket where each user can write only into their own folder,
-- and ONE source of truth: profiles.avatar_url is mirrored to group_members automatically, so classmates,
-- the teacher and the admin all see the same photo, and it survives refresh / re-login.
-- Safe to re-run.

-- ---------- 1. bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 2. object policies ----------
-- reading: anyone (the photo is shown to classmates and in public places); writing: only into <own user id>/...
drop policy if exists avatars_obj_read on storage.objects;
create policy avatars_obj_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_obj_ins on storage.objects;
create policy avatars_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_obj_upd on storage.objects;
create policy avatars_obj_upd on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_obj_del on storage.objects;
create policy avatars_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 3. keep group_members in step with profiles.avatar_url ----------
-- Covers every write path (direct profiles update, set_my_avatar, account tools), not only the RPC.
create or replace function public.ufuq_mirror_avatar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update public.group_members set avatar_url = new.avatar_url where user_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists profiles_mirror_avatar on public.profiles;
create trigger profiles_mirror_avatar
  after update of avatar_url on public.profiles
  for each row execute function public.ufuq_mirror_avatar();

-- A student who joins a group right after setting a photo gets that photo in the roster at once.
create or replace function public.ufuq_member_avatar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  if new.avatar_url is null then
    select p.avatar_url into v_url from public.profiles p where p.id = new.user_id;
    new.avatar_url := v_url;
  end if;
  return new;
end $$;

drop trigger if exists group_members_avatar_fill on public.group_members;
create trigger group_members_avatar_fill
  before insert on public.group_members
  for each row execute function public.ufuq_member_avatar();

-- ---------- 4. backfill: copy the current photos into existing roster rows ----------
update public.group_members gm
   set avatar_url = p.avatar_url
  from public.profiles p
 where p.id = gm.user_id
   and p.avatar_url is not null
   and gm.avatar_url is distinct from p.avatar_url;
