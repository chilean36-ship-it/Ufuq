-- Students saw "No questions yet" and could not start the exam (2026-11-03). Safe to run more than once.
-- Cause: student_written_exam_questions() ran with the caller's rights, and students have no SELECT policy on
-- written_exam_questions, so the function always came back empty. This re-installs it as SECURITY DEFINER with the
-- access rules spelled out here, so the server (not table policies) decides who sees question text:
--   * a student sees the questions only of an exam they have a paper in (no paper = nothing);
--   * while the paper is a draft, questions are released only after the server clock has started (begin_written_exam);
--   * once handed in / graded, the questions are visible so results can be reviewed;
--   * staff (teachers/admins) see the questions of any exam.
-- The answer key (criteria) is never part of this function.

create or replace function public.student_written_exam_questions(p_exam_id uuid)
returns table (id uuid, exam_id uuid, order_num integer, type text, question_text text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.written_exam_submissions%rowtype;
  v_staff boolean := false;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_staff := public.ufuq_is_staff();
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;

  if not found then
    if not v_staff then return; end if;                       -- no paper and not staff: nothing
  elsif v_sub.status = 'draft' and v_sub.clock_started_at is null and not v_staff then
    return;                                                    -- paper not started yet: questions are withheld
  end if;

  return query
    select q.id, q.exam_id, q.order_num::integer, q.type::text, q.question_text::text
    from public.written_exam_questions q
    where q.exam_id = p_exam_id
    order by q.order_num, q.id;
end $$;

revoke all on function public.student_written_exam_questions(uuid) from public, anon;
grant execute on function public.student_written_exam_questions(uuid) to authenticated;

notify pgrst, 'reload schema';
