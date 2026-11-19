-- Class ranking (public.group_written_ranking): score every member by HIS OWN most recent graded exam.
-- Before, the function picked ONE exam for the whole group (the exam of the newest submission by anyone) and gave everybody who
-- had not sat that very exam 0. One test attempt of a different exam therefore zeroed the whole class.
-- Same signature, same access rule (staff, or a member of that very group). Idempotent. NOT applied until run in the SQL editor.

create or replace function public.group_written_ranking(p_group_code text)
returns table(user_id uuid, name text, avg_pct integer, exams_taken integer, rank integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with allowed as (
    select 1 where public.ufuq_is_staff() or exists (select 1 from public.group_members gm where gm.group_code = p_group_code and gm.user_id = auth.uid())
  ), grp as (
    select g.code, g.letter from public.groups g where g.code = p_group_code
  ), ex as (
    select e.id from public.written_exams e where e.group_code = p_group_code
    union
    select e.id from public.written_exams e join public.groups g2 on g2.code = e.group_code
      where g2.type = 'class' and g2.letter is not null and g2.letter = (select letter from grp)
  ), mem as (
    select gm.user_id, gm.name from public.group_members gm where gm.group_code = p_group_code and exists (select 1 from allowed)
  ), sub as (
    select s.user_id, s.exam_id, s.total_score, coalesce(s.submitted_at, s.started_at) as at
    from public.written_exam_submissions s
    where s.exam_id in (select id from ex) and s.status = 'graded' and s.total_score is not null and s.user_id in (select user_id from mem)
  ), last_per as (
    select distinct on (s.user_id) s.user_id, s.exam_id from sub s order by s.user_id, s.at desc
  ), agg as (
    select m.user_id, m.name,
           coalesce(max(s.total_score) filter (where s.exam_id = l.exam_id), 0) as pct,
           count(distinct s.exam_id)::int as taken
    from mem m
    left join last_per l on l.user_id = m.user_id
    left join sub s on s.user_id = m.user_id
    group by m.user_id, m.name, l.exam_id
  )
  select a.user_id, a.name, round(a.pct)::int, a.taken, (rank() over (order by a.pct desc))::int
  from agg a order by 5, a.name;
$$;

revoke all on function public.group_written_ranking(text) from public;
grant execute on function public.group_written_ranking(text) to authenticated;
