-- Closed groups empty themselves; students who did not finish go to the "Missed the deadline" list. Safe to run more than once.
--
-- RULES
--  1. The moment a class group is switched off (final-exam deadline passed / cohort moved on / by hand) every member leaves it.
--  2. A real student who leaves a closed group WITHOUT a result waiting to be graded is put on the "missed" list
--     (missed_deadline_students). He has no group, but stays on the list until a teacher / admin decides:
--       extend  - more time for the level's midterm / final, for THIS student only. While the extension runs he sees the
--                 exam in his Exams page; when it is graded the normal rule applies (pass -> next level group, fail -> lower).
--       down    - one level lower (nearest running lower group)
--       move    - to a running class group chosen by staff
--       remove  - nobody wants him back: the row is closed, he has no group
--  3. While a student is on the list he cannot join a group by code (MISSED_DEADLINE); staff place him.
--  4. Test (level_free) accounts and staff are simply removed from a closed group, never listed.

/* ----------------------------------------------------------------- 1. the list ----------------------------------------------------------------- */
create table if not exists public.missed_deadline_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_code text,
  group_name text,
  letter text,
  level int not null,
  reason text not null default 'deadline',           -- deadline | moved_on | manual
  closed_at timestamptz not null default now(),
  extended_until timestamptz,
  resolved_at timestamptz,
  resolution text                                     -- moved | removed
);
create unique index if not exists missed_deadline_open_uidx on public.missed_deadline_students (user_id) where resolved_at is null;
alter table public.missed_deadline_students enable row level security;
revoke all on public.missed_deadline_students from anon, authenticated;   -- read and written only by the definer functions below

/* ------------------------------------------------- 2. a closed group empties itself ------------------------------------------------- */
create or replace function public.trg_group_closed_empties() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.type <> 'class' or new.is_active or not coalesce(old.is_active, false) then return null; end if;

  insert into public.missed_deadline_students (user_id, group_code, group_name, letter, level, reason, closed_at)
  select m.user_id, new.code, new.name, new.letter, coalesce(p.level, new.level, 1),
         case when new.deadline_closed_at is not null then 'deadline' when new.moved_on_at is not null then 'moved_on' else 'manual' end,
         now()
    from public.group_members m
    join public.profiles p on p.id = m.user_id and p.role = 'student' and not coalesce(p.level_free, false)
   where m.group_code = new.code
     -- a paper that is handed in and still being graded is not a missed exam: grading moves him
     and not exists (select 1 from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
                      where s.user_id = m.user_id and e.level = coalesce(p.level, 1) and e.exam_kind = 'final' and s.status = 'submitted')
     -- he is not in a running class group already
     and not exists (select 1 from public.group_members m2 join public.groups g2 on g2.code = m2.group_code
                      where m2.user_id = m.user_id and g2.type = 'class' and g2.is_active)
  on conflict do nothing;

  delete from public.group_members m
   where m.group_code = new.code
     and not exists (select 1 from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
                      join public.profiles p on p.id = m.user_id
                      where s.user_id = m.user_id and e.level = coalesce(p.level, 1) and e.exam_kind = 'final' and s.status = 'submitted'
                        and p.role = 'student');
  return null;
end $$;
revoke all on function public.trg_group_closed_empties() from public, anon, authenticated;
drop trigger if exists group_closed_empties on public.groups;
create trigger group_closed_empties after update of is_active on public.groups
  for each row execute function public.trg_group_closed_empties();

-- one-time: whoever still sits in a group that is already closed (the "stranded" students) goes on the list and leaves
insert into public.missed_deadline_students (user_id, group_code, group_name, letter, level, reason, closed_at)
select distinct on (m.user_id) m.user_id, g.code, g.name, g.letter, coalesce(p.level, g.level, 1),
       case when g.deadline_closed_at is not null then 'deadline' when g.moved_on_at is not null then 'moved_on' else 'manual' end,
       coalesce(g.deadline_closed_at, g.moved_on_at, now())
  from public.group_members m
  join public.groups g on g.code = m.group_code and g.type = 'class' and not g.is_active
  join public.profiles p on p.id = m.user_id and p.role = 'student' and not coalesce(p.level_free, false)
 where not exists (select 1 from public.group_members m2 join public.groups g2 on g2.code = m2.group_code
                    where m2.user_id = m.user_id and g2.type = 'class' and g2.is_active)
   and not exists (select 1 from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
                    where s.user_id = m.user_id and e.level = coalesce(p.level, 1) and e.exam_kind = 'final' and s.status = 'submitted')
 order by m.user_id, g.level desc nulls last
