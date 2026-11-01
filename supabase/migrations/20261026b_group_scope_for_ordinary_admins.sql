-- Stage 2: group linking is now REAL for ordinary admins. Until now public.teaches_group() answered true for every admin,
-- so an ordinary admin could reach every group at the database level even when the panel showed only a few.
-- Now: main admin = all groups; teacher / ordinary admin = only the groups linked in teacher_groups. Safe to run more than once.

create or replace function public.teaches_group(p_group_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.teacher_groups where teacher_id = auth.uid() and group_code = p_group_code
  );
$$;

-- Student status / level: main admin anywhere, everybody else only for students of the groups they teach.
create or replace function public.admin_update_student(p_user_id uuid, p_status profile_status default null, p_level integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_teacher()) then
    raise exception 'Faqat o''qituvchilar bu amalni bajara oladi.';
  end if;
  if not public.is_super_admin() and not exists (
    select 1 from public.group_members gm where gm.user_id = p_user_id and public.teaches_group(gm.group_code)
  ) then
    raise exception 'Bu talaba sizning guruhingizga tegishli emas.';
  end if;
  update public.profiles set status = coalesce(p_status, status), level = coalesce(p_level, level), updated_at = now() where id = p_user_id;
end $$;

-- Profiles: an ordinary admin sees himself and the students of his own groups (the last branch), not every account.
alter policy profiles_select_scoped on public.profiles using (
  ((select auth.uid()) = id) or public.is_super_admin() or exists (
    select 1 from public.group_members gm join public.teacher_groups tg on tg.group_code = gm.group_code
    where gm.user_id = profiles.id and tg.teacher_id = (select auth.uid())
  )
);
alter policy profiles_update_combined on public.profiles
  using (((select auth.uid()) = id) or public.is_super_admin())
  with check (
    (((select auth.uid()) = id)
      and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
      and status = (select p.status from public.profiles p where p.id = (select auth.uid()))
      and level = (select p.level from public.profiles p where p.id = (select auth.uid())))
    or public.is_super_admin()
  );
