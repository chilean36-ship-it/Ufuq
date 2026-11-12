-- The "Missed the deadline" students are handled INSIDE each exam (Exams > exam card > "Missed the deadline" button),
-- not in a separate box. Safe to run more than once. Apply AFTER 20261201d_closed_group_empties_itself.sql.
--
-- RULES
--  1. A student who missed the deadline appears ONLY on the exam of his own level and his own letter (Group A7 -> the A copy of the
--     level-7 exam; a B7 student never shows up for an A7 teacher). If his letter has no copy of its own, the one published copy is used.
--  2. A teacher / ordinary admin sees and decides only for the letters he is linked to; a main admin sees everything.
--  3. Students who still sit in a group and students whose group closed on them are listed together; the buttons are the same.
--  4. The old global list (staff_missed_list / staff_resolve_missed) is closed to browsers: it ignored the letter.

/* ---------------------------------------------------- helpers ---------------------------------------------------- */
-- Does the caller manage this letter? (no letter = any staff member)
create or replace function public.ufuq_staff_covers_letter(p_letter text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or (public.ufuq_is_staff() and p_letter is null)
      or exists (select 1 from public.teacher_groups tg join public.groups g on g.code = tg.group_code
                  where tg.teacher_id = auth.uid() and g.type = 'class' and g.letter = p_letter)
$$;
revoke all on function public.ufuq_staff_covers_letter(text) from public, anon;
grant execute on function public.ufuq_staff_covers_letter(text) to authenticated;

-- A teacher whose letter's groups are all closed and empty still reaches the level exam while one of that letter's students waits.
create or replace function public.ufuq_teaches_level_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and e.exam_kind is not null and e.level is not null
       and (exists (select 1 from public.teacher_groups tg join public.groups g on g.code = tg.group_code
                     where tg.teacher_id = auth.uid() and g.type = 'class' and g.level = e.level
                       and (g.is_active or public.ufuq_group_real_students(g.code) > 0))
            or exists (select 1 from public.missed_deadline_students md
                         join public.groups g on g.type = 'class' and g.letter is not distinct from md.letter
                         join public.teacher_groups tg on tg.group_code = g.code and tg.teacher_id = auth.uid()
                        where md.level = e.level and md.resolved_at is null)));
$$;

/* ------------------------------------------- who belongs to THIS copy of the exam ------------------------------------------- */
create or replace function public.ufuq_in_exam_scope(p_exam_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and (
       case when e.exam_kind is not null and e.level is not null then
         exists (select 1 from public.profiles p
                  where p.id = p_user and p.role = 'student' and not p.level_free and coalesce(p.level, 1) = e.level
                    and (
                      -- he sits in a class group of this level (and of a letter the caller manages)
                      exists (
                        select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                         where gm.user_id = p.id and g.type = 'class' and g.level = e.level
                           and public.ufuq_staff_covers_letter(g.letter)
                           and (   exists (select 1 from public.groups ge where ge.code = e.group_code and ge.letter = g.letter)
                                or exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id)
                                or not exists (select 1 from public.written_exams e2 join public.groups g2 on g2.code = e2.group_code
                                                where e2.id <> e.id and e2.level = e.level and e2.exam_kind = e.exam_kind
                                                  and e2.is_published and g2.letter = g.letter)))
                      -- or his group closed on him and he waits on the "missed" list (same letter rule)
                      or exists (
                        select 1 from public.missed_deadline_students md
                         where md.user_id = p.id and md.resolved_at is null and md.level = e.level
                           and public.ufuq_staff_covers_letter(md.letter)
                           and (   md.letter is null
                                or exists (select 1 from public.groups ge where ge.code = e.group_code and ge.letter = md.letter)
                                or exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = p.id)
                                or not exists (select 1 from public.written_exams e2 join public.groups g2 on g2.code = e2.group_code
                                                where e2.id <> e.id and e2.level = e.level and e2.exam_kind = e.exam_kind
                                                  and e2.is_published and g2.letter = md.letter))))
                    )
       else exists (select 1 from public.group_members m where m.group_code = e.group_code and m.user_id = p_user) end));
$$;
revoke all on function public.ufuq_in_exam_scope(uuid, uuid) from public, anon, authenticated;

