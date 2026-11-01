-- STAGE 11 — teacher's "Lower level" button (missed deadline) now behaves EXACTLY like a failed exam.
-- Before: the student always went to (level - 1), preferring their own letter. If that level had no active group the call failed / hit a wrong group.
-- Now:    the target is chosen by ufuq_pick_level_group(level, false) = the SAME rule ufuq_apply_level_result() uses for a failed exam:
--           * the nearest existing level BELOW the student's level (active class groups only),
--           * on that level the group with the fewest students (then the oldest),
--           * none below -> the lowest existing level, but never above the student's own level; if nothing fits -> 'no_lower_group'.
-- Safe to run more than once. Needs 20261118_group_series_individual_promotion.sql (ufuq_move_student_level with p_target).

create or replace function public.staff_demote_missed_student(p_exam_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_lvl int; v_target text; v_to int;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  if not public.ufuq_in_exam_scope(p_exam_id, p_user) then raise exception 'not_in_group'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_lvl from public.profiles p where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false);
  if v_lvl is null then raise exception 'not_a_student'; end if;
  if v_lvl <= 1 then raise exception 'already_lowest'; end if;

  v_target := public.ufuq_pick_level_group(v_lvl, false);          -- nearest lower active group (same rule as a failed exam)
  if v_target is null then raise exception 'no_lower_group'; end if;
  select g.level into v_to from public.groups g where g.code = v_target;
  if v_to is null or v_to >= v_lvl then raise exception 'no_lower_group'; end if;

  perform public.ufuq_move_student_level(p_user, v_lvl, v_to, 'failed', 'missed', null, null, null, v_target);
end $fn$;
revoke all on function public.staff_demote_missed_student(uuid, uuid) from public, anon;
grant execute on function public.staff_demote_missed_student(uuid, uuid) to authenticated;
