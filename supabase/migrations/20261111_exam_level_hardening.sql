-- STAGE 4 + audit fixes (APPLIED to live via MCP as "exam_level_hardening"). Safe to run more than once.
-- 1) join_group(): a student joins only a group of THEIR level (staff / legacy no-level groups exempt)
-- 2) start_written_exam / can_take_written_exam: a student takes only midterm/final exams of THEIR level
-- 3) Promotion only counts results handed in AFTER the student last left this level (no stale results after a demotion)
-- 4) Promotion is serialised per student (no double move when midterm and final are graded together) + notifies the student
-- 5) Exam level / kind / group cannot change once someone has a submission (results would change retroactively)
-- 6) total_score must be 0..100

-- ---------------------------------------------------------------- 1) join code + level
create or replace function public.join_group(p_code text)
returns table(group_code text, group_name text, group_schedule text, group_zoom_link text, group_schedule_days jsonb)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  v_group public.groups%rowtype;
  v_user_name text;
  v_group_code text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_fails int;
  v_role text;
  v_level int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.user_has_access(auth.uid()) then raise exception 'PAYMENT_REQUIRED'; end if;

  select count(*) into v_fails from public.join_attempts
   where user_id = auth.uid() and created_at > now() - interval '15 minutes';
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

  -- level check: a student joins only the group of their own level
  select p.role::text, coalesce(p.level, 1) into v_role, v_level from public.profiles p where p.id = auth.uid();
  if v_role = 'student' and v_group.type = 'class' and v_group.level is not null and v_group.level <> v_level then
    raise exception 'LEVEL_MISMATCH';
  end if;

  select coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Student')
    into v_user_name from auth.users u where u.id = auth.uid();

  insert into public.group_members (user_id, group_code, name, joined_at)
  values (auth.uid(), v_group.code, coalesce(v_user_name, 'Student'), now())
  on conflict (user_id, group_code) do nothing;

  update public.profiles p set status = 'active', updated_at = now() where p.id = auth.uid();

  return query select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end $$;
revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- ---------------------------------------------------------------- 2) exam level gate
create or replace function public.start_written_exam(p_exam_id uuid)
returns setof public.written_exam_submissions
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_sub public.written_exam_submissions;
  v_role text;
  v_lvl int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select role::text, coalesce(level, 1) into v_role, v_lvl from public.profiles where id = v_uid;
  select e.id, e.group_code, e.is_published, e.level, e.exam_kind into v_exam from public.written_exams e where e.id = p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  if found then return next v_sub; return; end if;
  if not v_exam.is_published then raise exception 'EXAM_NOT_PUBLISHED'; end if;
  if not public.user_has_access(v_uid) then raise exception 'PAYMENT_REQUIRED'; end if;
  if coalesce(v_role, '') <> 'admin'
     and not exists (select 1 from public.group_members gm where gm.user_id = v_uid and gm.group_code = v_exam.group_code) then
    raise exception 'NOT_IN_GROUP';
  end if;
  -- level exams (midterm / final) are for the student's own level only
  if v_role = 'student' and v_exam.exam_kind is not null and v_exam.level is not null and v_exam.level <> v_lvl then
    raise exception 'LEVEL_MISMATCH';
  end if;
  insert into public.written_exam_submissions (exam_id, user_id, status) values (p_exam_id, v_uid, 'draft')
    on conflict (exam_id, user_id) do nothing;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  return next v_sub;
end $$;

create or replace function public.can_take_written_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.written_exams e
    where e.id = p_exam_id and e.is_published
      and public.user_has_access(auth.uid())
      and (
        e.group_code in (select public.my_group_codes())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
      and not exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'student'
          and e.exam_kind is not null and e.level is not null and e.level <> coalesce(p.level, 1)
      )
  );
$$;

