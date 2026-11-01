-- Stage 4 (zero-bug): the offline credit from stage 1 was being undone by the submissions guard trigger,
-- because the RPC runs as the student. The guard now accepts one clock move only when the trusted RPC opens the
-- window with set_config('ufuq.clock_credit', '1', true), and it always keeps paused_seconds under server control.
-- Applied to project ldbthwpikixtykwmvudy as migrations "exam_offline_credit_guard_fix" and "exam_offline_credit_flag_reset".

create or replace function public.written_exam_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then return new; end if;            -- service role / server-side
  if not public.teaches_written_exam(old.exam_id) then
    new.total_score := old.total_score;
    new.exam_id := old.exam_id;
    new.user_id := old.user_id;
    new.started_at := old.started_at;
    new.ai_lock_until := old.ai_lock_until;
    -- only the trusted offline-credit RPC may move the clock or the credited seconds
    if coalesce(current_setting('ufuq.clock_credit', true), '') <> '1' then
      new.paused_seconds := old.paused_seconds;
      if old.clock_started_at is not null then
        new.clock_started_at := old.clock_started_at;         -- the clock can only be started once
      elsif new.clock_started_at is not null then
        new.clock_started_at := now();                        -- begin_written_exam(): start = now, never a chosen time
      end if;
    end if;
    if old.status <> 'draft' then new.status := old.status; end if;
    if new.status = 'graded' then new.status := old.status; end if;
  end if;
  return new;
end $function$;

create or replace function public.written_exam_offline_credit(p_submission_id uuid, p_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.written_exam_submissions%rowtype;
  v_credit integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_sub
    from public.written_exam_submissions
   where id = p_submission_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'submission_not_found';
  end if;

  if v_sub.status <> 'draft' or v_sub.clock_started_at is null then
    return 0;
  end if;

  v_credit := greatest(0, least(coalesce(p_seconds, 0), 900 - v_sub.paused_seconds));
  if v_credit = 0 then
    return 0;
  end if;

  perform set_config('ufuq.clock_credit', '1', true);   -- lets the guard trigger accept this one clock move
  update public.written_exam_submissions
     set paused_seconds = paused_seconds + v_credit,
         clock_started_at = clock_started_at + make_interval(secs => v_credit)
   where id = p_submission_id;
  perform set_config('ufuq.clock_credit', '0', true);   -- close the window again

  return v_credit;
end;
$$;

revoke all on function public.written_exam_offline_credit(uuid, integer) from public, anon;
grant execute on function public.written_exam_offline_credit(uuid, integer) to authenticated;
