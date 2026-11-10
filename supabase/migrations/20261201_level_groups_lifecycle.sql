-- Level groups: one consistent life cycle (audit of 2026-11-10). Safe to run twice.
--
-- What was wrong on the live project before this file:
--   1. An old level group never closed when everybody had passed: only a final-exam DEADLINE closed it.
--   2. A manual level change ("7 -> 6") silently switched ON the hidden, pre-created group of that letter (Group A6) for one student
--      instead of using a group that is really running. Admins then switched it off again and the student was stranded.
--   3. Students stranded in a switched-off group were invisible to staff (every panel lists active groups only).
--   4. A student who passed AFTER his cohort had left the next level re-opened that dead group for himself alone.
--   5. Teachers were linked to every new group automatically (sync_new_group_to_admins linked ALL admins, ordinary ones too) and
--      kept 60+ links to switched-off groups; through them ufuq_teaches_level_exam let them see / grade the level exams of
--      other teachers' groups, and a group they never taught appeared in their panel as soon as it was switched on.
--   6. The next level group was pre-created on 2026-11-02 with the schedule / Zoom link / teachers of that day; when the cohort
--      reached it weeks later it still carried the old ones.
--   7. Level exams were open to anybody whose profile level matched, even with no class group (a new account is level 1 by
--      default), and the "did not submit" list of a level exam showed those accounts and the members of the group the exam
--      row happens to be stored under.
--   8. A move could leave the student in two class groups (only the groups of the level he left were removed).
--
-- Rules after this file (they are the only place where a student changes group by level):
--   * PASS  (>= 75/150): the student moves to the next level group of HIS letter; the first one who passes opens it, and it
--     inherits the current schedule, Zoom link and teachers. If that group was already left behind by the cohort, he joins a
--     running group of that level instead (another letter); only if there is none is the old group re-opened.
--   * FAIL: the student moves to the nearest LOWER level that has an ACTIVE group (his own letter first). No lower active
--     group: he stays and retakes.
--   * MANUAL level change: one level up behaves like a pass. Any other level needs an ACTIVE group on that level
--     (NO_ACTIVE_GROUP_AT_LEVEL otherwise) - a switched-off group is never switched on behind the admin's back.
--   * A class group is switched off by itself (groups.moved_on_at) when its last real student leaves and another group of the
--     same letter is running: the cohort has moved on. The final-exam deadline still closes a group as before.
--   * A real student is in ONE class group at a time. Free test accounts (profiles.level_free) are never moved or counted.

/* ------------------------------------------------------------------ 1. schema ------------------------------------------------------------------ */
alter table public.groups add column if not exists moved_on_at timestamptz;
comment on column public.groups.moved_on_at is 'Set when the group was switched off automatically because its last student left and the cohort (same letter) runs in another level group.';
comment on column public.groups.deadline_closed_at is 'Set when the group was switched off automatically because the deadline of its final exam passed.';

create or replace function public.ufuq_is_real_student(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false))
$$;
revoke all on function public.ufuq_is_real_student(uuid) from public, anon, authenticated;

