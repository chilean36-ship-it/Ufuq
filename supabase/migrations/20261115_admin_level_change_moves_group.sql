-- STAGE 8 (APPLIED to live via MCP on 2026-11-01). Safe to run more than once. Run it AFTER 20261114_live_sync_missed_exams_and_archive_fix.sql.
--
-- 1) LEVEL EXAMS BELONG TO A LEVEL, NOT TO A GROUP.
--    A midterm / final (exam_kind + level set) is shown to EVERY student of that level, whatever group they sit in.
--    The student sees it even before it is published (as a locked card, see my_level_exams()), but cannot start it
--    until a teacher / admin publishes it (start_written_exam still raises EXAM_NOT_PUBLISHED).
--    Teachers of any class group of that level can see, check and grade those papers.
--    Exams without a kind (custom exams) stay group-only, exactly as before.
-- 2) profiles.level_free = true  -> a test / special account: the level does not limit it. It may sit in several groups,
--    is never moved by results or by join_group, and sees the exams of the groups it belongs to.
-- 3) A manual level change (admin_update_student: +/-, typed number, bulk) moves the student to the group of the new level.

alter table public.profiles add column if not exists level_free boolean not null default false;
-- (students cannot write this column: profiles UPDATE is granted per column and level_free is not in the list)

-- ---------------------------------------------------------------- helpers
create or replace function public.ufuq_exam_open_to_me(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e join public.profiles p on p.id = auth.uid()
     where e.id = p_exam_id and (
       case
         when p.role = 'admin' then true
         when e.exam_kind is not null and e.level is not null and p.role = 'student' and not p.level_free
           then e.level = coalesce(p.level, 1)                                   -- level exam: my level, any group
         else e.group_code in (select gm.group_code from public.group_members gm where gm.user_id = p.id)
       end));
$$;
revoke all on function public.ufuq_exam_open_to_me(uuid) from public, anon;
grant execute on function public.ufuq_exam_open_to_me(uuid) to authenticated;

create or replace function public.ufuq_teaches_level_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and e.exam_kind is not null and e.level is not null
       and exists (select 1 from public.teacher_groups tg join public.groups g on g.code = tg.group_code
                    where tg.teacher_id = auth.uid() and g.type = 'class' and g.level = e.level));
$$;
revoke all on function public.ufuq_teaches_level_exam(uuid) from public, anon;
grant execute on function public.ufuq_teaches_level_exam(uuid) to authenticated;

create or replace function public.ufuq_in_exam_scope(p_exam_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and (
       (e.exam_kind is not null and e.level is not null and exists (
          select 1 from public.profiles p where p.id = p_user and p.role = 'student' and not p.level_free and coalesce(p.level, 1) = e.level))
       or exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p_user)));
$$;
revoke all on function public.ufuq_in_exam_scope(uuid, uuid) from public, anon, authenticated;

create or replace function public.teaches_written_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.written_exams e where e.id = p_exam_id and public.teaches_group(e.group_code))
      or public.ufuq_teaches_level_exam(p_exam_id);
$$;

create or replace function public.teaches_written_question(p_question_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exam_questions q join public.written_exams e on e.id = q.exam_id
     where q.id = p_question_id and (public.teaches_group(e.group_code) or public.ufuq_teaches_level_exam(e.id)));
$$;

-- ---------------------------------------------------------------- who can read an exam row
alter policy written_exams_select_combined on public.written_exams
  using ((is_published and public.ufuq_exam_open_to_me(id)) or public.teaches_group(group_code) or public.ufuq_teaches_level_exam(id));

-- ---------------------------------------------------------------- can the student take / start it
create or replace function public.can_take_written_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and e.is_published
       and public.user_has_access(auth.uid())
       and public.ufuq_exam_open_to_me(e.id));
$$;

create or replace function public.written_exam_question_counts(p_exam_ids uuid[])
returns table(exam_id uuid, n integer) language sql stable security definer set search_path to 'public' as $$
  select q.exam_id, count(*)::int
  from public.written_exam_questions q
  join public.written_exams e on e.id = q.exam_id
  where auth.uid() is not null
    and q.exam_id = any(p_exam_ids)
    and (
      public.ufuq_is_staff()
      or (e.is_published and public.ufuq_exam_open_to_me(e.id))
      or exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = auth.uid())
    )
  group by q.exam_id;
$$;

