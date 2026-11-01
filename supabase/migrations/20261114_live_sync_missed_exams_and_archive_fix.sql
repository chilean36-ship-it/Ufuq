-- STAGE 7 (sync + fix). Safe to run more than once. Run it AFTER 20261112 and 20261113.
--
-- WHY: the live database is ahead of the stage 5 / stage 6 files. Two later migrations
-- (auto_level_groups_and_missed_exams, fix_level_group_join_code) replaced several functions and added the teacher
-- "missed the deadline" tools, but their SQL was never put into the repo. Re-running the older stage 5 file on its own
-- would silently bring back the OLD versions of those functions. This file is the single, final definition of all of them.
--
-- BUG FIXED HERE: ufuq_reset_level_attempts wrote to written_exam_attempt_archive.snapshot, a column the live table does
-- not have. Every level move onto a level that already had midterm/final papers (a demotion, or a failed re-take) died with
--   column "snapshot" of relation "written_exam_attempt_archive" does not exist
-- and rolled back the whole grading step. The archive now stores the real columns.

-- ---------------------------------------------------------------- 1) archive table: one shape (the live one)
create table if not exists public.written_exam_attempt_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  archived_at timestamptz not null default now()
);
alter table public.written_exam_attempt_archive add column if not exists submission_id uuid;
alter table public.written_exam_attempt_archive add column if not exists exam_id uuid;
alter table public.written_exam_attempt_archive add column if not exists level int;
alter table public.written_exam_attempt_archive add column if not exists exam_kind text;
alter table public.written_exam_attempt_archive add column if not exists status text;
alter table public.written_exam_attempt_archive add column if not exists total_score int;
alter table public.written_exam_attempt_archive add column if not exists started_at timestamptz;
alter table public.written_exam_attempt_archive add column if not exists submitted_at timestamptz;
alter table public.written_exam_attempt_archive add column if not exists answers jsonb not null default '[]'::jsonb;
alter table public.written_exam_attempt_archive add column if not exists reason text not null default 'level_reset';
do $$
begin   -- a database built from the stage 5 file has the old "snapshot" column: it must not block inserts any more
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'written_exam_attempt_archive' and column_name = 'snapshot') then
    alter table public.written_exam_attempt_archive alter column snapshot drop not null;
  end if;
end $$;
alter table public.written_exam_attempt_archive enable row level security;
drop policy if exists written_exam_attempt_archive_select on public.written_exam_attempt_archive;
create policy written_exam_attempt_archive_select on public.written_exam_attempt_archive for select to authenticated
  using (user_id = (select auth.uid()) or public.ufuq_is_staff());
revoke all on public.written_exam_attempt_archive from anon;
revoke insert, update, delete on public.written_exam_attempt_archive from authenticated;

-- ---------------------------------------------------------------- 2) level_transitions.reason + deadline extensions
alter table public.level_transitions add column if not exists reason text not null default 'exam';   -- 'exam' | 'missed' | 'removed'

create table if not exists public.written_exam_extensions (
  exam_id uuid not null references public.written_exams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  until_at timestamptz not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  primary key (exam_id, user_id)
);
alter table public.written_exam_extensions enable row level security;
drop policy if exists exam_ext_select on public.written_exam_extensions;
create policy exam_ext_select on public.written_exam_extensions for select to authenticated
  using (user_id = (select auth.uid()) or public.teaches_written_exam(exam_id));
revoke all on public.written_exam_extensions from anon;
revoke insert, update, delete on public.written_exam_extensions from authenticated;

-- ---------------------------------------------------------------- 3) internal level functions
create or replace function public.ufuq_reset_level_attempts(p_user uuid, p_level int)
returns int language plpgsql security definer set search_path = public as $fn$
declare v_ids uuid[]; v_n int;
begin
  select array_agg(s.id) into v_ids
    from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
   where s.user_id = p_user and e.level = p_level and e.exam_kind in ('midterm', 'final');
  if v_ids is null then return 0; end if;

  insert into public.written_exam_attempt_archive
         (submission_id, exam_id, user_id, level, exam_kind, status, total_score, started_at, submitted_at, answers, reason)
  select s.id, s.exam_id, s.user_id, p_level, e.exam_kind, s.status, s.total_score, s.started_at, s.submitted_at,
         coalesce((select jsonb_agg(to_jsonb(a)) from public.written_exam_answers a where a.submission_id = s.id), '[]'::jsonb),
         'level_reset'
    from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
   where s.id = any (v_ids);

  delete from public.written_exam_submissions where id = any (v_ids);   -- answers / staff actions go with it (ON DELETE CASCADE)
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function public.ufuq_reset_level_attempts(uuid, int) from public, anon, authenticated;