create or replace function public.ufuq_group_real_students(p_code text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.group_members m
    join public.profiles p on p.id = m.user_id and p.role = 'student' and not coalesce(p.level_free, false)
   where m.group_code = p_code
$$;
revoke all on function public.ufuq_group_real_students(text) from public, anon, authenticated;

-- Switching a group back on (by hand or by a student reaching it) clears both "closed automatically" marks.
create or replace function public.trg_groups_reopen_mark()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_active and not coalesce(old.is_active, false) then
    new.reopened_at := now();
    new.deadline_closed_at := null;
    new.moved_on_at := null;
  end if;
  return new;
end $$;

-- The level (and letter) of a class group that has students is its identity: students change level one by one through the
-- level functions below, never by renumbering the whole row (that skipped the transition log and the retake reset).
create or replace function public.trg_groups_level_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.type = 'class' and new.type = 'class' and old.level is not null
     and (new.level is distinct from old.level or new.letter is distinct from old.letter)
     and public.ufuq_group_real_students(old.code) > 0 then
    raise exception 'GROUP_LEVEL_LOCKED';
  end if;
  return new;
end $$;
revoke all on function public.trg_groups_level_guard() from public, anon, authenticated;
drop trigger if exists groups_level_guard on public.groups;
create trigger groups_level_guard before update of level, letter on public.groups
  for each row execute function public.trg_groups_level_guard();

/* ------------------------------------------- 2. the cohort moved on: the old level group closes itself ------------------------------------------- */
create or replace function public.trg_group_members_left()
returns trigger language plpgsql security definer set search_path = public as $$
declare g public.groups%rowtype;
begin
  select * into g from public.groups where code = old.group_code;
  if not found or g.type <> 'class' or not g.is_active or g.letter is null or g.level is null then return null; end if;
  -- a test account or a staff member leaving never closes a group
  if exists (select 1 from public.profiles p where p.id = old.user_id and (p.role <> 'student' or coalesce(p.level_free, false))) then return null; end if;
  -- two students leaving at the same moment: the second one waits here and then sees the first one gone
  perform pg_advisory_xact_lock(hashtextextended('ufuq_grp:' || g.code, 0));
  if public.ufuq_group_real_students(g.code) > 0 then return null; end if;
  if not exists (select 1 from public.groups o where o.type = 'class' and o.letter = g.letter and o.code <> g.code and o.is_active) then
    return null;   -- the only running group of this letter stays open (new students join it with the code)
  end if;
  update public.groups set is_active = false, moved_on_at = now() where code = g.code and is_active;
  return null;
end $$;
revoke all on function public.trg_group_members_left() from public, anon, authenticated;
drop trigger if exists group_members_left on public.group_members;
create trigger group_members_left after delete on public.group_members
  for each row execute function public.trg_group_members_left();

/* ------------------------------------------------------- 3. which group does a student go to ------------------------------------------------------- */
-- An ACTIVE class group exactly on p_level: the wanted letter first, then the smallest group.
create or replace function public.ufuq_active_group_at_level(p_level integer, p_letter text default null)
returns text language sql stable security definer set search_path = public as $$
  select g.code from public.groups g
   where g.type = 'class' and g.is_active and g.level = p_level
   order by (p_letter is not null and g.letter = p_letter) desc,
            (select count(*) from public.group_members m where m.group_code = g.code), g.created_at, g.code
   limit 1
$$;
revoke all on function public.ufuq_active_group_at_level(integer, text) from public, anon, authenticated;

-- The nearest level above / below p_from_level that has an ACTIVE class group (own letter first, then the smallest group).
drop function if exists public.ufuq_pick_level_group(integer, boolean);
create or replace function public.ufuq_pick_level_group(p_from_level integer, p_up boolean, p_letter text default null)
returns text language sql stable security definer set search_path = public as $$
  select g.code from public.groups g
   where g.type = 'class' and g.is_active and g.level is not null
     and case when p_up then g.level > p_from_level else g.level < p_from_level end
   order by case when p_up then g.level else -g.level end,
            (p_letter is not null and g.letter = p_letter) desc,
            (select count(*) from public.group_members m where m.group_code = g.code), g.created_at, g.code
   limit 1
$$;
revoke all on function public.ufuq_pick_level_group(integer, boolean, text) from public, anon, authenticated;

-- The (letter, level) group. It is created from the template when missing. Switching on a group that has never run makes it
-- inherit the template's CURRENT schedule, Zoom link and teachers (it was pre-created long before the cohort reached it).
create or replace function public.ufuq_group_for_letter_level(p_letter text, p_level integer, p_template text default null, p_activate boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_jc text; g public.groups%rowtype; t public.groups%rowtype;
begin
  if p_letter is null or p_letter !~ '^[A-G]$' or p_level is null or p_level < 1 or p_level > 14 then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_lg:' || p_letter || ':' || p_level::text, 0));
  if p_template is not null then select * into t from public.groups where code = p_template and type = 'class'; end if;

  select * into g from public.groups where type = 'class' and letter = p_letter and level = p_level;
  if found then
    if p_activate and not g.is_active then
      if g.reopened_at is null and g.deadline_closed_at is null and g.moved_on_at is null and t.code is not null and t.code <> g.code then
        update public.groups
           set schedule = t.schedule, zoom_link = t.zoom_link, schedule_days = t.schedule_days, slot_minutes = t.slot_minutes,
               buffer_minutes = t.buffer_minutes, no_show_minutes = t.no_show_minutes, duration_minutes = t.duration_minutes
         where code = g.code;
        delete from public.teacher_groups tg
         where tg.group_code = g.code
           and tg.teacher_id not in (select x.teacher_id from public.teacher_groups x where x.group_code = t.code)
           and tg.teacher_id not in (select p.id from public.profiles p where p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super');
        insert into public.teacher_groups (teacher_id, group_code)
        select distinct x.teacher_id, g.code from public.teacher_groups x where x.group_code = t.code on conflict do nothing;
      end if;
      update public.groups set is_active = true where code = g.code;
    end if;
    return g.code;
  end if;

  loop
    v_code := 'G' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups x where x.code = v_code);
  end loop;
  insert into public.groups (code, name, schedule, zoom_link, is_active, schedule_days, type, slot_minutes, buffer_minutes,
                             no_show_minutes, duration_minutes, level, letter, reopened_at)
  values (v_code, 'Group ' || p_letter || p_level::text, coalesce(t.schedule, ''), t.zoom_link, p_activate,
          coalesce(t.schedule_days, '[]'::jsonb), 'class', coalesce(t.slot_minutes, 10), coalesce(t.buffer_minutes, 2),
          coalesce(t.no_show_minutes, 3), coalesce(t.duration_minutes, 120), p_level, p_letter, case when p_activate then now() end);

  if t.code is not null then
    insert into public.teacher_groups (teacher_id, group_code)
    select distinct tg.teacher_id, v_code from public.teacher_groups tg where tg.group_code = t.code on conflict do nothing;
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
end $$;
revoke all on function public.ufuq_group_for_letter_level(text, integer, text, boolean) from public, anon, authenticated;

-- Where does this student go when his level becomes p_to? NULL = there is nothing to move to.
drop function if exists public.ufuq_resolve_target_group(uuid, integer, integer);
create or replace function public.ufuq_resolve_target_group(p_user uuid, p_from integer, p_to integer)
returns text language plpgsql security definer set search_path = public as $$
declare v_letter text; v_tpl text; v_any text; v_own text; v_left boolean;
begin
  -- his own class group: its letter is the series he follows, the group itself is the template of a new level group
  select g.letter, g.code into v_letter, v_tpl
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class'
   order by (g.level is not distinct from p_from) desc, (g.letter is null), g.is_active desc, m.joined_at
   limit 1;

  v_any := public.ufuq_active_group_at_level(p_to, v_letter);   -- own letter first
  if v_letter is null then return v_any; end if;
  if v_any is not null and exists (select 1 from public.groups g where g.code = v_any and g.letter = v_letter) then return v_any; end if;

  -- no running group of his own letter on that level
  if p_to = p_from + 1 then
    select g.code, (g.deadline_closed_at is not null or g.moved_on_at is not null) into v_own, v_left
      from public.groups g where g.type = 'class' and g.letter = v_letter and g.level = p_to;
    -- the next level of the series opens for the first student who reaches it; a level the cohort has already left is
    -- re-opened only when no other group runs on that level
    if v_own is null or not v_left or v_any is null then
      return public.ufuq_group_for_letter_level(v_letter, p_to, v_tpl, true);
    end if;
  end if;
  return v_any;
end $$;
revoke all on function public.ufuq_resolve_target_group(uuid, integer, integer) from public, anon, authenticated;

/* ------------------------------------------------------------ 4. the move itself ------------------------------------------------------------ */
create or replace function public.ufuq_move_student_level(p_user uuid, p_from integer, p_to integer, p_outcome text, p_reason text,
                                                           p_total numeric, p_mid numeric, p_fin numeric, p_target text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text; v_from_names text; v_target text := p_target; v_to int := p_to; v_tlevel int; v_gname text; v_name text;
begin
  select string_agg(m.group_code, ',' order by g.is_active desc, m.joined_at), string_agg(g.name, ', ' order by g.is_active desc, m.joined_at)
    into v_from, v_from_names
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class';

  if v_target is null and p_to <> p_from then
    v_target := public.ufuq_resolve_target_group(p_user, p_from, p_to);
    if v_target is null and p_reason <> 'exam' then raise exception 'NO_ACTIVE_GROUP_AT_LEVEL'; end if;
  end if;

  if v_target is not null then
    select g.level, g.name into v_tlevel, v_gname from public.groups g where g.code = v_target and g.type = 'class';
    if not found then raise exception 'GROUP_NOT_FOUND'; end if;
    v_to := coalesce(v_tlevel, p_to);
    select coalesce(nullif(btrim(p.full_name), ''), 'Student') into v_name from public.profiles p where p.id = p_user;
    -- one class group per student: every other class group is left (group_members_left closes a group the cohort has left)
    delete from public.group_members m using public.groups g
     where m.user_id = p_user and g.code = m.group_code and g.type = 'class' and m.group_code <> v_target;
    insert into public.group_members (user_id, group_code, name, joined_at)
    values (p_user, v_target, coalesce(v_name, 'Student'), now()) on conflict (user_id, group_code) do nothing;
  end if;

  if v_to <> p_from then
    update public.profiles set level = v_to, updated_at = now() where id = p_user;
    perform public.ufuq_reset_level_attempts(p_user, v_to);   -- the new level always starts with fresh exams
  end if;

  insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, total_points, midterm_points, final_points,
                                        from_group, to_group, from_group_name, to_group_name)
  values (p_user, p_from, v_to, p_outcome, p_reason, p_total, p_mid, p_fin, v_from, v_target, v_from_names, v_gname);
end $$;
revoke all on function public.ufuq_move_student_level(uuid, integer, integer, text, text, numeric, numeric, numeric, text) from public, anon, authenticated;

-- Graded level exams (midterm + final): pass -> next level group, fail -> nearest lower running group (or stay and retake).
create or replace function public.ufuq_apply_level_result(p_user uuid, p_level integer)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_cur int; v_cut timestamptz; v_target text; v_to int; v_letter text;
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

  select g.letter into v_letter from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' order by (g.level is not distinct from p_level) desc, g.is_active desc, m.joined_at limit 1;
  v_target := public.ufuq_pick_level_group(p_level, false, v_letter);
  if v_target is null then v_to := p_level; else select g.level into v_to from public.groups g where g.code = v_target; end if;
  perform public.ufuq_move_student_level(p_user, p_level, v_to, 'failed', 'exam', r.total_points, r.midterm_points, r.final_points, v_target);
end $$;
revoke all on function public.ufuq_apply_level_result(uuid, integer) from public, anon, authenticated;

-- Admin / teacher: status and level of one student. A level change moves the student (rules at the top of this file).
create or replace function public.admin_update_student(p_user_id uuid, p_status public.profile_status default null, p_level integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur int; v_role text; v_free boolean; v_tid uuid;
begin
  if not (public.is_admin() or public.is_teacher()) then
    raise exception 'Faqat o''qituvchilar bu amalni bajara oladi.';
  end if;
  if p_level is not null and (p_level < 1 or p_level > 14) then
    raise exception 'Daraja 1 dan 14 gacha bo''lishi kerak.';
  end if;
  if not public.is_super_admin() and not exists (
    select 1 from public.group_members gm where gm.user_id = p_user_id and public.teaches_group(gm.group_code)
  ) then
    raise exception 'Bu talaba sizning guruhingizga tegishli emas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user_id::text, 0));

  if p_status is not null then
    update public.profiles set status = p_status, updated_at = now() where id = p_user_id;
  end if;

  if p_level is not null then
    select p.level, p.role::text, coalesce(p.level_free, false) into v_cur, v_role, v_free from public.profiles p where p.id = p_user_id;
    if v_role = 'student' and not v_free and v_cur is not null and p_level <> v_cur then
      perform public.ufuq_move_student_level(p_user_id, v_cur, p_level,
                case when p_level > v_cur then 'passed' else 'failed' end, 'manual', null, null, null);
      select t.id into v_tid from public.level_transitions t
       where t.user_id = p_user_id and t.reason = 'manual' order by t.created_at desc limit 1;
      if v_tid is not null then update public.level_transitions set seen_at = now() where id = v_tid; end if;
    elsif v_cur is distinct from p_level then
      update public.profiles set level = p_level, updated_at = now() where id = p_user_id;
    end if;
  end if;
end $$;

-- Admin / teacher: put one student into a chosen ACTIVE class group (his level becomes the group's level). This is how a
-- student who sits in a switched-off group, or who should study with another letter, is placed by hand.
create or replace function public.admin_move_student_to_group(p_user uuid, p_group_code text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups%rowtype; v_cur int; v_tid uuid;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_teacher()) then raise exception 'NOT_ALLOWED'; end if;
  select * into g from public.groups where code = p_group_code and type = 'class';
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  if not g.is_active then raise exception 'GROUP_INACTIVE'; end if;
  if g.level is null then raise exception 'GROUP_LEVEL_REQUIRED'; end if;
  if not public.is_super_admin() and (
       not public.teaches_group(g.code)
       or not exists (select 1 from public.group_members gm where gm.user_id = p_user and public.teaches_group(gm.group_code))) then
    raise exception 'NOT_ALLOWED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false);
  if v_cur is null then raise exception 'not_a_student'; end if;

  if v_cur = g.level
     and exists (select 1 from public.group_members m where m.user_id = p_user and m.group_code = g.code)
     and not exists (select 1 from public.group_members m join public.groups x on x.code = m.group_code
                      where m.user_id = p_user and x.type = 'class' and m.group_code <> g.code) then
    return;   -- already there, nothing to do
  end if;

  perform public.ufuq_move_student_level(p_user, v_cur, g.level::int, case when g.level >= v_cur then 'passed' else 'failed' end,
                                         'manual', null, null, null, g.code);
  select t.id into v_tid from public.level_transitions t
   where t.user_id = p_user and t.reason = 'manual' order by t.created_at desc limit 1;
  if v_tid is not null then update public.level_transitions set seen_at = now() where id = v_tid; end if;
end $$;
revoke all on function public.admin_move_student_to_group(uuid, text) from public, anon;
grant execute on function public.admin_move_student_to_group(uuid, text) to authenticated;

/* ----------------------------------------------- 5. level exams belong to the students of a level group ----------------------------------------------- */
-- A level exam (midterm / final) is for a real student whose level matches AND who sits in a class group of that level.
-- An account with no class group (a new account is level 1 by default) no longer sees or takes level exams.
create or replace function public.ufuq_exam_open_to_me(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e join public.profiles p on p.id = auth.uid()
     where e.id = p_exam_id and (
       case
         when p.role = 'admin' then true
         when e.exam_kind is not null and e.level is not null and p.role = 'student' and not p.level_free
           then e.level = coalesce(p.level, 1)
                and exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                             where gm.user_id = p.id and g.type = 'class' and g.level = e.level)
         else e.group_code in (select gm.group_code from public.group_members gm where gm.user_id = p.id)
       end));
$$;

-- Is this student one of the students who should take THIS copy of the exam (staff lists and staff actions)?
-- Level exam: a real student of that level who sits in a class group of that level. When two cohorts are on the same level and
-- each letter has published its own copy, a student belongs to the copy of his own letter (the one my_level_exams gives him).
create or replace function public.ufuq_in_exam_scope(p_exam_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and (
       case when e.exam_kind is not null and e.level is not null then
         exists (select 1 from public.profiles p
                  where p.id = p_user and p.role = 'student' and not p.level_free and coalesce(p.level, 1) = e.level
                    and exists (
                      select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                       where gm.user_id = p.id and g.type = 'class' and g.level = e.level
                         and (   exists (select 1 from public.groups ge where ge.code = e.group_code and ge.letter = g.letter)
                              or exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id)
                              or not exists (select 1 from public.written_exams e2 join public.groups g2 on g2.code = e2.group_code
                                              where e2.id <> e.id and e2.level = e.level and e2.exam_kind = e.exam_kind
                                                and e2.is_published and g2.letter = g.letter))))
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
                        e.is_published desc,
                        -- the copy of his own group, then of his own letter (Group A7's final may be stored under Group A8)
                        exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p.id) desc,
                        exists (select 1 from public.group_members m
                                  join public.groups g1 on g1.code = m.group_code and g1.type = 'class' and g1.letter is not null
                                  join public.groups g2 on g2.code = e.group_code and g2.letter = g1.letter
                                 where m.user_id = p.id) desc,
                        e.created_at asc) as rn
        from public.written_exams e join public.profiles p on p.id = auth.uid()
       where auth.uid() is not null and p.role = 'student' and not p.level_free
         and e.exam_kind is not null and e.level is not null and e.level = coalesce(p.level, 1)
         and exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                      where gm.user_id = p.id and g.type = 'class' and g.level = e.level)
    ) x
   where x.rn = 1
   order by x.exam_kind desc, x.created_at desc;
$$;

-- "Did not submit": for a level exam the students of that LEVEL (not the members of the group the row is stored under).
create or replace function public.exam_missed_students(p_exam_id uuid)
returns table (user_id uuid, name text, status text, level integer, extended_until timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(p.full_name, ''), (select m2.name from public.group_members m2 where m2.user_id = p.id limit 1), 'Student'),
         s.status, coalesce(p.level, 1)::int, x.until_at
    from public.written_exams e
    join public.profiles p on p.role = 'student' and public.ufuq_in_exam_scope(e.id, p.id)
    left join public.written_exam_submissions s on s.exam_id = e.id and s.user_id = p.id
    left join public.written_exam_extensions x on x.exam_id = e.id and x.user_id = p.id
   where e.id = p_exam_id and public.teaches_written_exam(e.id)
     and (s.id is null or s.status = 'draft')
   order by 2
$$;

-- Results window: who should take the exam (level exam: the level's students; group exam: the group's members) + everyone who did.
create or replace function public.staff_exam_roster(p_exam_id uuid)
returns table (user_id uuid, name text, in_group boolean, current_group text, level integer)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(p.full_name, ''),
                  (select m2.name from public.group_members m2 where m2.user_id = p.id and coalesce(m2.name, '') <> '' limit 1),
                  'Student'),
         exists (select 1 from public.group_members m where m.user_id = p.id and m.group_code = e.group_code),
         (select g2.name from public.group_members m3 join public.groups g2 on g2.code = m3.group_code
           where m3.user_id = p.id and g2.type = 'class' order by g2.is_active desc, g2.level desc nulls last limit 1),
         coalesce(p.level, 1)::int
    from public.written_exams e
    join public.profiles p on p.role = 'student'
     and (public.ufuq_in_exam_scope(e.id, p.id)
          or exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id))
   where e.id = p_exam_id and public.teaches_written_exam(e.id)
   order by 2;