create or replace function public.start_written_exam(p_exam_id uuid)
returns setof public.written_exam_submissions
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_sub public.written_exam_submissions;
  v_role text;
  v_free boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select role::text, coalesce(level_free, false) into v_role, v_free from public.profiles where id = v_uid;
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
  if not public.ufuq_exam_open_to_me(p_exam_id) then
    if v_role = 'student' and not v_free and v_exam.exam_kind is not null and v_exam.level is not null then raise exception 'LEVEL_MISMATCH'; end if;
    raise exception 'NOT_IN_GROUP';
  end if;
  insert into public.written_exam_submissions (exam_id, user_id, status) values (p_exam_id, v_uid, 'draft')
    on conflict (exam_id, user_id) do nothing;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  return next v_sub;
end $fn$;
revoke all on function public.start_written_exam(uuid) from public, anon;
grant execute on function public.start_written_exam(uuid) to authenticated;

-- ---------------------------------------------------------------- the student's list: level exams, published or not
-- Only metadata (no questions, no answer keys). Students of a free account and staff get nothing here (they use the group list).
create or replace function public.my_level_exams()
returns table(id uuid, group_code text, title text, level smallint, exam_kind text, duration_minutes integer,
              deadline_at timestamptz, created_at timestamptz, is_published boolean)
language sql stable security definer set search_path = public as $$
  select x.id, x.group_code, x.title, x.level, x.exam_kind, x.duration_minutes, x.deadline_at, x.created_at, x.is_published
    from (
      select e.*, row_number() over (
               partition by e.level, e.exam_kind
               order by exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id) desc,
                        e.is_published desc,
                        exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p.id) desc,
                        e.created_at asc) as rn
        from public.written_exams e join public.profiles p on p.id = auth.uid()
       where auth.uid() is not null and p.role = 'student' and not p.level_free
         and e.exam_kind is not null and e.level is not null and e.level = coalesce(p.level, 1)
    ) x
   where x.rn = 1                                   -- every group holds its own copy of each level exam: the student sees ONE
   order by x.exam_kind desc, x.created_at desc;
$$;
revoke all on function public.my_level_exams() from public, anon;
grant execute on function public.my_level_exams() to authenticated;

-- ---------------------------------------------------------------- teacher tools (scope = level for level exams)
drop function if exists public.exam_missed_students(uuid);
create function public.exam_missed_students(p_exam_id uuid)
returns table(user_id uuid, name text, status text, level integer, extended_until timestamptz)
language sql stable security definer set search_path = public as $fn$
  select p.id,
         coalesce(nullif(p.full_name, ''), (select m2.name from public.group_members m2 where m2.user_id = p.id limit 1), 'Student'),
         s.status, coalesce(p.level, 1)::int, x.until_at
    from public.written_exams e
    join public.profiles p on p.role = 'student' and (
           (e.exam_kind is not null and e.level is not null and not p.level_free and coalesce(p.level, 1) = e.level)
        or exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p.id))
    left join public.written_exam_submissions s on s.exam_id = e.id and s.user_id = p.id
    left join public.written_exam_extensions x on x.exam_id = e.id and x.user_id = p.id
   where e.id = p_exam_id and public.teaches_written_exam(e.id)
     and (s.id is null or s.status = 'draft')
   order by 2
$fn$;
revoke all on function public.exam_missed_students(uuid) from public, anon;
grant execute on function public.exam_missed_students(uuid) to authenticated;