on conflict do nothing;
delete from public.group_members m using public.groups g
 where g.code = m.group_code and g.type = 'class' and not g.is_active
   and not exists (select 1 from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
                     join public.profiles p on p.id = m.user_id
                    where s.user_id = m.user_id and p.role = 'student' and e.level = coalesce(p.level, 1) and e.exam_kind = 'final' and s.status = 'submitted');

/* ------------------------------------- 3. an extended student sees and can take the exam without a group ------------------------------------- */
create or replace function public.ufuq_exam_open_to_me(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e join public.profiles p on p.id = auth.uid()
     where e.id = p_exam_id and (
       case
         when p.role = 'admin' then true
         when e.exam_kind is not null and e.level is not null and p.role = 'student' and not p.level_free
           then e.level = coalesce(p.level, 1)
                and (exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                              where gm.user_id = p.id and g.type = 'class' and g.level = e.level)
                     or exists (select 1 from public.written_exam_extensions x
                                 where x.exam_id = e.id and x.user_id = p.id and x.until_at > now()))
         else e.group_code in (select gm.group_code from public.group_members gm where gm.user_id = p.id)
       end));
$$;

create or replace function public.ufuq_in_exam_scope(p_exam_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and (
       case when e.exam_kind is not null and e.level is not null then
         exists (select 1 from public.profiles p
                  where p.id = p_user and p.role = 'student' and not p.level_free and coalesce(p.level, 1) = e.level
                    and (
                      exists (select 1 from public.written_exam_extensions x where x.exam_id = e.id and x.user_id = p.id and x.until_at > now())
                      or exists (
                      select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                       where gm.user_id = p.id and g.type = 'class' and g.level = e.level
                         and (   exists (select 1 from public.groups ge where ge.code = e.group_code and ge.letter = g.letter)
                              or exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id)
                              or not exists (select 1 from public.written_exams e2 join public.groups g2 on g2.code = e2.group_code
                                              where e2.id <> e.id and e2.level = e.level and e2.exam_kind = e.exam_kind
                                                and e2.is_published and g2.letter = g.letter)))))
       else exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p_user) end));
$$;

create or replace function public.my_level_exams()
returns table (id uuid, group_code text, title text, level smallint, exam_kind text, duration_minutes integer,
               deadline_at timestamptz, created_at timestamptz, is_published boolean)
language sql stable security definer set search_path = public as $$
  select x.id, x.group_code, x.title, x.level, x.exam_kind, x.duration_minutes, x.deadline_at, x.created_at, x.is_published
    from (
      select e.*, row_number() over (
               partition by e.level, e.exam_kind
               order by exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id) desc,
                        exists (select 1 from public.written_exam_extensions xx where xx.exam_id = e.id and xx.user_id = p.id and xx.until_at > now()) desc,
                        e.is_published desc,
                        exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p.id) desc,
                        exists (select 1 from public.group_members m
                                  join public.groups g1 on g1.code = m.group_code and g1.type = 'class' and g1.letter is not null
                                  join public.groups g2 on g2.code = e.group_code and g2.letter = g1.letter
                                 where m.user_id = p.id) desc,
                        e.created_at asc) as rn
        from public.written_exams e join public.profiles p on p.id = auth.uid()
       where auth.uid() is not null and p.role = 'student' and not p.level_free
         and e.exam_kind is not null and e.level is not null and e.level = coalesce(p.level, 1)
         and (exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                       where gm.user_id = p.id and g.type = 'class' and g.level = e.level)
              or exists (select 1 from public.written_exam_extensions xx where xx.exam_id = e.id and xx.user_id = p.id and xx.until_at > now()))
    ) x
   where x.rn = 1
   order by x.exam_kind desc, x.created_at desc;
$$;