$$;

-- A teacher handles the level exams of the levels he really teaches: a running group, or a closed one that still has students.
-- (A link to a switched-off, empty group gives nothing.)
create or replace function public.ufuq_teaches_level_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and e.exam_kind is not null and e.level is not null
       and exists (select 1 from public.teacher_groups tg join public.groups g on g.code = tg.group_code
                    where tg.teacher_id = auth.uid() and g.type = 'class' and g.level = e.level
                      and (g.is_active or public.ufuq_group_real_students(g.code) > 0)));
$$;

-- Teacher's "Lower level" button for a student who missed the deadline: the same target as a failed exam.
create or replace function public.staff_demote_missed_student(p_exam_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lvl int; v_target text; v_to int; v_letter text;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));

  select p.level into v_lvl from public.profiles p
   where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false);
  if v_lvl is null then raise exception 'not_a_student'; end if;
  if v_lvl <= 1 then raise exception 'already_lowest'; end if;

  select g.letter into v_letter from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' order by (g.level is not distinct from v_lvl) desc, g.is_active desc, m.joined_at limit 1;
  v_target := public.ufuq_pick_level_group(v_lvl, false, v_letter);
  if v_target is null then raise exception 'no_lower_group'; end if;
  select g.level into v_to from public.groups g where g.code = v_target;

  perform public.ufuq_move_student_level(p_user, v_lvl, v_to, 'failed', 'missed', null, null, null, v_target);
