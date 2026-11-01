-- STAGE 10 (replaces the "whole group goes up" rule of stage 9). Safe to run more than once.
--
-- MODEL
--  * A group row is one LETTER (A..G, at most 7 letters) at one LEVEL: "Group A7", "Group A8". The pair (letter, level) is unique.
--  * Students pass INDIVIDUALLY. The first student who passes the level exams (>= 75 / 150) is moved at once from A7 to A8 and sees the
--    congratulation window; A8 is created (cloned from A7: schedule, Zoom, teachers, own join code) and switched on by that first pass.
--    Every next student who passes joins the same A8. Nobody waits for the rest of the group.
--  * When the deadline of the group's FINAL exam of its own level passes, that group (A7) is switched off (is_active = false,
--    deadline_closed_at = now()). Students still in it see nothing of it. The teacher decides for each of them
--    (existing tools: remove / move down / re-open the exam for him only = staff_extend_exam_deadline).
--  * A student who fails still goes to the nearest LOWER active group (stage 9 rule).
--  * Moving the deadline of the final exam into the future re-opens a group that was closed by the deadline.
--  * New groups: letter (A..G, not used yet) + level are chosen in the form; create_class_group() does it atomically.

-- 1) columns + uniqueness: (letter, level) instead of letter alone
alter table public.groups add column if not exists deadline_closed_at timestamptz;
alter table public.groups add column if not exists reopened_at timestamptz;

drop index if exists public.groups_letter_uidx;
create unique index if not exists groups_letter_level_uidx on public.groups (letter, level) where letter is not null and level is not null;
create unique index if not exists groups_letter_placeholder_uidx on public.groups (letter) where letter is not null and level is null;

-- 2) triggers
create or replace function public.trg_groups_reopen_mark() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_active and not coalesce(old.is_active, false) then
    new.reopened_at := now();
    new.deadline_closed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists groups_reopen_mark on public.groups;
create trigger groups_reopen_mark before update of is_active on public.groups
  for each row execute function public.trg_groups_reopen_mark();

-- a NEW class group must have a letter A..G and a level 1..14 (the name trigger derives the letter from "Group C" if it was not sent)
create or replace function public.trg_groups_require_letter_level() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.type = 'class' then
    if new.letter is null or new.letter !~ '^[A-G]$' then raise exception 'GROUP_LETTER_REQUIRED'; end if;
    if new.level is null or new.level < 1 or new.level > 14 then raise exception 'GROUP_LEVEL_REQUIRED'; end if;
  end if;
  return new;
end $$;
drop trigger if exists groups_require_letter_level on public.groups;
create trigger groups_require_letter_level before insert on public.groups
  for each row execute function public.trg_groups_require_letter_level();

-- 3) the group of a letter at a level: find it, or clone it from a template group. Activates it when asked.
create or replace function public.ufuq_group_for_letter_level(p_letter text, p_level int, p_template text default null, p_activate boolean default true)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_code text; v_active boolean; v_jc text; t public.groups%rowtype;
begin
  if p_letter is null or p_letter !~ '^[A-G]$' or p_level is null or p_level < 1 or p_level > 14 then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_lg:' || p_letter || ':' || p_level::text, 0));

  select g.code, g.is_active into v_code, v_active from public.groups g
   where g.type = 'class' and g.letter = p_letter and g.level = p_level;
  if v_code is not null then
    if p_activate and not v_active then update public.groups set is_active = true where code = v_code; end if;
    return v_code;
  end if;

  if p_template is not null then select * into t from public.groups where code = p_template; end if;
  loop
    v_code := 'G' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups g where g.code = v_code);
  end loop;
  insert into public.groups (code, name, schedule, zoom_link, is_active, schedule_days, type, slot_minutes, buffer_minutes,
                             no_show_minutes, duration_minutes, level, letter, reopened_at)
  values (v_code, 'Group ' || p_letter || p_level::text, coalesce(t.schedule, ''), t.zoom_link, p_activate,
          coalesce(t.schedule_days, '[]'::jsonb), 'class', coalesce(t.slot_minutes, 10), coalesce(t.buffer_minutes, 2),
          coalesce(t.no_show_minutes, 3), coalesce(t.duration_minutes, 120), p_level, p_letter, case when p_activate then now() end);

  if p_template is not null then
    insert into public.teacher_groups (teacher_id, group_code)
    select distinct tg.teacher_id, v_code from public.teacher_groups tg where tg.group_code = p_template on conflict do nothing;
  end if;
  insert into public.teacher_groups (teacher_id, group_code)
  select p.id, v_code from public.profiles p where p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super' on conflict do nothing;

  if not exists (select 1 from public.group_access_codes a where a.group_code = v_code) then
    loop
      v_jc := public._new_join_code();
      exit when not exists (select 1 from public.group_access_codes a where a.code = v_jc);
    end loop;
    insert into public.group_access_codes (code, group_code) values (v_jc, v_code);
  end if;
  return v_code;