-- ---------------------------------------------------------------- 3) results since the student last left this level
create or replace function public.ufuq_level_result(p_user uuid, p_level integer, p_since timestamptz)
returns table(level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points integer, pass_mark integer,
              midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path to 'public' as $$
  with s as (
    select e.exam_kind as kind, public.ufuq_exam_points(sub.total_score, e.exam_kind) as pts,
           row_number() over (partition by e.exam_kind order by coalesce(sub.submitted_at, sub.started_at) desc) as rn
    from public.written_exam_submissions sub
    join public.written_exams e on e.id = sub.exam_id
    where sub.user_id = p_user and sub.status = 'graded' and sub.total_score is not null
      and e.level = p_level and e.exam_kind in ('midterm', 'final')
      and (p_since is null or coalesce(sub.submitted_at, sub.started_at) > p_since)
  ), r as (
    select (select pts from s where kind = 'midterm' and rn = 1) as m,
           (select pts from s where kind = 'final' and rn = 1) as f
  )
  select p_level, r.m, r.f, coalesce(r.m, 0) + coalesce(r.f, 0), 150, public.ufuq_pass_mark(),
         r.m is not null, r.f is not null, (r.m is not null and r.f is not null),
         (r.m is not null and r.f is not null and coalesce(r.m, 0) + coalesce(r.f, 0) >= public.ufuq_pass_mark())
  from r
$$;
revoke all on function public.ufuq_level_result(uuid, integer, timestamptz) from public, anon, authenticated;

-- the 2-argument version (history screen) keeps showing every result
create or replace function public.ufuq_level_result(p_user uuid, p_level integer)
returns table(level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points integer, pass_mark integer,
              midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path to 'public' as $$
  select * from public.ufuq_level_result(p_user, p_level, null::timestamptz)
$$;
revoke all on function public.ufuq_level_result(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4) apply a finished level (serialised, notifies)
create or replace function public.ufuq_apply_level_result(p_user uuid, p_level int)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; v_cur int; v_cut timestamptz; v_new int; v_target text; v_from text; v_name text; v_gname text; v_body text;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));   -- midterm + final graded together: one at a time

  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student';
  if v_cur is null or v_cur <> p_level then return; end if;          -- staff, or an old level: nothing to move

  -- only papers handed in after the last time this level was applied count (a demoted student starts the level afresh)
  select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = p_user and t.from_level = p_level;

  select * into r from public.ufuq_level_result(p_user, p_level, v_cut);
  if r is null or not r.complete then return; end if;

  v_new := case when r.passed then least(p_level + 1, 14) else greatest(p_level - 1, 1) end;
  v_target := public.ufuq_pick_level_group(p_level, r.passed);

  select string_agg(m.group_code, ',') into v_from
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and (g.level is null or g.level = p_level);

  if v_target is not null then
    select coalesce(p.full_name, 'Student') into v_name from public.profiles p where p.id = p_user;
    delete from public.group_members m using public.groups g
     where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
       and (g.level is null or g.level = p_level) and m.group_code <> v_target;
    insert into public.group_members (user_id, group_code, name, joined_at)
    values (p_user, v_target, v_name, now()) on conflict (user_id, group_code) do nothing;
    select g.name into v_gname from public.groups g where g.code = v_target;
  end if;

  if v_new <> p_level then
    update public.profiles set level = v_new, updated_at = now() where id = p_user;
  end if;

  insert into public.level_transitions (user_id, from_level, to_level, outcome, total_points, from_group, to_group)
  values (p_user, p_level, v_new, case when r.passed then 'passed' else 'failed' end, r.total_points, v_from, v_target);

  -- tell the student (never blocks the move)
  begin
    v_body := case
      when r.passed and v_new > p_level then 'Tabriklaymiz! ' || r.total_points || '/150 ball. Siz Level-' || v_new || ' ga o''tdingiz.'
      when r.passed then 'Tabriklaymiz! ' || r.total_points || '/150 ball. Siz eng yuqori darajani yakunladingiz.'
      when v_new < p_level then r.total_points || '/150 ball (o''tish bali 75). Siz Level-' || v_new || ' ga tushirildingiz.'
      else r.total_points || '/150 ball (o''tish bali 75). Siz Level-' || p_level || ' da qolasiz, qayta urinib ko''ring.'
    end;
    if v_gname is not null then v_body := v_body || ' Guruhingiz: ' || v_gname || '.'; end if;
    insert into public.notifications (user_id, kind, title, body)
    values (p_user, 'group', case when r.passed then 'Level natijasi: o''tdingiz' else 'Level natijasi: o''ta olmadingiz' end, v_body);
  exception when others then
    raise warning 'level notification failed for %: %', p_user, sqlerrm;
  end;
end $$;
revoke all on function public.ufuq_apply_level_result(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5) exam identity is frozen once someone has a paper
create or replace function public.guard_exam_immutable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                 -- SQL editor / service role may still fix data
  if (new.level is distinct from old.level or new.exam_kind is distinct from old.exam_kind or new.group_code is distinct from old.group_code)
     and exists (select 1 from public.written_exam_submissions s where s.exam_id = old.id) then
    raise exception 'EXAM_LOCKED_HAS_SUBMISSIONS';
  end if;
  return new;
end $$;
revoke all on function public.guard_exam_immutable() from public, anon, authenticated;
drop trigger if exists guard_exam_immutable on public.written_exams;
create trigger guard_exam_immutable before update of level, exam_kind, group_code on public.written_exams
  for each row execute function public.guard_exam_immutable();

-- ---------------------------------------------------------------- 6) score range
alter table public.written_exam_submissions drop constraint if exists written_exam_submissions_total_score_range;
alter table public.written_exam_submissions add constraint written_exam_submissions_total_score_range
  check (total_score is null or (total_score >= 0 and total_score <= 100));

notify pgrst, 'reload schema';
