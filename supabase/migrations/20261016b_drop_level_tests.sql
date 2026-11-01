-- Remove the old level tests completely (2026-10-16). NOT applied automatically.
-- At the time of writing: exams = 14 rows, exam_questions = 70, exam_results = 0, exam_attempts = 0 (no student results exist).
-- Run in the Supabase SQL editor once you are sure. Irreversible.
begin;
drop function if exists public.get_exam_questions(uuid);
drop function if exists public.submit_exam(uuid, jsonb);
drop function if exists public.start_exam_attempt(text);
drop function if exists public.group_exam_ranking(text);
drop table if exists public.exam_results;
drop table if exists public.exam_attempts;
drop table if exists public.exam_questions;
drop table if exists public.exams;
commit;