create or replace function public.staff_extend_exam_deadline(p_exam_id uuid, p_user uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  if p_until is null or p_until <= now() then raise exception 'bad_date'; end if;
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
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
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_lvl from public.profiles p where p.id = p_user and p.role = 'student' and not p.level_free;
  if v_lvl is null then raise exception 'not_a_student'; end if;
  if v_lvl <= 1 then raise exception 'already_lowest'; end if;
  perform public.ufuq_move_student_level(p_user, v_lvl, v_lvl - 1, 'failed', 'missed', null, null, null);
end $fn$;
revoke all on function public.staff_demote_missed_student(uuid, uuid) from public, anon;
grant execute on function public.staff_demote_missed_student(uuid, uuid) to authenticated;

create or replace function public.staff_remove_missed_student(p_exam_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_exam_group text; v_elevel smallint; v_group text; v_gname text; v_lvl int;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  select e.group_code, e.level into v_exam_group, v_elevel from public.written_exams e where e.id = p_exam_id;
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
  select coalesce(p.level, 1) into v_lvl from public.profiles p where p.id = p_user and p.role = 'student';
  if v_lvl is null then raise exception 'not_a_student'; end if;

  -- the group the student really sits in: one of this level first, else the exam's own group
  select m.group_code into v_group from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and g.level = v_elevel limit 1;
  v_group := coalesce(v_group, v_exam_group);
  select g.name into v_gname from public.groups g where g.code = v_group;

  delete from public.group_members m using public.groups g
   where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
     and (m.group_code = v_exam_group or (v_elevel is not null and g.level = v_elevel));
  insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, from_group, from_group_name)
  values (p_user, v_lvl, v_lvl, 'failed', 'removed', v_group, v_gname);

  update public.groups g set is_active = false
   where g.level is not null and g.is_active and g.code in (v_group, v_exam_group)
     and not exists (select 1 from public.group_members m where m.group_code = g.code);
end $fn$;
revoke all on function public.staff_remove_missed_student(uuid, uuid) from public, anon;
grant execute on function public.staff_remove_missed_student(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- free accounts are never moved by a result or a join
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
  v_role text;
  v_level int;
  v_free boolean;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
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
    insert into public.join_attempts (user_id) values (auth.uid());
    delete from public.join_attempts where created_at < now() - interval '2 days';
    return;
  end if;

  select p.role::text, coalesce(p.level, 1), coalesce(p.level_free, false) into v_role, v_level, v_free from public.profiles p where p.id = auth.uid();
  if v_role = 'student' and not v_free and v_group.type = 'class' and v_group.level is not null and v_group.level <> v_level then
    raise exception 'LEVEL_MISMATCH';
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

create or replace function public.ufuq_apply_level_result(p_user uuid, p_level integer)
returns void language plpgsql security definer set search_path = public as $fn$
declare r record; v_cur int; v_cut timestamptz; v_new int;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student' and not p.level_free;   -- free accounts stay where they are
  if v_cur is null or v_cur <> p_level then return; end if;

  select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = p_user and t.from_level = p_level and t.reason = 'exam';
  select * into r from public.ufuq_level_result(p_user, p_level, v_cut);
  if r is null or not r.complete then return; end if;

  v_new := case when r.passed then least(p_level + 1, 14) else greatest(p_level - 1, 1) end;
  perform public.ufuq_move_student_level(p_user, p_level, v_new, case when r.passed then 'passed' else 'failed' end, 'exam',
                                         r.total_points, r.midterm_points, r.final_points);
end $fn$;
revoke all on function public.ufuq_apply_level_result(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- manual level change moves the group
create or replace function public.admin_update_student(p_user_id uuid, p_status profile_status default null, p_level integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur int; v_role text; v_free boolean; v_tid uuid;
begin
  if not (public.is_admin() or public.is_teacher()) then
    raise exception 'Faqat o''qituvchilar bu amalni bajara oladi.';
  end if;
  if p_level is not null and (p_level < 1 or p_level > 14) then
    raise exception 'Daraja 1 dan 14 gacha bo''lishi kerak.';
  end if;
  if not public.is_super_admin() and not exists (
    select 1 from public.group_members gm where gm.user_id = p_user_id and public.teaches_group(gm.group_code)
  ) then
    raise exception 'Bu talaba sizning guruhingizga tegishli emas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user_id::text, 0));

  if p_status is not null then
    update public.profiles set status = p_status, updated_at = now() where id = p_user_id;
  end if;

  if p_level is not null then
    select p.level, p.role::text, coalesce(p.level_free, false) into v_cur, v_role, v_free from public.profiles p where p.id = p_user_id;
    if v_role = 'student' and not v_free and v_cur is not null and p_level <> v_cur then
      perform public.ufuq_move_student_level(p_user_id, v_cur, p_level,
                case when p_level > v_cur then 'passed' else 'failed' end, 'manual', null, null, null);
      select t.id into v_tid from public.level_transitions t
       where t.user_id = p_user_id and t.reason = 'manual' order by t.created_at desc limit 1;
      if v_tid is not null then update public.level_transitions set seen_at = now() where id = v_tid; end if;   -- no result window for a teacher's decision
    elsif v_cur is distinct from p_level then
      update public.profiles set level = p_level, updated_at = now() where id = p_user_id;   -- free account / not a student: the number only
    end if;
  end if;
end $$;
revoke all on function public.admin_update_student(uuid, profile_status, integer) from public, anon;
grant execute on function public.admin_update_student(uuid, profile_status, integer) to authenticated;

notify pgrst, 'reload schema';
