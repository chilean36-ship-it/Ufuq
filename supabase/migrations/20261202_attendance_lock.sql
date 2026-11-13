-- Attendance lock: a student who misses 3 lessons in one calendar month is locked out of the lesson sections
-- (group, tasks, exams, library, certificates, hifz … exactly like an unpaid student) until a teacher of that student's
-- group or an admin allows access again. The permission is per student and per month (it ends with the month).
--
-- Rules
--   * counted: attendance_records.present = false for sessions whose session_date is in the current calendar month;
--   * the limit is 3 (the 3rd absence locks);
--   * teachers and admins are never locked; test accounts (profiles.level_free) are never locked;
--   * the browser only READS the state (my_attendance_lock); the unlock goes through set_attendance_unlock(), which checks
--     that the caller is an admin or teaches one of the student's groups. There is no direct write policy on the table.
-- Depends on helpers: ufuq_is_staff(), ufuq_is_admin(), ufuq_teaches(text) (see 20261011_hifz.sql / group_media.sql).

create table if not exists public.attendance_unlocks (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  month      date        not null,                          -- first day of the month the permission is for
  allowed_by uuid        references auth.users (id) on delete set null,
  allowed_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.attendance_unlocks enable row level security;

drop policy if exists attendance_unlocks_read on public.attendance_unlocks;
create policy attendance_unlocks_read on public.attendance_unlocks
  for select to authenticated
  using (user_id = (select auth.uid()) or public.ufuq_is_staff());
-- no insert / update / delete policy on purpose: writes happen only inside set_attendance_unlock() (security definer)

-- The signed-in student's state for the current month.
create or replace function public.my_attendance_lock()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_month  date := date_trunc('month', now())::date;
  v_absent int  := 0;
  v_unl    boolean := false;
  v_free   boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('absent', 0, 'limit', 3, 'locked', false, 'unlocked', false, 'month', v_month);
  end if;
  select (p.role in ('teacher', 'admin') or coalesce(p.level_free, false)) into v_free from public.profiles p where p.id = v_uid;
  select count(*) into v_absent
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
   where r.user_id = v_uid and r.present = false
     and s.session_date >= v_month and s.session_date < (v_month + interval '1 month')::date;
  select exists (select 1 from public.attendance_unlocks u where u.user_id = v_uid and u.month = v_month) into v_unl;
  return jsonb_build_object(
    'absent', v_absent, 'limit', 3, 'unlocked', v_unl, 'month', v_month,
    'locked', (not coalesce(v_free, false)) and v_absent >= 3 and not v_unl
  );
end $$;
revoke all on function public.my_attendance_lock() from public, anon;
grant execute on function public.my_attendance_lock() to authenticated;

-- Teacher / admin: allow (true) or lock again (false) one student for the current month.
create or replace function public.set_attendance_unlock(p_user uuid, p_allow boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', now())::date;
begin
  if auth.uid() is null or not public.ufuq_is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  if not public.ufuq_is_admin() and not exists (
       select 1 from public.group_members gm where gm.user_id = p_user and public.ufuq_teaches(gm.group_code)) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_allow then
    insert into public.attendance_unlocks (user_id, month, allowed_by) values (p_user, v_month, auth.uid())
    on conflict (user_id, month) do update set allowed_by = excluded.allowed_by, allowed_at = now();
  else
    delete from public.attendance_unlocks where user_id = p_user and month = v_month;
  end if;
end $$;
revoke all on function public.set_attendance_unlock(uuid, boolean) from public, anon;
grant execute on function public.set_attendance_unlock(uuid, boolean) to authenticated;
