-- Exam opening time + exam day replaces the lesson. Safe to run more than once.
--
-- 1) written_exams.open_at: the moment students may START the exam. NULL = open as soon as it is published (old behaviour).
--    A published exam with a future open_at is VISIBLE to students (with a countdown) but start_written_exam refuses it
--    with EXAM_NOT_OPEN_YET until open_at. Papers already started are never affected. Staff / admins are not blocked.
-- 2) exam_days(): the Tashkent calendar days on which a published exam of a group opens. The apps hide the weekly lesson
--    of that group on those days (the exam takes the lesson's place): schedule, next lesson, attendance, teacher calendar.
-- Depends on: written_exams, my_level_exams (20261201d), start_written_exam (20261115), ufuq_is_staff() (20261011_hifz).

alter table public.written_exams add column if not exists open_at timestamptz;

-- ---------------------------------------------------------------- start: not before open_at
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
  select e.id, e.group_code, e.is_published, e.level, e.exam_kind, e.deadline_at, e.open_at into v_exam from public.written_exams e where e.id = p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  if found then return next v_sub; return; end if;
  if not v_exam.is_published then raise exception 'EXAM_NOT_PUBLISHED'; end if;
  if v_exam.open_at is not null and now() < v_exam.open_at and coalesce(v_role, '') = 'student' then
    raise exception 'EXAM_NOT_OPEN_YET';
  end if;
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

-- ---------------------------------------------------------------- the student's level-exam list now carries open_at
drop function if exists public.my_level_exams();
create function public.my_level_exams()
returns table(id uuid, group_code text, title text, level smallint, exam_kind text, duration_minutes integer,
              deadline_at timestamptz, created_at timestamptz, is_published boolean, open_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select x.id, x.group_code, x.title, x.level, x.exam_kind, x.duration_minutes, x.deadline_at, x.created_at, x.is_published, x.open_at
    from (
      select e.*, row_number() over (
               partition by e.level, e.exam_kind
               order by exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id) desc,
                        exists (select 1 from public.written_exam_extensions xx where xx.exam_id = e.id and xx.user_id = p.id and xx.until_at > now()) desc,
                        e.is_published desc,
                        exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p.id) desc,
                        exists (select 1 from public.group_members m
                                  join public.groups g1 on g1.code = m.group_code and g1.type = 'class' and g1.letter is not null
                                  join public.groups g2 on g2.code = e.group_code and g2.letter = g1.letter
                                 where m.user_id = p.id) desc,
                        e.created_at asc) as rn
        from public.written_exams e join public.profiles p on p.id = auth.uid()
       where auth.uid() is not null and p.role = 'student' and not p.level_free
         and e.exam_kind is not null and e.level is not null and e.level = coalesce(p.level, 1)
         and (exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                       where gm.user_id = p.id and g.type = 'class' and g.level = e.level)
              or exists (select 1 from public.written_exam_extensions xx where xx.exam_id = e.id and xx.user_id = p.id and xx.until_at > now()))
    ) x
   where x.rn = 1
   order by x.exam_kind desc, x.created_at desc;
$fn$;
revoke all on function public.my_level_exams() from public, anon;
grant execute on function public.my_level_exams() to authenticated;

-- ---------------------------------------------------------------- exam days (the exam takes the lesson's place)
-- [(group_code, day)] : the Tashkent date on which a PUBLISHED exam of the group opens (open_at). Staff see every group,
-- everybody else only the groups they belong to. Dates only: no titles, no questions.
create or replace function public.exam_days(p_groups text[] default null)
returns table(group_code text, day date)
language sql stable security definer set search_path to 'public' as $fn$
  select distinct e.group_code, (e.open_at at time zone 'Asia/Tashkent')::date
    from public.written_exams e
   where auth.uid() is not null
     and e.is_published and e.open_at is not null
     and (p_groups is null or e.group_code = any (p_groups))
     and (public.ufuq_is_staff()
          or exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = auth.uid()))
$fn$;
revoke all on function public.exam_days(text[]) from public, anon;
grant execute on function public.exam_days(text[]) to authenticated;

notify pgrst, 'reload schema';
