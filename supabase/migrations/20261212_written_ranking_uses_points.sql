-- group_written_ranking (the Exams ranking of the website cabinet, the exam page and the app) now uses the same carry-over rule as
-- group_points_ranking: the share of the points of the LATEST level where the student took a midterm / final (pop quizzes of that level
-- count once taken); it stays until the next level's first midterm. Same signature as before. Applied 2026-11-20 in the SQL editor.
create or replace function public.group_written_ranking(p_group_code text)
returns table(user_id uuid, name text, avg_pct integer, exams_taken integer, rank integer)
language sql stable security definer set search_path to 'public'
as $$
  select r.user_id, r.name, r.exam_pct, (case when r.exam_max > 0 then 1 else 0 end)::int,
         (rank() over (order by r.exam_pct desc))::int
  from public.group_points_ranking(p_group_code) r
  order by 5, r.name;
$$;
revoke all on function public.group_written_ranking(text) from public;
grant execute on function public.group_written_ranking(text) to authenticated;

-- Follow-up (applied 2026-11-20): the counted level is the newest level with ANY graded paper (pop quizzes included), not only midterm / final:
-- level-9 results are pop2 papers (the old finals), so a student of a level-10 group shows the level-9 result until his first level-10 paper.
-- In group_points_ranking the CTE  lv  reads:  select user_id, max(level) as lvl from b group by user_id
