-- Exam levels (2026-10-25). Safe to run more than once.
-- Every written exam belongs to one of 11 levels (1..11). Old exams keep level NULL until a teacher/admin assigns one.
-- Publishing is enforced on the server too: an exam can only be published with a level and at least one question.

begin;

alter table public.written_exams add column if not exists level smallint;
alter table public.written_exams drop constraint if exists written_exams_level_check;
alter table public.written_exams add constraint written_exams_level_check check (level is null or level between 1 and 11);
create index if not exists written_exams_group_level_idx on public.written_exams (group_code, level);

create or replace function public.guard_exam_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_published then
    if new.level is null then raise exception 'EXAM_LEVEL_REQUIRED'; end if;
    if tg_op = 'INSERT' or old.is_published is distinct from true then
      if not exists (select 1 from public.written_exam_questions q where q.exam_id = new.id) then
        raise exception 'EXAM_NEEDS_QUESTIONS';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_exam_publish on public.written_exams;
create trigger guard_exam_publish before insert or update of is_published, level on public.written_exams
  for each row execute function public.guard_exam_publish();

commit;
