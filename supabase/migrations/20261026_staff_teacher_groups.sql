-- Stage 1: Main admin can make a user a Teacher, an ordinary Admin or a Main admin, and choose which groups each one works with.
-- Everything is main-admin-only and enforced on the server (SECURITY DEFINER RPCs + hardened guard trigger). Safe to run more than once.

-- 1) Staff list (admins + teachers) with the codes of the groups linked to each person.
drop function if exists public.admin_list_staff();
create function public.admin_list_staff()
returns table (id uuid, full_name text, email text, role text, admin_tier text, group_codes text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, u.email::text, p.role::text,
         case when p.role = 'admin' then coalesce(p.admin_tier, 'super') end,
         coalesce((select array_agg(tg.group_code order by tg.group_code) from public.teacher_groups tg where tg.teacher_id = p.id), '{}'::text[])
  from public.profiles p join auth.users u on u.id = p.id
  where public.is_super_admin() and p.role in ('admin', 'teacher')
  order by (p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super') desc, (p.role = 'admin') desc, p.full_name;
$$;

-- 2) Appoint by email: p_tier = 'super' | 'standard' | 'teacher'. Only a main admin gets every group automatically;
--    teachers and ordinary admins start with their current groups (none for a new person) and are linked afterwards.
create or replace function public.admin_appoint(p_email text, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_tier not in ('super', 'standard', 'teacher') then raise exception 'bad tier'; end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email));
  if uid is null then raise exception 'user_not_found'; end if;
  if uid = auth.uid() then raise exception 'cannot change yourself'; end if;
  if p_tier = 'teacher' then
    update public.profiles set role = 'teacher', admin_tier = null, updated_at = now() where id = uid;
  else
    update public.profiles set role = 'admin', admin_tier = p_tier, updated_at = now() where id = uid;
  end if;
  if p_tier = 'super' then
    insert into public.teacher_groups (teacher_id, group_code) select uid, g.code from public.groups g on conflict (teacher_id, group_code) do nothing;
  end if;
end $$;

-- 3) Change the kind of an existing staff member (teacher <-> admin <-> main admin). Linked groups are kept.
create or replace function public.admin_set_staff_kind(p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('super', 'standard', 'teacher') then raise exception 'bad tier'; end if;
  if p_user = auth.uid() then raise exception 'cannot change yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role in ('admin', 'teacher')) then raise exception 'user_not_found'; end if;
  if p_kind = 'teacher' then
    update public.profiles set role = 'teacher', admin_tier = null, updated_at = now() where id = p_user;
  else
    update public.profiles set role = 'admin', admin_tier = p_kind, updated_at = now() where id = p_user;
  end if;
  if p_kind = 'super' then
    insert into public.teacher_groups (teacher_id, group_code) select p_user, g.code from public.groups g on conflict (teacher_id, group_code) do nothing;
  end if;
end $$;

-- 4) Replace the whole set of groups linked to a teacher / admin in one atomic call.
create or replace function public.admin_set_staff_groups(p_user uuid, p_codes text[])
returns void language plpgsql security definer set search_path = public as $$
declare codes text[];
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role in ('admin', 'teacher')) then raise exception 'user_not_found'; end if;
  select coalesce(array_agg(distinct c), '{}') into codes from unnest(coalesce(p_codes, '{}'::text[])) c;
  if exists (select 1 from unnest(codes) c where not exists (select 1 from public.groups g where g.code = c)) then raise exception 'group_not_found'; end if;
  delete from public.teacher_groups where teacher_id = p_user and group_code <> all (codes);
  insert into public.teacher_groups (teacher_id, group_code) select p_user, c from unnest(codes) c on conflict (teacher_id, group_code) do nothing;
end $$;

-- 5) The older single-group RPC was open to ANY admin (even an ordinary one): main admin only, staff targets only.
create or replace function public.admin_set_teacher_group(p_teacher_id uuid, p_group_code text, p_assign boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Faqat asosiy administrator bu amalni bajara oladi.'; end if;
  if not exists (select 1 from public.profiles where id = p_teacher_id and role in ('admin', 'teacher')) then raise exception 'user_not_found'; end if;
  if p_assign then
    if not exists (select 1 from public.groups where code = p_group_code) then raise exception 'group_not_found'; end if;
    insert into public.teacher_groups (teacher_id, group_code) values (p_teacher_id, p_group_code) on conflict (teacher_id, group_code) do nothing;
  else
    delete from public.teacher_groups where teacher_id = p_teacher_id and group_code = p_group_code;
  end if;
end $$;

-- 6) Remove staff rights: admins AND teachers go back to an ordinary student account.
create or replace function public.admin_revoke(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot change yourself'; end if;
  update public.profiles set role = 'student', admin_tier = null, updated_at = now() where id = p_user and role in ('admin', 'teacher');
  delete from public.teacher_groups where teacher_id = p_user;
end $$;

-- 7) The generic role RPC could be used by an ordinary admin to make anybody a teacher: main admin only now.
create or replace function public.admin_set_role(p_user_id uuid, p_role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Faqat asosiy administrator rollarni o''zgartira oladi.'; end if;
  if p_user_id = auth.uid() then raise exception 'O''zingizning rolingizni o''zgartira olmaysiz.'; end if;
  update public.profiles set role = p_role, admin_tier = case when p_role = 'admin' then coalesce(admin_tier, 'standard') else null end, updated_at = now() where id = p_user_id;
  if p_role not in ('teacher', 'admin') then delete from public.teacher_groups where teacher_id = p_user_id; end if;
end $$;

-- 8) Guard trigger: only a main admin may change ANY role (incl. teacher) or admin tier through a direct profile update.
create or replace function public.guard_admin_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.admin_tier is distinct from old.admin_tier or new.role is distinct from old.role then
      raise exception 'Faqat asosiy administrator rollarni o''zgartira oladi.';
    end if;
    if new.student_id is distinct from old.student_id and not public.is_admin() then
      raise exception 'student_id o''zgartirib bo''lmaydi.';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.admin_list_staff(), public.admin_set_staff_kind(uuid, text), public.admin_set_staff_groups(uuid, text[]) from public, anon;
grant execute on function public.admin_list_staff(), public.admin_set_staff_kind(uuid, text), public.admin_set_staff_groups(uuid, text[]),
  public.admin_appoint(text, text), public.admin_revoke(uuid), public.admin_set_teacher_group(uuid, text, boolean), public.admin_set_role(uuid, app_role) to authenticated;
