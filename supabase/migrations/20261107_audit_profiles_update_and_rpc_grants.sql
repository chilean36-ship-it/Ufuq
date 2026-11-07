-- APPLIED to live (ldbthwpikixtykwmvudy) on 2026-11-07 via MCP, with the owner's approval. Kept here so the repo matches production.
-- Safe to run more than once.
--
-- 1) profiles UPDATE failed with 500 (42P17 "infinite recursion detected in policy for relation profiles"):
--    the WITH CHECK of profiles_update_combined read public.profiles again. The caller's current role/status/level are
--    now read through a SECURITY DEFINER helper (no RLS, so no recursion). Same rule as before: own row only, and
--    role/status/level cannot change; the super admin may update any row.
-- 2) preferred_lang had no column UPDATE grant, so src/lib/langSync.js always got 403 and no language was ever saved.
-- 3) record_slot_attendance(group_slots, boolean) had no permission check but was executable by every signed-in user
--    (any student could mark anyone present/absent). Only finish_slot / mark_no_show (SECURITY DEFINER, owner postgres)
--    call it. trg_groups_level_sync() was executable by anon.

create or replace function public.ufuq_my_profile_locks()
returns table (role public.app_role, status public.profile_status, level integer)
language sql stable security definer set search_path = public as $$
  select p.role, p.status, p.level from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.ufuq_my_profile_locks() from public, anon;
grant execute on function public.ufuq_my_profile_locks() to authenticated;

drop policy if exists profiles_update_combined on public.profiles;
create policy profiles_update_combined on public.profiles
  for update to authenticated
  using (((select auth.uid()) = id) or public.is_super_admin())
  with check (
    (((select auth.uid()) = id)
      and exists (select 1 from public.ufuq_my_profile_locks() l
        where l.role = profiles.role
          and l.status is not distinct from profiles.status
          and l.level is not distinct from profiles.level))
    or public.is_super_admin());

grant update (preferred_lang) on public.profiles to authenticated;

revoke execute on function public.record_slot_attendance(public.group_slots, boolean) from public, anon, authenticated;
revoke execute on function public.trg_groups_level_sync() from public, anon, authenticated;
