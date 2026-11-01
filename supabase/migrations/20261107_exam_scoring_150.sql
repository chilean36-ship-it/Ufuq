-- Stage 2 (APPLIED to live via MCP): per level Midterm (max 50) + Final (max 100) = 150; pass mark 75 (50%).
-- Per-question scores and submissions.total_score stay a 0..100 percentage; points are derived by scaling to the exam's max.
-- Keep numbers in sync with src/lib/scoring.js.

alter table public.written_exams drop constraint if exists written_exams_kind_check;
alter table public.written_exams add constraint written_exams_kind_check check (exam_kind is null or exam_kind in ('midterm','final'));

create or replace function public.ufuq_pass_mark() returns int language sql immutable set search_path = public as $$ select 75 $$;

create or replace function public.ufuq_exam_max(p_kind text) returns int language sql immutable set search_path = public as $$
  select case p_kind when 'midterm' then 50 else 100 end
$$;

create or replace function public.ufuq_exam_points(p_total numeric, p_kind text) returns numeric language sql immutable set search_path = public as $$
  select case when p_total is null then null
              else round(least(greatest(p_total, 0), 100) * public.ufuq_exam_max(p_kind) / 100.0, 1) end
$$;

-- Internal: result of one student at one level (latest graded midterm + latest graded final). Not callable from the browser.
create or replace function public.ufuq_level_result(p_user uuid, p_level int)
returns table (level int, midterm_points numeric, final_points numeric, total_points numeric, max_points int, pass_mark int,
               midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path = public as $$
  with s as (
    select e.exam_kind as kind, public.ufuq_exam_points(sub.total_score, e.exam_kind) as pts,
           row_number() over (partition by e.exam_kind order by coalesce(sub.submitted_at, sub.started_at) desc) as rn
    from public.written_exam_submissions sub
    join public.written_exams e on e.id = sub.exam_id
    where sub.user_id = p_user and sub.status = 'graded' and sub.total_score is not null
      and e.level = p_level and e.exam_kind in ('midterm', 'final')
  ), r as (
    select (select pts from s where kind = 'midterm' and rn = 1) as m,
           (select pts from s where kind = 'final' and rn = 1) as f
  )
  select p_level, r.m, r.f, coalesce(r.m, 0) + coalesce(r.f, 0), 150, public.ufuq_pass_mark(),
         r.m is not null, r.f is not null, (r.m is not null and r.f is not null),
         (r.m is not null and r.f is not null and coalesce(r.m, 0) + coalesce(r.f, 0) >= public.ufuq_pass_mark())
  from r
$$;
revoke all on function public.ufuq_level_result(uuid, int) from public, anon, authenticated;

-- Student: my own result for every level where I have a graded midterm or final.
create or replace function public.my_level_results()
returns table (level int, midterm_points numeric, final_points numeric, total_points numeric, max_points int, pass_mark int,
               midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path = public as $$
  select x.* from (
    select distinct e.level::int as lv
    from public.written_exam_submissions sub join public.written_exams e on e.id = sub.exam_id
    where sub.user_id = auth.uid() and sub.status = 'graded' and e.level is not null and e.exam_kind in ('midterm', 'final')
  ) l, lateral public.ufuq_level_result(auth.uid(), l.lv) x
  where auth.uid() is not null
  order by x.level
$$;
revoke all on function public.my_level_results() from public, anon;
grant execute on function public.my_level_results() to authenticated;

notify pgrst, 'reload schema';