create or replace function public.ufuq_level_group_name(p_level integer, p_exclude text default null)
returns text language plpgsql stable set search_path = public as $fn$
declare n int := 1; v text;
begin
  loop
    v := case when n = 1 then 'Level-' || p_level else 'Level-' || p_level || '-' || n end;
    exit when not exists (select 1 from public.groups g where g.name = v and g.code is distinct from p_exclude);
    n := n + 1;
  end loop;
  return v;
end $fn$;

create or replace function public.ufuq_get_or_create_level_group(p_level integer, p_template text default null)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_code text; v_jc text; t public.groups%rowtype;
begin
  select g.code into v_code from public.groups g where g.type = 'class' and g.is_active and g.level = p_level
   order by (select count(*) from public.group_members m where m.group_code = g.code), g.created_at limit 1;
  if v_code is not null then return v_code; end if;

  select g.code into v_code from public.groups g where g.type = 'class' and not g.is_active and g.level = p_level order by g.created_at limit 1;
  if v_code is not null then update public.groups set is_active = true where code = v_code; return v_code; end if;

  if p_template is not null then select * into t from public.groups where code = p_template; end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups g where g.code = v_code);
  end loop;
  insert into public.groups (code, name, schedule, zoom_link, is_active, schedule_days, type, slot_minutes, buffer_minutes, no_show_minutes, duration_minutes, level)
  values (v_code, 'Level-' || p_level, coalesce(t.schedule, ''), t.zoom_link, true, coalesce(t.schedule_days, '[]'::jsonb), 'class',
          coalesce(t.slot_minutes, 10), coalesce(t.buffer_minutes, 2), coalesce(t.no_show_minutes, 3), coalesce(t.duration_minutes, 120), p_level);

  if p_template is not null then
    insert into public.teacher_groups (teacher_id, group_code)
    select distinct tg.teacher_id, v_code from public.teacher_groups tg where tg.group_code = p_template on conflict do nothing;
  end if;
  insert into public.teacher_groups (teacher_id, group_code)
  select p.id, v_code from public.profiles p where p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super' on conflict do nothing;

  if not exists (select 1 from public.group_access_codes a where a.group_code = v_code) then
    loop
      v_jc := public._new_join_code();
      exit when not exists (select 1 from public.group_access_codes a where a.code = v_jc);
    end loop;
    insert into public.group_access_codes (code, group_code) values (v_jc, v_code);
  end if;
  return v_code;
end $fn$;
revoke all on function public.ufuq_get_or_create_level_group(integer, text) from public, anon, authenticated;

create or replace function public.ufuq_move_student_level(p_user uuid, p_from integer, p_to integer, p_outcome text, p_reason text,
                                                          p_total numeric, p_mid numeric, p_fin numeric)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_from text; v_from_names text; v_target text; v_gname text; v_name text;
begin
  select string_agg(m.group_code, ','), string_agg(g.name, ', ') into v_from, v_from_names
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and (g.level is null or g.level = p_from);

  if p_to <> p_from then
    v_target := public.ufuq_get_or_create_level_group(p_to, split_part(coalesce(v_from, ''), ',', 1));
    select coalesce(p.full_name, 'Student') into v_name from public.profiles p where p.id = p_user;
    delete from public.group_members m using public.groups g
     where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
       and (g.level is null or g.level = p_from) and m.group_code <> v_target;
    insert into public.group_members (user_id, group_code, name, joined_at)
    values (p_user, v_target, v_name, now()) on conflict (user_id, group_code) do nothing;
    select g.name into v_gname from public.groups g where g.code = v_target;

    update public.profiles set level = p_to, updated_at = now() where id = p_user;
    perform public.ufuq_reset_level_attempts(p_user, p_to);

    update public.groups g set is_active = false
     where g.type = 'class' and g.level = p_from and g.is_active
       and not exists (select 1 from public.group_members m where m.group_code = g.code);
  end if;

  insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, total_points, midterm_points, final_points,
                                        from_group, to_group, from_group_name, to_group_name)
  values (p_user, p_from, p_to, p_outcome, p_reason, p_total, p_mid, p_fin, v_from, v_target, v_from_names, v_gname);