end $$;

/* ------------------------------------------------------ 6. what staff and students see ------------------------------------------------------ */
-- Student: "your group is closed" card. reason = deadline | moved_on | manual. Nothing when he also sits in a running class group.
drop function if exists public.my_closed_groups();
create or replace function public.my_closed_groups()
returns table (code text, name text, level smallint, closed_at timestamptz, reason text)
language sql stable security definer set search_path = public as $$
  select g.code, g.name, g.level, coalesce(g.deadline_closed_at, g.moved_on_at),
         case when g.deadline_closed_at is not null then 'deadline' when g.moved_on_at is not null then 'moved_on' else 'manual' end
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = auth.uid() and g.type = 'class' and not g.is_active
     and public.ufuq_is_real_student(auth.uid())
     and not exists (select 1 from public.group_members m2 join public.groups g2 on g2.code = m2.group_code
                      where m2.user_id = auth.uid() and g2.type = 'class' and g2.is_active)
   order by g.name
$$;
revoke all on function public.my_closed_groups() from public, anon;
grant execute on function public.my_closed_groups() to authenticated;

-- Staff: real students per group (test accounts and staff are not students). Only the groups the caller manages.
create or replace function public.staff_group_student_counts()
returns table (group_code text, students integer)
language sql stable security definer set search_path = public as $$
  select g.code, public.ufuq_group_real_students(g.code)
    from public.groups g
   where public.ufuq_is_staff() and public.teaches_group(g.code)
