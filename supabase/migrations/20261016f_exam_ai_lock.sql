-- grade-exam v5: a per-paper lock so the same paper is never graded twice at the same time
-- (double click on Finish, auto-heal on the exam list, many students at once). NULL = free.
alter table public.written_exam_submissions add column if not exists ai_lock_until timestamptz;
