-- 20261019 — Who is exempt from paying, and join_group needs a plan.
-- Rule: teachers and MAIN (super) admins are free. A STANDARD admin is treated exactly like a student:
-- when "Require payment" is ON and they have no active plan, My Group and the other paid sections are locked.
-- Safe to run more than once.

create or replace function public.user_has_access(p_uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    -- free: teachers and MAIN admins (a standard admin is treated like a student)
    when exists (select 1 from public.profiles p where p.id = p_uid
                 and (p.role = 'teacher' or (p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super'))) then true
    when not coalesce((select s.payments_enforced from public.payment_settings s where s.id = 1), true) then true
    when exists (select 1 from public.profiles p where p.id = p_uid and p.status = 'blocked') then false
    else exists (select 1 from public.subscriptions s where s.user_id = p_uid and s.revoked_at is null and now() between s.starts_at and s.ends_at)
  end;
$$;
revoke execute on function public.user_has_access(uuid) from public, anon, authenticated;

create or replace function public.my_access() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_enforced boolean;
  v_exempt boolean;
  v_ends timestamptz;
begin
  select payments_enforced into v_enforced from public.payment_settings where id = 1;
  if v_uid is null then return jsonb_build_object('enforced', coalesce(v_enforced, false), 'active', false, 'exempt', false, 'ends_at', null, 'has_access', false); end if;
  select (p.role = 'teacher' or (p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super')) into v_exempt from public.profiles p where p.id = v_uid;
  select max(s.ends_at) into v_ends from public.subscriptions s where s.user_id = v_uid and s.revoked_at is null and now() between s.starts_at and s.ends_at;
  return jsonb_build_object(
    'enforced', coalesce(v_enforced, false),
    'exempt', coalesce(v_exempt, false),
    'active', v_ends is not null,
    'ends_at', v_ends,
    'has_access', public.user_has_access(v_uid)
  );
end $$;
grant execute on function public.my_access() to authenticated;

-- Exams: a standard admin without a plan cannot open exams either (main admins and teachers pass user_has_access).
create or replace function public.can_take_written_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.written_exams e
    where e.id = p_exam_id and e.is_published
      and public.user_has_access(auth.uid())
      and (
        e.group_code in (select public.my_group_codes())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  );
$$;

-- Joining a group needs an active plan (the client already shows "Subscription required").
create or replace function public.join_group(p_code text)
returns table(group_code text, group_name text, group_schedule text, group_zoom_link text, group_schedule_days jsonb)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  v_group public.groups%rowtype;
  v_user_name text;
  v_group_code text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_fails int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- Payments: joining a group needs an active plan (when payments are enforced).
  if not public.user_has_access(auth.uid()) then raise exception 'PAYMENT_REQUIRED'; end if;

  select count(*) into v_fails from public.join_attempts
   where user_id = auth.uid() and created_at > now() - interval '15 minutes';
  if v_fails >= 8 then raise exception 'TOO_MANY_ATTEMPTS'; end if;

  if v_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$' then
    select gac.group_code into v_group_code from public.group_access_codes gac where gac.code = v_code;
    if v_group_code is not null then
      select * into v_group from public.groups g where g.code = v_group_code and g.is_active = true limit 1;
    end if;
  end if;

  if v_group.code is null then
    -- log the failure and return no row (raising would roll the log back); the client shows "wrong code"
    insert into public.join_attempts (user_id) values (auth.uid());
    delete from public.join_attempts where created_at < now() - interval '2 days';
    return;
  end if;

  select coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Student')
    into v_user_name from auth.users u where u.id = auth.uid();

  insert into public.group_members (user_id, group_code, name, joined_at)
  values (auth.uid(), v_group.code, coalesce(v_user_name, 'Student'), now())
  on conflict (user_id, group_code) do nothing;

  update public.profiles p set status = 'active', updated_at = now() where p.id = auth.uid();

  return query select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end $$;

revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;