$$;
revoke all on function public.staff_group_student_counts() from public, anon;
grant execute on function public.staff_group_student_counts() to authenticated;

-- Staff: students who sit in a switched-off class group and in no running one. They see no lessons until somebody decides.
create or replace function public.staff_stranded_students()
returns table (user_id uuid, name text, level integer, group_code text, group_name text, reason text, closed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(m.name), ''), 'Student'), coalesce(p.level, 1)::int, g.code, g.name,
         case when g.deadline_closed_at is not null then 'deadline' when g.moved_on_at is not null then 'moved_on' else 'manual' end,
         coalesce(g.deadline_closed_at, g.moved_on_at)
    from public.group_members m
    join public.groups g on g.code = m.group_code and g.type = 'class' and not g.is_active
    join public.profiles p on p.id = m.user_id and p.role = 'student' and not coalesce(p.level_free, false)
   where public.ufuq_is_staff() and public.teaches_group(g.code)
     and not exists (select 1 from public.group_members m2 join public.groups g2 on g2.code = m2.group_code
                      where m2.user_id = p.id and g2.type = 'class' and g2.is_active)
   order by g.name, 2
$$;
revoke all on function public.staff_stranded_students() from public, anon;
grant execute on function public.staff_stranded_students() to authenticated;

/* --------------------------------------------------------- 7. joining with a code --------------------------------------------------------- */
-- Unchanged rules (one class group per account, the level follows the first level group). New: a student who joins a running
-- class group leaves the switched-off class group he was still listed in.
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

  if v_role = 'student' and not v_free and v_group.type = 'class' then
    delete from public.group_members gm using public.groups g
     where gm.user_id = auth.uid() and g.code = gm.group_code and g.type = 'class' and not g.is_active and gm.group_code <> v_group.code;
  end if;

  update public.profiles p set status = 'active', updated_at = now() where p.id = auth.uid();

  return query select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end $$;