end $fn$;
revoke all on function public.ufuq_group_for_letter_level(text, int, text, boolean) from public, anon, authenticated;

-- where does a student go when his level changes from p_from to p_to? (own letter first, else any active group of that level)
create or replace function public.ufuq_resolve_target_group(p_user uuid, p_from int, p_to int)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_letter text; v_tpl text; v_code text;
begin
  select g.letter, g.code into v_letter, v_tpl
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and (g.level is null or g.level = p_from)
   order by (g.letter is null), g.is_active desc, m.joined_at limit 1;
  if v_letter is not null then
    return public.ufuq_group_for_letter_level(v_letter, p_to, v_tpl, true);
  end if;
  select g.code into v_code from public.groups g where g.type = 'class' and g.is_active and g.level = p_to
   order by (select count(*) from public.group_members m where m.group_code = g.code), g.created_at limit 1;
  return v_code;
end $fn$;
revoke all on function public.ufuq_resolve_target_group(uuid, int, int) from public, anon, authenticated;

-- 4) move ONE student (promotion, failed exam, manual change, teacher decision)
drop function if exists public.ufuq_move_student_level(uuid, integer, integer, text, text, numeric, numeric, numeric);
create or replace function public.ufuq_move_student_level(p_user uuid, p_from integer, p_to integer, p_outcome text, p_reason text,
                                                          p_total numeric, p_mid numeric, p_fin numeric, p_target text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_from text; v_from_names text; v_target text; v_to int := p_to; v_gname text; v_name text;
begin
  select string_agg(m.group_code, ','), string_agg(g.name, ', ') into v_from, v_from_names
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and (g.level is null or g.level = p_from);

  if p_to <> p_from then
    v_target := coalesce(p_target, public.ufuq_resolve_target_group(p_user, p_from, p_to));
    if v_target is null and p_reason <> 'exam' then raise exception 'NO_GROUP_FOR_LEVEL'; end if;   -- a teacher's action reports it; a graded exam never blocks

    if v_target is not null then
      select coalesce(g.level, p_to) into v_to from public.groups g where g.code = v_target;
      select coalesce(p.full_name, 'Student') into v_name from public.profiles p where p.id = p_user;
      delete from public.group_members m using public.groups g
       where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
         and (g.level is null or g.level = p_from) and m.group_code <> v_target;
      insert into public.group_members (user_id, group_code, name, joined_at)
      values (p_user, v_target, v_name, now()) on conflict (user_id, group_code) do nothing;
      select g.name into v_gname from public.groups g where g.code = v_target;
    end if;

    update public.profiles set level = v_to, updated_at = now() where id = p_user;
    perform public.ufuq_reset_level_attempts(p_user, v_to);
  end if;

  insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, total_points, midterm_points, final_points,
                                        from_group, to_group, from_group_name, to_group_name)
  values (p_user, p_from, v_to, p_outcome, p_reason, p_total, p_mid, p_fin, v_from, v_target, v_from_names, v_gname);
end $fn$;
revoke all on function public.ufuq_move_student_level(uuid, integer, integer, text, text, numeric, numeric, numeric, text) from public, anon, authenticated;

