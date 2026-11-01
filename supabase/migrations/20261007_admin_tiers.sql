-- Two admin tiers: 'super' (main admin, everything) and 'standard' (no group/task/exam management).
-- Existing admins become main admins. Safe to run more than once.

alter table public.profiles add column if not exists admin_tier text check (admin_tier in ('super','standard'));
update public.profiles set admin_tier = 'super' where role = 'admin' and admin_tier is null;

create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.admin_tier,'super') = 'super');
$$;
create or replace function public.is_standard_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.admin_tier = 'standard');
$$;

-- Nobody but a main admin may change role / admin_tier (stops self-promotion through a profile update).
create or replace function public.guard_admin_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin()
     and (new.admin_tier is distinct from old.admin_tier or (new.role = 'admin' and old.role is distinct from 'admin')) then
    raise exception 'only the main admin can change admin roles';
  end if;
  return new;
end $$;
drop trigger if exists guard_admin_columns on public.profiles;
create trigger guard_admin_columns before update on public.profiles for each row execute function public.guard_admin_columns();

create or replace function public.admin_list_admins()
returns table (id uuid, full_name text, email text, admin_tier text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, u.email::text, coalesce(p.admin_tier,'super')
  from public.profiles p join auth.users u on u.id = p.id
  where public.is_super_admin() and p.role = 'admin' order by (coalesce(p.admin_tier,'super') = 'super') desc, p.full_name;
$$;

create or replace function public.admin_appoint(p_email text, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_tier not in ('super','standard') then raise exception 'bad tier'; end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email));
  if uid is null then raise exception 'user_not_found'; end if;
  if uid = auth.uid() then raise exception 'cannot change yourself'; end if;
  update public.profiles set role = 'admin', admin_tier = p_tier where id = uid;
end $$;

create or replace function public.admin_set_tier(p_user uuid, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_tier not in ('super','standard') then raise exception 'bad tier'; end if;
  if p_user = auth.uid() then raise exception 'cannot change yourself'; end if;
  update public.profiles set admin_tier = p_tier where id = p_user and role = 'admin';
end $$;

-- Removes admin rights (the person becomes an ordinary student account again).
create or replace function public.admin_revoke(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot change yourself'; end if;
  update public.profiles set role = 'student', admin_tier = null, updated_at = now() where id = p_user and role = 'admin';
  delete from public.teacher_groups where teacher_id = p_user;
end $$;

-- The existing role RPC: only a main admin may create or modify admins.
create or replace function public.admin_set_role(p_user_id uuid, p_role app_role)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Faqat administrator bu amalni bajara oladi.'; end if;
  if p_user_id = auth.uid() then raise exception 'O''zingizning rolingizni o''zgartira olmaysiz.'; end if;
  if not public.is_super_admin() and (p_role = 'admin' or exists (select 1 from public.profiles where id = p_user_id and role = 'admin')) then
    raise exception 'Faqat asosiy administrator adminlarni boshqara oladi.';
  end if;
  update public.profiles set role = p_role, admin_tier = case when p_role = 'admin' then coalesce(admin_tier, 'standard') else null end, updated_at = now() where id = p_user_id;
  if p_role <> 'teacher' then delete from public.teacher_groups where teacher_id = p_user_id; end if;
end; $$;

grant execute on function public.is_super_admin(), public.is_standard_admin(), public.admin_list_admins(),
  public.admin_appoint(text,text), public.admin_set_tier(uuid,text), public.admin_revoke(uuid) to authenticated;

-- Server-side enforcement: RESTRICTIVE policies are AND-ed with your existing ones, and only bite standard admins.
do $$
declare t text;
begin
  foreach t in array array['groups','group_members','teacher_groups','tasks','exams','exam_questions','written_exams','written_exam_questions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists no_std_admin_ins on public.%I', t);
      execute format('drop policy if exists no_std_admin_upd on public.%I', t);
      execute format('drop policy if exists no_std_admin_del on public.%I', t);
      execute format('create policy no_std_admin_ins on public.%I as restrictive for insert with check (not public.is_standard_admin())', t);
      execute format('create policy no_std_admin_upd on public.%I as restrictive for update using (not public.is_standard_admin())', t);
      execute format('create policy no_std_admin_del on public.%I as restrictive for delete using (not public.is_standard_admin())', t);
    end if;
  end loop;
end $$;