end $fn$;
revoke all on function public.ufuq_move_student_level(uuid, integer, integer, text, text, numeric, numeric, numeric) from public, anon, authenticated;

create or replace function public.ufuq_apply_level_result(p_user uuid, p_level integer)
returns void language plpgsql security definer set search_path = public as $fn$
declare r record; v_cur int; v_cut timestamptz; v_new int;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student';
  if v_cur is null or v_cur <> p_level then return; end if;

  select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = p_user and t.from_level = p_level and t.reason = 'exam';
  select * into r from public.ufuq_level_result(p_user, p_level, v_cut);
  if r is null or not r.complete then return; end if;

  v_new := case when r.passed then least(p_level + 1, 14) else greatest(p_level - 1, 1) end;
  perform public.ufuq_move_student_level(p_user, p_level, v_new, case when r.passed then 'passed' else 'failed' end, 'exam',
                                         r.total_points, r.midterm_points, r.final_points);
end $fn$;
revoke all on function public.ufuq_apply_level_result(uuid, integer) from public, anon, authenticated;

create or replace function public.ufuq_archive_stale_attempts(p_user uuid, p_skip_level integer default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare n int := 0;
begin
  with stale as (
    select s.id, e.level, e.exam_kind
      from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
     where s.user_id = p_user and e.level is not null and e.exam_kind in ('midterm', 'final')
       and (p_skip_level is null or e.level <> p_skip_level)
       and exists (select 1 from public.level_transitions t
                    where t.user_id = p_user and t.to_level = e.level
                      and t.created_at >= coalesce(s.submitted_at, s.started_at)
                      and not (t.outcome = 'passed' and t.from_level = t.to_level))
  ), ins as (
    insert into public.written_exam_attempt_archive (submission_id, exam_id, user_id, level, exam_kind, status, total_score, started_at, submitted_at, answers)
    select s.id, s.exam_id, s.user_id, st.level, st.exam_kind, s.status, s.total_score, s.started_at, s.submitted_at,
           coalesce((select jsonb_agg(to_jsonb(a)) from public.written_exam_answers a where a.submission_id = s.id), '[]'::jsonb)
      from public.written_exam_submissions s join stale st on st.id = s.id
    returning submission_id
  )
  delete from public.written_exam_submissions where id in (select submission_id from ins);
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke all on function public.ufuq_archive_stale_attempts(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4) the student closes the result window
create or replace function public.ack_level_transition(p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare t public.level_transitions%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.level_transitions set seen_at = now()
   where id = p_id and user_id = auth.uid() and seen_at is null
   returning * into t;
  if not found then return; end if;
  if t.reason = 'exam' and t.outcome = 'failed' and t.from_level = t.to_level
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.level = t.to_level) then
    perform public.ufuq_reset_level_attempts(auth.uid(), t.to_level);
  end if;
end $fn$;
revoke all on function public.ack_level_transition(uuid) from public, anon;
grant execute on function public.ack_level_transition(uuid) to authenticated;

create or replace function public.ack_level_transitions()
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.level_transitions set seen_at = now() where user_id = auth.uid() and seen_at is null;
  perform public.ufuq_archive_stale_attempts(auth.uid(), null);
end $fn$;
revoke all on function public.ack_level_transitions() from public, anon;
grant execute on function public.ack_level_transitions() to authenticated;

-- ---------------------------------------------------------------- 5) starting an exam (deadline + per-student extension)
create or replace function public.start_written_exam(p_exam_id uuid)
returns setof public.written_exam_submissions
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_sub public.written_exam_submissions;
  v_role text;
  v_lvl int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select role::text, coalesce(level, 1) into v_role, v_lvl from public.profiles where id = v_uid;
  select e.id, e.group_code, e.is_published, e.level, e.exam_kind, e.deadline_at into v_exam from public.written_exams e where e.id = p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  if found then return next v_sub; return; end if;
  if not v_exam.is_published then raise exception 'EXAM_NOT_PUBLISHED'; end if;
  if v_exam.deadline_at is not null and now() > v_exam.deadline_at and coalesce(v_role, '') = 'student'
     and not exists (select 1 from public.written_exam_extensions x where x.exam_id = p_exam_id and x.user_id = v_uid and x.until_at > now()) then
    raise exception 'EXAM_DEADLINE_PASSED';
  end if;
  if not public.user_has_access(v_uid) then raise exception 'PAYMENT_REQUIRED'; end if;
  if coalesce(v_role, '') <> 'admin'
     and not exists (select 1 from public.group_members gm where gm.user_id = v_uid and gm.group_code = v_exam.group_code) then
    raise exception 'NOT_IN_GROUP';
  end if;
  if v_role = 'student' and v_exam.exam_kind is not null and v_exam.level is not null and v_exam.level <> v_lvl then
    raise exception 'LEVEL_MISMATCH';
  end if;
  insert into public.written_exam_submissions (exam_id, user_id, status) values (p_exam_id, v_uid, 'draft')
    on conflict (exam_id, user_id) do nothing;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  return next v_sub;