/* ------------------------------------------------------------- 8. teacher links ------------------------------------------------------------- */
-- A new group is linked to the MAIN admins only. (It linked every admin, so ordinary admins - the teachers - received every
-- new group of every letter.) The teachers of a level group come from the group the cohort arrives from.
create or replace function public.sync_new_group_to_admins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.teacher_groups (teacher_id, group_code)
  select p.id, new.code from public.profiles p where p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super'
  on conflict (teacher_id, group_code) do nothing;
  return new;
end $$;

-- One-time clean-up: teacher links of ordinary admins / teachers to class groups that have NEVER run (pre-created, never
-- switched on, no students). Those links were made by the two mechanisms above, not by anyone's choice; the group gets the
-- right teachers when the cohort reaches it.
delete from public.teacher_groups tg
 using public.groups g
 where g.code = tg.group_code and g.type = 'class' and not g.is_active
   and g.reopened_at is null and g.deadline_closed_at is null and g.moved_on_at is null
   and public.ufuq_group_real_students(g.code) = 0
   and not exists (select 1 from public.profiles p where p.id = tg.teacher_id and p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super');

/* --------------------------------------------------------------- 9. tidy up --------------------------------------------------------------- */
-- Left over from the first level design ("Level-N" group names); nothing calls them.
drop function if exists public.ufuq_group_for_level(integer);
drop function if exists public.ufuq_level_group_name(integer, text);
revoke all on function public.ufuq_group_final_deadline(text, integer) from public, anon, authenticated;

notify pgrst, 'reload schema';
