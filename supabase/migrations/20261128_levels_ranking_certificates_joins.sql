-- 1) Every lettered class group has all 14 level groups from the start (inactive). A level group is switched on when the first
--    student reaches the level (ufuq_group_for_letter_level) or by hand in Admin → Groups. Idempotent.
do $$
declare v record; n int;
begin
  for v in select * from (values ('A', '24861'), ('B', '57392'), ('C', '68210'), ('D', '91847'), ('E', '30658')) t(letter, tpl) loop
    continue when not exists (select 1 from public.groups g where g.code = v.tpl);
    for n in 1..14 loop
      perform public.ufuq_group_for_letter_level(v.letter, n, v.tpl, false);
    end loop;
  end loop;
end $$;

-- 2) Class ranking = percentage of the LAST graded exam of the group (a lettered group also counts the exams stored under
--    the other level groups of its letter, e.g. the Level 7 final that is saved under Group A8). Midterm 50 / final 100 are both
--    stored as a 0-100 percentage, so the percentage is simply the paper's score. A member who did not take that exam is last.
create or replace function public.group_written_ranking(p_group_code text)
returns table (user_id uuid, name text, avg_pct int, exams_taken int, rank int)
language sql stable security definer set search_path = public as $$
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
  ), last_exam as (
    select exam_id from sub order by at desc limit 1
  ), agg as (
    select m.user_id, m.name,
           coalesce(max(s.total_score) filter (where s.exam_id = (select exam_id from last_exam)), 0) as pct,
           (count(*) filter (where s.exam_id = (select exam_id from last_exam)))::int as taken
    from mem m left join sub s on s.user_id = m.user_id
    group by m.user_id, m.name
  )
  select a.user_id, a.name, round(a.pct)::int, a.taken, (rank() over (order by a.pct desc))::int
  from agg a order by 5, a.name;
$$;

-- 3) Certificates: the two best level totals (midterm + final; a missing midterm counts 0) of everyone who took the same level
--    final, students only (no staff, no free test accounts). Ties share a place. Issued once the final's deadline has passed.
create table if not exists public.certificate_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, exam_id)
);
alter table public.certificate_seen enable row level security;
revoke all on public.certificate_seen from anon, authenticated;

drop function if exists public.my_certificates();
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
    join public.profiles pr on pr.id = c.user_id and pr.role = 'student' and not coalesce(pr.level_free, false)
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
revoke all on function public.my_certificates() from public, anon;
grant execute on function public.my_certificates() to authenticated;

-- The winner is told once ("you took 1st place"): the app calls this after showing the window.
create or replace function public.ack_certificates()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.certificate_seen (user_id, exam_id)
  select auth.uid(), c.exam_id from public.my_certificates() c on conflict do nothing;
end $$;
revoke all on function public.ack_certificates() from public, anon;
grant execute on function public.ack_certificates() to authenticated;

-- 4) One Arabic class group per account. A Quran (individual) group may be joined besides it. Free test accounts are exempt.
create or replace function public.join_group(p_code text)
returns table (group_code text, group_name text, group_schedule text, group_zoom_link text, group_schedule_days jsonb)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_group public.groups%rowtype; v_user_name text; v_group_code text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_fails int; v_role text; v_level int; v_free boolean;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.user_has_access(auth.uid()) then raise exception 'PAYMENT_REQUIRED'; end if;

  select count(*) into v_fails from public.join_attempts where user_id = auth.uid() and created_at > now() - interval '15 minutes';
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

  -- only one Arabic (class) group at a time; joining the group you are already in is harmless
  if v_role = 'student' and not v_free and v_group.type = 'class'
     and exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                  where gm.user_id = auth.uid() and g.type = 'class' and g.is_active and gm.group_code <> v_group.code) then
    raise exception 'ALREADY_IN_GROUP';
  end if;

  if v_role = 'student' and not v_free and v_group.type = 'class' and v_group.level is not null and v_group.level <> v_level then
    if exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                where gm.user_id = auth.uid() and g.type = 'class' and g.level is not null and gm.group_code <> v_group.code) then
      raise exception 'LEVEL_MISMATCH';
    end if;
    update public.profiles p set level = v_group.level, updated_at = now() where p.id = auth.uid();
  end if;

  select coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Student')
    into v_user_name from auth.users u where u.id = auth.uid();

  insert into public.group_members (user_id, group_code, name, joined_at)
  values (auth.uid(), v_group.code, coalesce(v_user_name, 'Student'), now())
  on conflict (user_id, group_code) do nothing;

  update public.profiles p set status = 'active', updated_at = now() where p.id = auth.uid();

  return query select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end $$;
