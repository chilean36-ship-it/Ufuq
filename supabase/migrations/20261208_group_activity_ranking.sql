-- Class ranking tabs in the Ufuq app Home (Overall / Attendance / Tasks / Exams).
-- Students can only read their own attendance and task rows (RLS), so the group-wide numbers come from this read-only
-- SECURITY DEFINER function. Same access rule as group_written_ranking: staff, or a member of that very group.
-- It returns counts only (no files, no grades, no feedback): this month's attendance share and the number of submitted tasks.
-- Idempotent. NOT applied to the live project until someone runs it in the SQL editor (see DEPLOY.md).

create or replace function public.group_activity_ranking(p_group_code text)
returns table(user_id uuid, name text, att_pct integer, att_marked integer, tasks_done integer, tasks_total integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with allowed as (
    select 1 where public.ufuq_is_staff()
      or exists (select 1 from public.group_members gm where gm.group_code = p_group_code and gm.user_id = auth.uid())
  ), mem as (
    select gm.user_id, gm.name from public.group_members gm
    where gm.group_code = p_group_code and exists (select 1 from allowed)
  ), ses as (
    select s.id from public.attendance_sessions s
    where s.group_code = p_group_code and s.session_date >= date_trunc('month', current_date)::date
  ), att as (
    select r.user_id,
           count(*) filter (where r.present) as present,
           count(*) as marked
    from public.attendance_records r
    where r.session_id in (select id from ses)
    group by r.user_id
  ), tk as (
    select t.id from public.tasks t where t.group_code = p_group_code
  ), sub as (
    select s.user_id, count(distinct s.task_id) as n
    from public.task_submissions s
    where s.task_id in (select id from tk)
    group by s.user_id
  )
  select m.user_id,
         m.name,
         case when coalesce(a.marked, 0) = 0 then 100 else round(100.0 * a.present / a.marked)::int end,
         coalesce(a.marked, 0)::int,
         coalesce(sb.n, 0)::int,
         (select count(*) from tk)::int
  from mem m
  left join att a on a.user_id = m.user_id
  left join sub sb on sb.user_id = m.user_id
  order by m.name;
$$;

revoke all on function public.group_activity_ranking(text) from public;
grant execute on function public.group_activity_ranking(text) to authenticated;