/* ------------------------------------------- 4. where a groupless student goes after the exam ------------------------------------------- */
-- (lifecycle version + one fallback: a student without a group follows the letter of the group that closed on him)
create or replace function public.ufuq_resolve_target_group(p_user uuid, p_from integer, p_to integer)
returns text language plpgsql security definer set search_path = public as $$
declare v_letter text; v_tpl text; v_any text; v_own text; v_left boolean;
begin
  select g.letter, g.code into v_letter, v_tpl
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class'
   order by (g.level is not distinct from p_from) desc, (g.letter is null), g.is_active desc, m.joined_at
   limit 1;
  if v_letter is null then
    select md.letter, md.group_code into v_letter, v_tpl
      from public.missed_deadline_students md where md.user_id = p_user and md.resolved_at is null limit 1;
  end if;

  v_any := public.ufuq_active_group_at_level(p_to, v_letter);
  if v_letter is null then return v_any; end if;
  if v_any is not null and exists (select 1 from public.groups g where g.code = v_any and g.letter = v_letter) then return v_any; end if;

  if p_to = p_from + 1 then
    select g.code, (g.deadline_closed_at is not null or g.moved_on_at is not null) into v_own, v_left
      from public.groups g where g.type = 'class' and g.letter = v_letter and g.level = p_to;
    if v_own is null or not v_left or v_any is null then
      return public.ufuq_group_for_letter_level(v_letter, p_to, v_tpl, true);
    end if;
  end if;
  return v_any;
end $$;
revoke all on function public.ufuq_resolve_target_group(uuid, integer, integer) from public, anon, authenticated;

-- a student who lands in a group (exam result or staff decision) leaves the list
create or replace function public.trg_transition_closes_missed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.to_group is not null then
    update public.missed_deadline_students set resolved_at = now(), resolution = 'moved'
     where user_id = new.user_id and resolved_at is null;
  end if;
  return null;
end $$;
revoke all on function public.trg_transition_closes_missed() from public, anon, authenticated;
drop trigger if exists transition_closes_missed on public.level_transitions;
create trigger transition_closes_missed after insert on public.level_transitions
  for each row execute function public.trg_transition_closes_missed();

/* -------------------------------------------------- 5. joining by code is blocked while listed -------------------------------------------------- */
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

  -- on the "missed the deadline" list: a teacher / admin places him, he cannot join with a code
  if exists (select 1 from public.missed_deadline_students md where md.user_id = auth.uid() and md.resolved_at is null) then
    raise exception 'MISSED_DEADLINE';
  end if;

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

  if v_role = 'student' and not v_free and v_group.type = 'class' then
    delete from public.group_members gm using public.groups g
     where gm.user_id = auth.uid() and g.code = gm.group_code and g.type = 'class' and not g.is_active and gm.group_code <> v_group.code;
  end if;

  update public.profiles p set status = 'active', updated_at = now() where p.id = auth.uid();

  return query select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end $$;

/* ------------------------------------------------- 6. the student's "your group is closed" card ------------------------------------------------- */
drop function if exists public.my_closed_groups();
create or replace function public.my_closed_groups()
returns table (code text, name text, level smallint, closed_at timestamptz, reason text)
language sql stable security definer set search_path = public as $$
  select md.group_code, md.group_name, md.level::smallint, md.closed_at, md.reason
    from public.missed_deadline_students md
   where md.user_id = auth.uid() and md.resolved_at is null and public.ufuq_is_real_student(auth.uid())
     and not exists (select 1 from public.group_members m2 join public.groups g2 on g2.code = m2.group_code
                      where m2.user_id = auth.uid() and g2.type = 'class' and g2.is_active)
$$;
revoke all on function public.my_closed_groups() from public, anon;
grant execute on function public.my_closed_groups() to authenticated;

/* ---------------------------------------------------------- 7. the staff list and the decision ---------------------------------------------------------- */
create or replace function public.ufuq_staff_sees_missed(p_level int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.teacher_groups tg join public.groups g on g.code = tg.group_code
                  where tg.teacher_id = auth.uid() and g.type = 'class' and g.level = p_level)
$$;
revoke all on function public.ufuq_staff_sees_missed(int) from public, anon;
grant execute on function public.ufuq_staff_sees_missed(int) to authenticated;

