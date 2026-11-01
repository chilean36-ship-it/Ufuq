-- Exams: students saw "No questions yet" on every published exam (2026-11-01). Safe to run more than once.
-- Cause: written_exam_questions has no student SELECT policy, so the browser's direct count was always 0, and
-- student_written_exam_questions() (correctly) returns nothing before the exam clock starts - the intro screen counted 0
-- and kept "Start" disabled, so the clock could never start. This adds a server-side count the intro/list can use.
-- Question TEXT still reaches the student only through student_written_exam_questions() after the clock has started.

create or replace function public.written_exam_question_counts(p_exam_ids uuid[])
returns table (exam_id uuid, n integer)
language sql stable security definer set search_path = public as $$
  select q.exam_id, count(*)::int
  from public.written_exam_questions q
  join public.written_exams e on e.id = q.exam_id
  where auth.uid() is not null
    and q.exam_id = any(p_exam_ids)
    and (
      public.ufuq_is_staff()
      or (e.is_published and e.group_code in (select public.my_group_codes()))
      or exists (select 1 from public.written_exam_submissions s where s.exam_id = e.id and s.user_id = auth.uid())
    )
  group by q.exam_id;
$$;

revoke all on function public.written_exam_question_counts(uuid[]) from public, anon;
grant execute on function public.written_exam_question_counts(uuid[]) to authenticated;
