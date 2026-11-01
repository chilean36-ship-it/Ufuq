-- Written exam: staff (teacher of the group) can give extra time or reopen a paper for a retake. Every action is logged.
-- Applied to project ldbthwpikixtykwmvudy as migration "exam_staff_retake_and_time".

create table if not exists public.written_exam_staff_actions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.written_exam_submissions(id) on delete cascade,
  actor_id uuid not null default auth.uid(),
  action text not null check (action in ('time_restore', 'retake')),
  minutes integer,
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.written_exam_staff_actions enable row level security;

drop policy if exists staff_actions_read on public.written_exam_staff_actions;
create policy staff_actions_read on public.written_exam_staff_actions
  for select using (
    exists (select 1 from public.written_exam_submissions s
            where s.id = submission_id and public.teaches_written_exam(s.exam_id))
  );

create or replace function public.staff_restore_written_time(p_submission_id uuid, p_minutes integer, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam uuid;
  v_status text;
  v_started timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then raise exception 'bad_minutes'; end if;
  if p_note is null or length(btrim(p_note)) < 3 then raise exception 'note_required'; end if;

  select exam_id, status, clock_started_at into v_exam, v_status, v_started
    from public.written_exam_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  if not public.teaches_written_exam(v_exam) then raise exception 'not_allowed'; end if;
  if v_status <> 'draft' or v_started is null then raise exception 'not_running'; end if;

  update public.written_exam_submissions
     set clock_started_at = clock_started_at + make_interval(mins => p_minutes)
   where id = p_submission_id;

  insert into public.written_exam_staff_actions (submission_id, action, minutes, note)
  values (p_submission_id, 'time_restore', p_minutes, btrim(p_note));

  return p_minutes;
end;
$$;

create or replace function public.staff_reopen_written_exam(p_submission_id uuid, p_keep_answers boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_note is null or length(btrim(p_note)) < 3 then raise exception 'note_required'; end if;

  select exam_id, status into v_exam, v_status
    from public.written_exam_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  if not public.teaches_written_exam(v_exam) then raise exception 'not_allowed'; end if;
  if v_status not in ('submitted', 'graded') then raise exception 'not_handed_in'; end if;

  update public.written_exam_submissions
     set status = 'draft', submitted_at = null, total_score = null,
         ai_lock_until = null, clock_started_at = null, paused_seconds = 0
   where id = p_submission_id;

  if coalesce(p_keep_answers, true) = false then
    update public.written_exam_answers set answer_text = '' where submission_id = p_submission_id;
  end if;
  update public.written_exam_answers
     set ai_score = null, ai_feedback = null, teacher_score = null
   where submission_id = p_submission_id;

  insert into public.written_exam_staff_actions (submission_id, action, minutes, note)
  values (p_submission_id, 'retake', null, btrim(p_note));
end;
$$;

revoke all on function public.staff_restore_written_time(uuid, integer, text) from public, anon;
revoke all on function public.staff_reopen_written_exam(uuid, boolean, text) from public, anon;
grant execute on function public.staff_restore_written_time(uuid, integer, text) to authenticated;
grant execute on function public.staff_reopen_written_exam(uuid, boolean, text) to authenticated;