-- The level's published midterm / final papers a listed student still owes (his letter's copy when there is one).
create or replace function public.ufuq_missed_exams(p_user uuid)
returns table (exam_id uuid, kind text, title text, deadline_at timestamptz, status text, extended_until timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.exam_kind, e.title, e.deadline_at, s.status, x.until_at
    from public.missed_deadline_students md
    join public.written_exams e on e.level = md.level and e.exam_kind in ('midterm', 'final') and e.is_published
    left join public.groups ge on ge.code = e.group_code
    left join public.written_exam_submissions s on s.exam_id = e.id and s.user_id = md.user_id
    left join public.written_exam_extensions x on x.exam_id = e.id and x.user_id = md.user_id
   where md.user_id = p_user and md.resolved_at is null
     and (md.letter is null or ge.letter = md.letter
          or not exists (select 1 from public.written_exams e2 join public.groups g2 on g2.code = e2.group_code
                          where e2.level = e.level and e2.exam_kind = e.exam_kind and e2.is_published and g2.letter = md.letter))
$$;
revoke all on function public.ufuq_missed_exams(uuid) from public, anon, authenticated;

create or replace function public.staff_missed_list()
returns table (user_id uuid, full_name text, email text, level int, group_name text, reason text, closed_at timestamptz,
               extended_until timestamptz, exams jsonb)
language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or not public.ufuq_is_staff() then raise exception 'not_allowed'; end if;
  perform public.ufuq_sweep_group_deadlines();
  return query
    select md.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Student'), u.email::text, md.level, md.group_name, md.reason, md.closed_at,
           md.extended_until,
           coalesce((select jsonb_agg(jsonb_build_object('exam_id', me.exam_id, 'kind', me.kind, 'title', me.title, 'deadline_at', me.deadline_at,
                                                         'status', me.status, 'extended_until', me.extended_until) order by me.kind desc)
                       from public.ufuq_missed_exams(md.user_id) me), '[]'::jsonb)
      from public.missed_deadline_students md
      join public.profiles p on p.id = md.user_id
      join auth.users u on u.id = md.user_id
     where md.resolved_at is null and public.ufuq_staff_sees_missed(md.level)
     order by md.closed_at desc, 2;
end $fn$;
revoke all on function public.staff_missed_list() from public, anon;
grant execute on function public.staff_missed_list() to authenticated;

-- p_action: extend (p_until) | down | move (p_target = running class group) | remove
create or replace function public.staff_resolve_missed(p_user uuid, p_action text, p_until timestamptz default null, p_target text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare md public.missed_deadline_students%rowtype; v_lvl int; v_letter text; v_target text; v_to int; n int;
begin
  if auth.uid() is null or not public.ufuq_is_staff() then raise exception 'not_allowed'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select * into md from public.missed_deadline_students where user_id = p_user and resolved_at is null for update;
  if not found then raise exception 'not_on_list'; end if;
  if not public.ufuq_staff_sees_missed(md.level) then raise exception 'not_allowed'; end if;
  select coalesce(p.level, 1) into v_lvl from public.profiles p where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false);
  if v_lvl is null then raise exception 'not_a_student'; end if;

  if p_action = 'extend' then
    if p_until is null or p_until <= now() or p_until > now() + interval '180 days' then raise exception 'bad_date'; end if;
    insert into public.written_exam_extensions (exam_id, user_id, until_at, granted_by)
    select me.exam_id, p_user, p_until, auth.uid()
      from public.ufuq_missed_exams(p_user) me
     where me.status is null or me.status = 'draft'
    on conflict (exam_id, user_id) do update set until_at = excluded.until_at, granted_by = auth.uid();
    get diagnostics n = row_count;
    if n = 0 then raise exception 'nothing_to_extend'; end if;
    update public.missed_deadline_students set extended_until = p_until where id = md.id;

  elsif p_action = 'down' then
    if v_lvl <= 1 then raise exception 'already_lowest'; end if;
    v_target := public.ufuq_pick_level_group(v_lvl, false, md.letter);
    if v_target is null then raise exception 'no_lower_group'; end if;
    select g.level into v_to from public.groups g where g.code = v_target;
    perform public.ufuq_move_student_level(p_user, v_lvl, v_to, 'failed', 'missed', null, null, null, v_target);

  elsif p_action = 'move' then
    select g.level into v_to from public.groups g where g.code = p_target and g.type = 'class' and g.is_active;
    if v_to is null then raise exception 'target_not_active'; end if;
    perform public.ufuq_move_student_level(p_user, v_lvl, v_to, 'failed', 'missed', null, null, null, p_target);

  elsif p_action = 'remove' then
    update public.missed_deadline_students set resolved_at = now(), resolution = 'removed' where id = md.id;
    insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, from_group, from_group_name)
    values (p_user, v_lvl, v_lvl, 'failed', 'removed', md.group_code, md.group_name);
  else
    raise exception 'bad_action';
  end if;
end $fn$;
revoke all on function public.staff_resolve_missed(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.staff_resolve_missed(uuid, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