/* --------------------------------------------------- the exam's "did not submit" list --------------------------------------------------- */
drop function if exists public.exam_missed_students(uuid);
create function public.exam_missed_students(p_exam_id uuid)
returns table (user_id uuid, name text, status text, level integer, extended_until timestamptz, group_name text, groupless boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(p.full_name, ''), (select m2.name from public.group_members m2 where m2.user_id = p.id limit 1), 'Student'),
         s.status, coalesce(p.level, 1)::int, x.until_at,
         coalesce((select g3.name from public.group_members m3 join public.groups g3 on g3.code = m3.group_code
                    where m3.user_id = p.id and g3.type = 'class' order by g3.is_active desc, g3.level desc nulls last limit 1), md.group_name),
         (md.id is not null and not exists (select 1 from public.group_members m4 join public.groups g4 on g4.code = m4.group_code
                                             where m4.user_id = p.id and g4.type = 'class' and g4.is_active))
    from public.written_exams e
    join public.profiles p on p.role = 'student' and public.ufuq_in_exam_scope(e.id, p.id)
    left join public.missed_deadline_students md on md.user_id = p.id and md.resolved_at is null
    left join public.written_exam_submissions s on s.exam_id = e.id and s.user_id = p.id
    left join public.written_exam_extensions x on x.exam_id = e.id and x.user_id = p.id
   where e.id = p_exam_id and public.teaches_written_exam(e.id)
     and (s.id is null or s.status = 'draft')
   order by 2
$$;
revoke all on function public.exam_missed_students(uuid) from public, anon;
grant execute on function public.exam_missed_students(uuid) to authenticated;

/* ------------------------------- decisions for a student whose group already closed (he has no group any more) ------------------------------- */
-- Running class groups the caller may place a student in (his own letters only).
create or replace function public.staff_missed_target_groups(p_exam_id uuid)
returns table (code text, name text, level integer)
language sql stable security definer set search_path = public as $$
  select g.code, g.name, g.level::int
    from public.groups g
   where public.teaches_written_exam(p_exam_id) and g.type = 'class' and g.is_active and public.teaches_group(g.code)
   order by g.level, g.name
$$;
revoke all on function public.staff_missed_target_groups(uuid) from public, anon;
grant execute on function public.staff_missed_target_groups(uuid) to authenticated;

-- p_action: down | move (p_target = running group) | remove. Extending is staff_extend_exam_deadline, the same as for everybody else.
create or replace function public.staff_resolve_missed_in_exam(p_exam_id uuid, p_user uuid, p_action text, p_target text default null)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
  if not exists (select 1 from public.missed_deadline_students md where md.user_id = p_user and md.resolved_at is null) then
    raise exception 'not_on_list';
  end if;
  if p_action = 'move' and not public.teaches_group(p_target) then raise exception 'not_allowed'; end if;
  perform public.staff_resolve_missed(p_user, p_action, null, p_target);
end $fn$;
revoke all on function public.staff_resolve_missed_in_exam(uuid, uuid, text, text) from public, anon;
grant execute on function public.staff_resolve_missed_in_exam(uuid, uuid, text, text) to authenticated;

-- a groupless student: the existing "lower level" button follows the closed group's letter
create or replace function public.staff_demote_missed_student(p_exam_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lvl int; v_target text; v_to int; v_letter text;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
  if exists (select 1 from public.missed_deadline_students md where md.user_id = p_user and md.resolved_at is null)
     and not exists (select 1 from public.group_members m join public.groups g on g.code = m.group_code where m.user_id = p_user and g.type = 'class' and g.is_active) then
    perform public.staff_resolve_missed(p_user, 'down', null, null);
    return;
  end if;
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
revoke all on function public.staff_demote_missed_student(uuid, uuid) from public, anon;
grant execute on function public.staff_demote_missed_student(uuid, uuid) to authenticated;

/* ----------------------------------- the old global box is gone: close its two functions to browsers ----------------------------------- */
-- (staff_resolve_missed is still called from inside the definer function above, which runs as the owner)
revoke execute on function public.staff_missed_list() from authenticated;
revoke execute on function public.staff_resolve_missed(uuid, text, timestamptz, text) from authenticated;

notify pgrst, 'reload schema';
