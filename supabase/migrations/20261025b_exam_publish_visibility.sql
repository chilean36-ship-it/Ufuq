-- Unpublished exams are invisible to students (2026-10-25). Safe to run more than once.
-- RESTRICTIVE policies only ever NARROW what the existing policies allow, so nothing becomes more open.
--   * written_exams: a student sees an exam only if it is published, or they already have a paper in it (their results stay visible).
--   * written_exam_questions: a student sees questions only of exams they can see.
-- Teachers and admins (ufuq_is_staff()) are not affected. Taking an exam is also checked in start_written_exam().

do $$
begin
  if to_regclass('public.written_exams') is not null and to_regprocedure('public.ufuq_is_staff()') is not null then
    execute 'drop policy if exists exams_students_published_only on public.written_exams';
    execute $p$create policy exams_students_published_only on public.written_exams as restrictive for select to authenticated
      using (
        is_published
        or public.ufuq_is_staff()
        or exists (select 1 from public.written_exam_submissions s where s.exam_id = written_exams.id and s.user_id = auth.uid())
      )$p$;
  end if;
  if to_regclass('public.written_exam_questions') is not null and to_regprocedure('public.ufuq_is_staff()') is not null then
    execute 'drop policy if exists exam_questions_students_visible_only on public.written_exam_questions';
    execute $p$create policy exam_questions_students_visible_only on public.written_exam_questions as restrictive for select to authenticated
      using (
        public.ufuq_is_staff()
        or exists (select 1 from public.written_exams e where e.id = written_exam_questions.exam_id)
      )$p$;
  end if;
end $$;
