-- Exam time limit: written_exams.duration_minutes (null = unlimited), server-side clock RPC, save guard after the deadline.
alter table public.written_exams add column if not exists duration_minutes integer check (duration_minutes is null or (duration_minutes between 1 and 600));
-- (functions written_exam_remaining + save_written_answers were applied through the Supabase MCP migration "exam_duration_clock")
-- Applied through the Supabase MCP migration "exam_clock_begin":
--   written_exam_submissions.clock_started_at (set once by begin_written_exam when the student presses Start),
--   begin_written_exam(sub) -> seconds left, written_exam_remaining(sub) -> seconds left (null = no limit),
--   save_written_answers refuses writes 30 s after the deadline.
