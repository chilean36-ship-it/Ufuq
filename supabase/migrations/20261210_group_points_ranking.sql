-- Class ranking by POINTS (Ufuq app, Home > Class ranking).
--   Overall  = exam points collected on the group's level + task points (points, not a percentage)
--   Exams    = percentage of the points of ALL exams of this level (the latest graded paper of each kind: pop1 25, pop2 50, midterm 25, final 50;
--              the pop quizzes count only when they were open to the student: a graded paper or a published pop exam in this group)
--   Tasks    = task points: the number the teacher typed as the grade ("5", "85", "4,5 / 5" -> the leading number), summed over graded tasks
--   Attendance = this month's attendance percentage (as before)
-- Read-only SECURITY DEFINER function, same access rule as group_written_ranking (staff, or a member of that very group).
-- Idempotent. NOT applied to the live project until someone runs it in the SQL editor (see DEPLOY.md).

create or replace function public.group_points_ranking(p_group_code text)
returns table(user_id uuid, name text, exam_points numeric, exam_max numeric, exam_pct integer, task_points numeric, att_pct integer, att_marked integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with allowed as (
    select 1 where public.ufuq_is_staff()
      or exists (select 1 from public.group_members gm where gm.group_code = p_group_code and gm.user_id = auth.uid())
  ), g as (
    select level from public.groups where code = p_group_code
  ), mem as (
    select gm.user_id, gm.name from public.group_members gm
    where gm.group_code = p_group_code and exists (select 1 from allowed)
  ), s as (
    select sub.user_id, e.exam_kind as kind, public.ufuq_exam_points(sub.total_score, e.exam_kind) as pts,
           row_number() over (partition by sub.user_id, e.exam_kind order by coalesce(sub.submitted_at, sub.started_at) desc) as rn
    from public.written_exam_submissions sub
    join public.written_exams e on e.id = sub.exam_id
    where sub.user_id in (select user_id from mem) and sub.status = 'graded' and sub.total_score is not null
      and e.level = (select level from g) and e.exam_kind in ('midterm', 'final', 'pop1', 'pop2')
  ), b as (
    select user_id, kind, pts from s where rn = 1
  ), pubpop as (
    select e.exam_kind as kind from public.written_exams e
    where e.group_code = p_group_code and e.level = (select level from g) and e.is_published and e.exam_kind in ('pop1', 'pop2')
  ), ex as (
    select m.user_id,
           coalesce((select sum(b.pts) from b where b.user_id = m.user_id), 0) as pts,
           75
             + case when exists (select 1 from b where b.user_id = m.user_id and b.kind = 'pop1') or exists (select 1 from pubpop where kind = 'pop1') then 25 else 0 end
             + case when exists (select 1 from b where b.user_id = m.user_id and b.kind = 'pop2') or exists (select 1 from pubpop where kind = 'pop2') then 50 else 0 end as mx
    from mem m
  ), ses as (
    select s2.id from public.attendance_sessions s2
    where s2.group_code = p_group_code and s2.session_date >= date_trunc('month', current_date)::date
  ), att as (
    select r.user_id, count(*) filter (where r.present) as present, count(*) as marked
    from public.attendance_records r
    where r.session_id in (select id from ses)
    group by r.user_id
  ), tk as (
    select t.id from public.tasks t where t.group_code = p_group_code
  ), tp as (
    select ts.user_id,
           sum(replace(substring(ts.grade from '^\s*([0-9]+(?:[.,][0-9]+)?)'), ',', '.')::numeric) as pts
    from public.task_submissions ts
    where ts.task_id in (select id from tk) and ts.graded_at is not null and ts.grade is not null
    group by ts.user_id
  )
  select m.user_id,
         m.name,
         ex.pts,
         ex.mx::numeric,
         case when ex.mx > 0 then round(100.0 * ex.pts / ex.mx)::int else 0 end,
         coalesce(tp.pts, 0)::numeric,
         case when coalesce(a.marked, 0) = 0 then 100 else round(100.0 * a.present / a.marked)::int end,
         coalesce(a.marked, 0)::int
  from mem m
  join ex on ex.user_id = m.user_id
  left join att a on a.user_id = m.user_id
  left join tp on tp.user_id = m.user_id
  order by m.name;
$$;

revoke all on function public.group_points_ranking(text) from public;
grant execute on function public.group_points_ranking(text) to authenticated;
