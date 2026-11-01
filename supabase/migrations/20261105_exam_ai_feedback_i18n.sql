-- AI comments in four languages.
-- grade-exam (v6) now writes each AI comment in Uzbek, English, Russian and Arabic; the student panel shows the language chosen in the cabinet.
--   ai_feedback        keeps the Uzbek text (older screens and old rows keep working)
--   ai_feedback_i18n   {"uz": "...", "en": "...", "ru": "...", "ar": "..."}
-- Old results (only the Uzbek comment) are translated on demand by grade-exam { translate_only: true }; scores are never touched.
-- Safe to run more than once.

alter table public.written_exam_answers
  add column if not exists ai_feedback_i18n jsonb;

-- When a comment is replaced or cleared (re-check, teacher retake) without its translations being replaced too,
-- drop the old translations so a student never sees a comment that belongs to a previous attempt.
create or replace function public.written_answers_clear_stale_feedback_i18n()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ai_feedback is distinct from old.ai_feedback
     and new.ai_feedback_i18n is not distinct from old.ai_feedback_i18n then
    new.ai_feedback_i18n := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_written_answers_clear_feedback_i18n on public.written_exam_answers;
create trigger trg_written_answers_clear_feedback_i18n
  before update on public.written_exam_answers
  for each row execute function public.written_answers_clear_stale_feedback_i18n();
