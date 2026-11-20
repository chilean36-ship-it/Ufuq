-- Round 8 rules (2026-11-20). Idempotent. NOT applied to the live project until someone runs it in the SQL editor (see DEPLOY.md).
--  1. Tasks: nothing can be uploaded after the teacher's deadline (the whole due day counts, Tashkent time).
--  2. Exams: every exam gets the standard 120-minute limit (a teacher can still edit it by hand); new exams default to 120.
--  3. Group letters: A-Z instead of A-G (constraint + every function that checks the letter).
--  4. Class ranking: Exams tab = share of the points of the LATEST level in which the student has taken a midterm / final (carries over
--     until the next level's midterm); pop quizzes of that level count once taken; Overall = those exam points + task points of that level.

begin;

-- 1. tasks closed after the deadline --------------------------------------------------------------------------------------
create or replace function public.ufuq_task_submission_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_due date;
begin
  if auth.uid() is null or public.ufuq_is_staff() then return new; end if;         -- SQL editor / service role / teachers and admins
  if tg_op = 'UPDATE' and new.graded_at is not null and old.graded_at is not null then return new; end if;
  select t.due_date into v_due from public.tasks t where t.id = new.task_id;
  if v_due is not null and (now() at time zone 'Asia/Tashkent') >= (v_due + 1)::timestamp then
    raise exception 'TASK_CLOSED' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists ufuq_task_submission_guard on public.task_submissions;
create trigger ufuq_task_submission_guard before insert or update on public.task_submissions
  for each row execute function public.ufuq_task_submission_guard();

-- 2. standard exam time limit --------------------------------------------------------------------------------------------
update public.written_exams set duration_minutes = 120 where duration_minutes is distinct from 120;
alter table public.written_exams alter column duration_minutes set default 120;

-- 3. group letters A-Z ---------------------------------------------------------------------------------------------------
alter table public.groups drop constraint if exists groups_letter_check;
alter table public.groups add constraint groups_letter_check check (letter is null or letter ~ '^[A-Z]$');
do $do$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.prosrc like '%[A-G]%' or p.prosrc like '%[A-Ga-g]%')
  loop
    def := pg_get_functiondef(r.oid);
    def := replace(replace(def, '[A-Ga-g]', '[A-Za-z]'), '[A-G]', '[A-Z]');
    execute def;
  end loop;
end $do$;

-- 4. ranking ---------------------------------------------------------------------------------------------------------------
create or replace function public.group_points_ranking(p_group_code text)
returns table(user_id uuid, name text, exam_points numeric, exam_max numeric, exam_pct integer, task_points numeric, att_pct integer, att_marked integer)
language sql stable security definer set search_path to 'public'
as $$
  with allowed as (
    select 1 where public.ufuq_is_staff()
      or exists (select 1 from public.group_members gm where gm.group_code = p_group_code and gm.user_id = auth.uid())
  ), g as (
    select level from public.groups where code = p_group_code
  ), mem as (
    select gm.user_id, gm.name from public.group_members gm
    where gm.group_code = p_group_code and exists (select 1 from allowed)
  ), s as (   -- latest graded paper of every kind on every level (the student's papers from earlier groups count too)
    select sub.user_id, e.level, e.exam_kind as kind, public.ufuq_exam_points(sub.total_score, e.exam_kind) as pts,
           row_number() over (partition by sub.user_id, e.level, e.exam_kind order by coalesce(sub.submitted_at, sub.started_at) desc) as rn
    from public.written_exam_submissions sub
    join public.written_exams e on e.id = sub.exam_id
    where sub.user_id in (select user_id from mem) and sub.status = 'graded' and sub.total_score is not null
      and e.level is not null and e.level <= coalesce((select level from g), 99) and e.exam_kind in ('midterm', 'final', 'pop1', 'pop2')
  ), b as (
    select user_id, level, kind, pts from s where rn = 1
  ), lv as (  -- the level that counts: the newest one where a midterm or final has been taken (until the next midterm it stays)
    select user_id, max(level) as lvl from b where kind in ('midterm', 'final') group by user_id
  ), ex as (
    select m.user_id,
           coalesce((select sum(b.pts) from b where b.user_id = m.user_id and b.level = lv.lvl), 0) as pts,
           coalesce((select sum(public.ufuq_exam_max(b.kind)) from b where b.user_id = m.user_id and b.level = lv.lvl), 0) as mx,
           coalesce(lv.lvl, (select level from g)) as eff_level
    from mem m left join lv on lv.user_id = m.user_id
  ), ses as (
    select s2.id from public.attendance_sessions s2
    where s2.group_code = p_group_code and s2.session_date >= date_trunc('month', current_date)::date
  ), att as (
    select r.user_id, count(*) filter (where r.present) as present, count(*) as marked
    from public.attendance_records r
    where r.session_id in (select id from ses)
    group by r.user_id
  ), tp as (   -- task points on the counted level (grades like "5", "85", "4,5 / 5" -> the leading number)
    select ex.user_id,
           sum(replace(substring(ts.grade from '^\s*([0-9]+(?:[.,][0-9]+)?)'), ',', '.')::numeric) as pts
    from ex
    join public.task_submissions ts on ts.user_id = ex.user_id and ts.graded_at is not null and ts.grade is not null
    join public.tasks t on t.id = ts.task_id
    join public.groups gg on gg.code = t.group_code and gg.level = ex.eff_level
    group by ex.user_id
  )
  select m.user_id, m.name, ex.pts, ex.mx::numeric,
         case when ex.mx > 0 then round(100.0 * ex.pts / ex.mx)::int else 0 end,
         coalesce(tp.pts, 0)::numeric,
         case when coalesce(a.marked, 0) = 0 then 100 else round(100.0 * a.present / a.marked)::int end,
         coalesce(a.marked, 0)::int
  from mem m join ex on ex.user_id = m.user_id
  left join att a on a.user_id = m.user_id
  left join tp on tp.user_id = m.user_id
  order by m.name;
$$;
revoke all on function public.group_points_ranking(text) from public;
grant execute on function public.group_points_ranking(text) to authenticated;

commit;
