-- 1) Materials follow the student up the levels: audio lessons and board photos of every lower (and the current) level group of the
--    same letter stay visible. Level N+1 materials are not visible before the student reaches level N+1.
create or replace function public.ufuq_series_codes_for(p_code text)
returns setof text language sql stable security definer set search_path = public as $$
  select g2.code from public.groups g
  join public.groups g2 on g2.type = 'class' and g.type = 'class' and g2.letter is not null and g2.letter = g.letter and g2.level <= g.level
  where g.code = p_code
    and (exists (select 1 from public.group_members m where m.group_code = p_code and m.user_id = auth.uid()) or public.teaches_group(p_code))
  union
  select p_code where exists (select 1 from public.group_members m where m.group_code = p_code and m.user_id = auth.uid()) or public.teaches_group(p_code)
$$;
revoke all on function public.ufuq_series_codes_for(text) from public, anon;
grant execute on function public.ufuq_series_codes_for(text) to authenticated;

create or replace function public.ufuq_my_series_codes()
returns setof text language sql stable security definer set search_path = public as $$
  select g2.code from public.group_members m
  join public.groups g on g.code = m.group_code and g.type = 'class' and g.letter is not null
  join public.groups g2 on g2.type = 'class' and g2.letter = g.letter and g2.level <= g.level
  where m.user_id = auth.uid()
$$;
revoke all on function public.ufuq_my_series_codes() from public, anon;
grant execute on function public.ufuq_my_series_codes() to authenticated;

drop policy if exists audio_lessons_select_group on public.audio_lessons;
create policy audio_lessons_select_group on public.audio_lessons for select to authenticated
  using ((group_code is null) or (group_code in (select public.my_group_codes())) or public.teaches_group(group_code)
         or (group_code in (select public.ufuq_my_series_codes())));

drop policy if exists board_photos_select_combined on public.board_photos;
create policy board_photos_select_combined on public.board_photos for select to authenticated
  using (public.teaches_group(group_code) or (group_code is null) or (group_code in (select public.my_group_codes()))
         or (group_code in (select public.ufuq_my_series_codes())));

-- 2) Certificates: every real student counts, also an ordinary admin or a free account that studies (the main admin and teachers do not).
create or replace function public.my_certificates()
returns table (level integer, place integer, total_points numeric, max_points integer, cohort_size integer,
               exam_id uuid, issued_at timestamptz, seen boolean)
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
    join public.profiles pr on pr.id = c.user_id and pr.role <> 'teacher' and not (pr.role = 'admin' and coalesce(pr.admin_tier, 'super') = 'super')
    cross join lateral public.ufuq_level_result(c.user_id, m.level) r
  ), ranked as (
    select k.*, dense_rank() over (partition by k.level order by k.total_points desc)::int as place,
           count(*) over (partition by k.level)::int as n
    from cohort k
  )
  select rk.level::int, rk.place, rk.total_points, 150, rk.n, rk.exam_id, rk.deadline_at,
         exists (select 1 from public.certificate_seen cs where cs.user_id = auth.uid() and cs.exam_id = rk.exam_id)
  from ranked rk
  where rk.user_id = auth.uid() and rk.place <= 2 and rk.deadline_at is not null and rk.deadline_at < now()
  order by rk.level
$$;