end $fn$;
revoke all on function public.start_written_exam(uuid) from public, anon;
grant execute on function public.start_written_exam(uuid) to authenticated;

-- ---------------------------------------------------------------- 6) teacher tools: students who missed the deadline
-- The result type changed (level, extended_until were added), so the old function must be dropped first.
drop function if exists public.exam_missed_students(uuid);
create function public.exam_missed_students(p_exam_id uuid)
returns table(user_id uuid, name text, status text, level integer, extended_until timestamptz)
language sql stable security definer set search_path = public as $fn$
  select m.user_id, m.name, s.status, coalesce(p.level, 1)::int, x.until_at
    from public.written_exams e
    join public.group_members m on m.group_code = e.group_code
    join public.profiles p on p.id = m.user_id and p.role = 'student'
    left join public.written_exam_submissions s on s.exam_id = e.id and s.user_id = m.user_id
    left join public.written_exam_extensions x on x.exam_id = e.id and x.user_id = m.user_id
   where e.id = p_exam_id and public.teaches_written_exam(e.id)
     and (s.id is null or s.status = 'draft')
   order by m.name
$fn$;
revoke all on function public.exam_missed_students(uuid) from public, anon;
grant execute on function public.exam_missed_students(uuid) to authenticated;

create or replace function public.staff_extend_exam_deadline(p_exam_id uuid, p_user uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  if p_until is null or p_until <= now() then raise exception 'bad_date'; end if;
  if not exists (select 1 from public.written_exams e join public.group_members m on m.group_code = e.group_code
                  where e.id = p_exam_id and m.user_id = p_user) then raise exception 'not_in_group'; end if;
  insert into public.written_exam_extensions (exam_id, user_id, until_at) values (p_exam_id, p_user, p_until)
    on conflict (exam_id, user_id) do update set until_at = excluded.until_at, granted_by = auth.uid();
end $fn$;
revoke all on function public.staff_extend_exam_deadline(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.staff_extend_exam_deadline(uuid, uuid, timestamptz) to authenticated;

create or replace function public.staff_demote_missed_student(p_exam_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_lvl int;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.written_exams e join public.group_members m on m.group_code = e.group_code
                  where e.id = p_exam_id and m.user_id = p_user) then raise exception 'not_in_group'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_lvl from public.profiles p where p.id = p_user and p.role = 'student';
  if v_lvl is null then raise exception 'not_a_student'; end if;
  if v_lvl <= 1 then raise exception 'already_lowest'; end if;
  perform public.ufuq_move_student_level(p_user, v_lvl, v_lvl - 1, 'failed', 'missed', null, null, null);
end $fn$;
revoke all on function public.staff_demote_missed_student(uuid, uuid) from public, anon;
grant execute on function public.staff_demote_missed_student(uuid, uuid) to authenticated;

create or replace function public.staff_remove_missed_student(p_exam_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_group text; v_gname text; v_lvl int; v_glevel smallint;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  select e.group_code into v_group from public.written_exams e where e.id = p_exam_id;
  if not exists (select 1 from public.group_members m where m.group_code = v_group and m.user_id = p_user) then raise exception 'not_in_group'; end if;
  select coalesce(p.level, 1) into v_lvl from public.profiles p where p.id = p_user and p.role = 'student';
  if v_lvl is null then raise exception 'not_a_student'; end if;
  select g.name, g.level into v_gname, v_glevel from public.groups g where g.code = v_group;

  delete from public.group_members where group_code = v_group and user_id = p_user;
  insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, from_group, from_group_name)
  values (p_user, v_lvl, v_lvl, 'failed', 'removed', v_group, v_gname);

  if v_glevel is not null then
    update public.groups g set is_active = false where g.code = v_group and g.is_active
       and not exists (select 1 from public.group_members m where m.group_code = g.code);
  end if;
end $fn$;
revoke all on function public.staff_remove_missed_student(uuid, uuid) from public, anon;
grant execute on function public.staff_remove_missed_student(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