-- 5) a graded level result: pass -> this student goes up alone; fail -> nearest lower group
create or replace function public.ufuq_apply_level_result(p_user uuid, p_level integer)
returns void language plpgsql security definer set search_path = public as $fn$
declare r record; v_cur int; v_cut timestamptz; v_target text; v_to int;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false);
  if v_cur is null or v_cur <> p_level then return; end if;

  select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = p_user and t.from_level = p_level and t.reason = 'exam';
  select * into r from public.ufuq_level_result(p_user, p_level, v_cut);
  if r is null or not r.complete then return; end if;

  if r.passed then
    perform public.ufuq_move_student_level(p_user, p_level, least(p_level + 1, 14), 'passed', 'exam',
                                           r.total_points, r.midterm_points, r.final_points);
    return;
  end if;

  v_target := public.ufuq_pick_level_group(p_level, false);
  if v_target is null then v_to := p_level; else select g.level into v_to from public.groups g where g.code = v_target; end if;
  perform public.ufuq_move_student_level(p_user, p_level, v_to, 'failed', 'exam', r.total_points, r.midterm_points, r.final_points, v_target);
end $fn$;
revoke all on function public.ufuq_apply_level_result(uuid, integer) from public, anon, authenticated;

-- the old "whole group advances" machinery is gone
drop trigger if exists group_members_left_advance on public.group_members;
drop function if exists public.trg_member_left_group();
drop function if exists public.ufuq_try_advance_group(text);

-- 6) deadline of the final exam closes the group
create or replace function public.ufuq_group_final_deadline(p_group text, p_level int)
returns timestamptz language sql stable set search_path = public as $$
  select max(e.deadline_at) from public.written_exams e
   where e.group_code = p_group and e.exam_kind = 'final' and e.level = p_level and e.is_published and e.deadline_at is not null
$$;

create or replace function public.ufuq_sweep_group_deadlines() returns integer
language plpgsql security definer set search_path = public as $fn$
declare n int := 0; k int;
begin
  -- close: the final deadline of the group's own level has passed (and nobody switched the group on again after it)
  update public.groups g set is_active = false, deadline_closed_at = now()
   where g.type = 'class' and g.level is not null and g.is_active
     and public.ufuq_group_final_deadline(g.code, g.level) < now()
     and public.ufuq_group_final_deadline(g.code, g.level) > coalesce(g.reopened_at, '-infinity'::timestamptz);
  get diagnostics n = row_count;

  -- re-open: the teacher moved the deadline into the future
  update public.groups g set is_active = true
   where g.type = 'class' and g.level is not null and not g.is_active and g.deadline_closed_at is not null
     and public.ufuq_group_final_deadline(g.code, g.level) > now();
  get diagnostics k = row_count;
  return n + k;
end $fn$;
revoke all on function public.ufuq_sweep_group_deadlines() from public, anon;
grant execute on function public.ufuq_sweep_group_deadlines() to authenticated;

create or replace function public.trg_exam_deadline_sweep() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.exam_kind = 'final' then
    begin perform public.ufuq_sweep_group_deadlines();
    exception when others then raise warning 'deadline sweep failed: %', sqlerrm; end;
  end if;
  return null;
end $$;
revoke all on function public.trg_exam_deadline_sweep() from public, anon, authenticated;
drop trigger if exists exam_deadline_sweep on public.written_exams;
create trigger exam_deadline_sweep after insert or update of deadline_at, is_published, level, exam_kind on public.written_exams
  for each row execute function public.trg_exam_deadline_sweep();

-- 7) a student sees which of his groups are switched off (so the screen can say "your teacher will decide")
create or replace function public.my_closed_groups()
returns table(code text, name text, level smallint, closed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.code, g.name, g.level, g.deadline_closed_at
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = auth.uid() and g.type = 'class' and not g.is_active
   order by g.name
$$;
revoke all on function public.my_closed_groups() from public, anon;
grant execute on function public.my_closed_groups() to authenticated;

-- 8) removing a missed student no longer switches the group off (only the deadline does that)
create or replace function public.staff_remove_missed_student(p_exam_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_exam_group text; v_elevel smallint; v_group text; v_gname text; v_lvl int;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  select e.group_code, e.level into v_exam_group, v_elevel from public.written_exams e where e.id = p_exam_id;
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
  select coalesce(p.level, 1) into v_lvl from public.profiles p where p.id = p_user and p.role = 'student';
  if v_lvl is null then raise exception 'not_a_student'; end if;

  select m.group_code into v_group from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and g.level = v_elevel limit 1;
  v_group := coalesce(v_group, v_exam_group);
  select g.name into v_gname from public.groups g where g.code = v_group;

  delete from public.group_members m using public.groups g
   where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
     and (m.group_code = v_exam_group or (v_elevel is not null and g.level = v_elevel));
  insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, from_group, from_group_name)
  values (p_user, v_lvl, v_lvl, 'failed', 'removed', v_group, v_gname);
