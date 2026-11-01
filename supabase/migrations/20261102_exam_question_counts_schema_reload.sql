-- Students still saw "No questions yet" on published exams (2026-11-02). Safe to run more than once.
-- Re-installs the server-side count RPC used by the exam list and the intro screen, grants it to signed-in users only,
-- and asks PostgREST to reload its schema cache: a function created in SQL is invisible to the API until that happens,
-- so the browser got an error, fell back to a table that students cannot read, and showed 0 questions.
-- Question TEXT still reaches the student only through student_written_exam_questions() after the clock has started.

create or replace function public.written_exam_question_counts(p_exam_ids uuid[])
returns table (exam_id uuid, n integer)
language sql stable security definer set search_path = public as $$
  select q.exam_id, count(*)::int as n
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

-- Table grants the student screens need (row-level security still decides which rows they see):
grant select on public.written_exams to authenticated;
grant select on public.written_exam_submissions to authenticated;

notify pgrst, 'reload schema';
