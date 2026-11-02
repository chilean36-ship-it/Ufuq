-- Certificates: the 1st and 2nd place of a level, by level total points (midterm + final, max 150).
-- Cohort = students who took the same level final exam. Ties share a place (dense rank): everyone tied on the
-- highest total gets the 1st-place certificate, everyone on the next total gets the 2nd-place one.
-- A certificate is issued only after that final exam's deadline has passed, so places cannot change afterwards.
create or replace function public.my_certificates()
returns table (level integer, place integer, total_points numeric, max_points integer, cohort_size integer,
               exam_id uuid, issued_at timestamptz)
language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct on (e.level) e.level, e.id as exam_id, e.deadline_at
    from public.written_exam_submissions s
    join public.written_exams e on e.id = s.exam_id
    where s.user_id = auth.uid() and s.status = 'graded' and s.total_score is not null
      and e.exam_kind = 'final' and e.level is not null
    order by e.level, coalesce(s.submitted_at, s.started_at) desc
  ), cohort as (
    select m.level, m.exam_id, m.deadline_at, c.user_id, r.total_points
    from mine m
    join (select distinct s.exam_id, s.user_id from public.written_exam_submissions s
          where s.status = 'graded' and s.total_score is not null) c on c.exam_id = m.exam_id
    cross join lateral public.ufuq_level_result(c.user_id, m.level) r
    where r.complete
  ), ranked as (
    select k.*, dense_rank() over (partition by k.level order by k.total_points desc)::int as place,
           count(*) over (partition by k.level)::int as n
    from cohort k
  )
  select rk.level, rk.place, rk.total_points, 150, rk.n, rk.exam_id, coalesce(rk.deadline_at, now())
  from ranked rk
  where rk.user_id = auth.uid() and rk.place <= 2
    and (rk.deadline_at is null or rk.deadline_at < now())
  order by rk.level
$$;
revoke all on function public.my_certificates() from public, anon;
grant execute on function public.my_certificates() to authenticated;