end $fn$;
revoke all on function public.staff_remove_missed_student(uuid, uuid) from public, anon;
grant execute on function public.staff_remove_missed_student(uuid, uuid) to authenticated;

-- 9) create a class group: letter (A..G, not used yet) + level, atomically (main admins only, like the groups INSERT policy)
create or replace function public.create_class_group(p_letter text, p_level int, p_schedule text, p_zoom text, p_days jsonb, p_active boolean default true)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_letter text := upper(btrim(coalesce(p_letter, ''))); v_code text; v_jc text;
  v_zoom text := btrim(coalesce(p_zoom, '')); v_sched text := btrim(coalesce(p_schedule, ''));
begin
  if auth.uid() is null or not public.is_admin() or public.is_standard_admin() then raise exception 'NOT_ALLOWED'; end if;
  if v_letter !~ '^[A-G]$' then raise exception 'GROUP_LETTER_REQUIRED'; end if;
  if p_level is null or p_level < 1 or p_level > 14 then raise exception 'GROUP_LEVEL_REQUIRED'; end if;
  if v_zoom !~* '^https?://' then raise exception 'ZOOM_REQUIRED'; end if;
  if v_sched = '' then raise exception 'SCHEDULE_REQUIRED'; end if;
  if p_days is not null and jsonb_typeof(p_days) <> 'array' then raise exception 'BAD_DAYS'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ufuq_lg:' || v_letter, 0));

  -- a letter that already runs a series (any row with a level, a student or an active flag) is taken
  if exists (select 1 from public.groups g where g.type = 'class' and g.letter = v_letter
              and (g.level is not null or g.is_active or exists (select 1 from public.group_members m where m.group_code = g.code))) then
    raise exception 'GROUP_LETTER_TAKEN';
  end if;

  -- an empty, unused placeholder of that letter (Group F / Group G) is taken over instead of making a second row
  select g.code into v_code from public.groups g where g.type = 'class' and g.letter = v_letter and g.level is null limit 1;
  if v_code is not null then
    update public.groups set level = p_level, schedule = v_sched, zoom_link = v_zoom, schedule_days = coalesce(p_days, '[]'::jsonb),
           is_active = coalesce(p_active, true) where code = v_code;
  else
    loop
      v_code := 'G' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      exit when not exists (select 1 from public.groups g where g.code = v_code);
    end loop;
    insert into public.groups (code, name, schedule, zoom_link, is_active, schedule_days, type, level, letter, reopened_at)
    values (v_code, 'Group ' || v_letter || p_level::text, v_sched, v_zoom, coalesce(p_active, true), coalesce(p_days, '[]'::jsonb),
            'class', p_level, v_letter, now());
  end if;

  insert into public.teacher_groups (teacher_id, group_code) values (auth.uid(), v_code) on conflict do nothing;
  insert into public.teacher_groups (teacher_id, group_code)
  select p.id, v_code from public.profiles p where p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super' on conflict do nothing;

  if not exists (select 1 from public.group_access_codes a where a.group_code = v_code) then
    loop
      v_jc := public._new_join_code();
      exit when not exists (select 1 from public.group_access_codes a where a.code = v_jc);
    end loop;
    insert into public.group_access_codes (code, group_code) values (v_jc, v_code);
  end if;
  return v_code;
end $fn$;
revoke all on function public.create_class_group(text, int, text, text, jsonb, boolean) from public, anon;
grant execute on function public.create_class_group(text, int, text, text, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
