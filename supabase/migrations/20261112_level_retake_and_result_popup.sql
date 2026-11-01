-- NOTE (stage 7): the archive table and the functions below were later replaced in the live database. Run
-- 20261114_live_sync_missed_exams_and_archive_fix.sql AFTER this file; it holds the final definitions (and fixes the
-- written_exam_attempt_archive 'snapshot' column bug). Do not re-run this file on its own on a live database.
-- STAGE 5: automatic retake + result popup. Safe to run more than once.
-- 1) When a student ARRIVES at a level (promotion, demotion, or a failed attempt that keeps them on the same level),
--    their old midterm/final papers of that level are archived and removed, so the level starts fresh:
--    the exams show as "Start" again and the old score is gone. The teacher does NOT have to reopen anything.
-- 2) level_transitions now remembers the scores + group names and whether the student has seen the result window.
--    The browser shows a congratulation / "you left the group" window until the student closes it (ack_level_transition).
-- 3) The old text notification is gone: the window replaces it.

-- ---------------------------------------------------------------- 1) extra columns on level_transitions
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'level_transitions' and column_name = 'seen_at') then
    alter table public.level_transitions add column seen_at timestamptz;
    update public.level_transitions set seen_at = created_at;      -- history from before this stage: nobody gets an old popup
  end if;
end $$;
alter table public.level_transitions add column if not exists midterm_points numeric;
alter table public.level_transitions add column if not exists final_points numeric;
alter table public.level_transitions add column if not exists from_group_name text;
alter table public.level_transitions add column if not exists to_group_name text;
create index if not exists level_transitions_unseen_idx on public.level_transitions (user_id) where seen_at is null;

-- ---------------------------------------------------------------- 2) archive of removed attempts
create table if not exists public.written_exam_attempt_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid,
  level int,
  snapshot jsonb not null,                       -- the submission row + its answers, exactly as they were
  archived_at timestamptz not null default now()
);
create index if not exists written_exam_attempt_archive_user_idx on public.written_exam_attempt_archive (user_id, archived_at desc);
alter table public.written_exam_attempt_archive enable row level security;
drop policy if exists attempt_archive_select on public.written_exam_attempt_archive;
create policy attempt_archive_select on public.written_exam_attempt_archive for select to authenticated
  using (public.ufuq_is_staff());
revoke all on public.written_exam_attempt_archive from anon;
revoke insert, update, delete on public.written_exam_attempt_archive from authenticated;

-- Internal: archive + delete one student's midterm/final papers of one level.
create or replace function public.ufuq_reset_level_attempts(p_user uuid, p_level int)
returns int language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_n int;
begin
  select array_agg(s.id) into v_ids
    from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
   where s.user_id = p_user and e.level = p_level and e.exam_kind in ('midterm', 'final');
  if v_ids is null then return 0; end if;

  insert into public.written_exam_attempt_archive (user_id, exam_id, level, snapshot)
  select s.user_id, s.exam_id, p_level,
         to_jsonb(s) || jsonb_build_object('answers',
           coalesce((select jsonb_agg(to_jsonb(a)) from public.written_exam_answers a where a.submission_id = s.id), '[]'::jsonb))
    from public.written_exam_submissions s where s.id = any (v_ids);

  delete from public.written_exam_submissions where id = any (v_ids);   -- answers / staff actions go with it (ON DELETE CASCADE)
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.ufuq_reset_level_attempts(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3) apply a finished level (resets the new level, no notification)
create or replace function public.ufuq_apply_level_result(p_user uuid, p_level int)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; v_cur int; v_cut timestamptz; v_new int; v_target text; v_from text; v_from_names text; v_name text; v_gname text;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));   -- midterm + final graded together: one at a time

  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student';
  if v_cur is null or v_cur <> p_level then return; end if;          -- staff, or an old level: nothing to move

  select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = p_user and t.from_level = p_level;

  select * into r from public.ufuq_level_result(p_user, p_level, v_cut);
  if r is null or not r.complete then return; end if;

  v_new := case when r.passed then least(p_level + 1, 14) else greatest(p_level - 1, 1) end;
  v_target := public.ufuq_pick_level_group(p_level, r.passed);

  select string_agg(m.group_code, ','), string_agg(g.name, ', ') into v_from, v_from_names
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and (g.level is null or g.level = p_level);

  if v_target is not null then
    select coalesce(p.full_name, 'Student') into v_name from public.profiles p where p.id = p_user;
    delete from public.group_members m using public.groups g
     where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
       and (g.level is null or g.level = p_level) and m.group_code <> v_target;
    insert into public.group_members (user_id, group_code, name, joined_at)
    values (p_user, v_target, v_name, now()) on conflict (user_id, group_code) do nothing;
    select g.name into v_gname from public.groups g where g.code = v_target;
  end if;

  if v_new <> p_level then
    update public.profiles set level = v_new, updated_at = now() where id = p_user;
    -- arriving at another level: that level starts from zero, as if the student had never taken it
    perform public.ufuq_reset_level_attempts(p_user, v_new);
  end if;
  -- (a failed attempt that keeps the student on the same level is reset when they close the result window,
  --  so the paper they just handed in is still readable until then - see ack_level_transition)

  insert into public.level_transitions (user_id, from_level, to_level, outcome, total_points, midterm_points, final_points,
                                        from_group, to_group, from_group_name, to_group_name)
  values (p_user, p_level, v_new, case when r.passed then 'passed' else 'failed' end, r.total_points, r.midterm_points, r.final_points,
          v_from, v_target, v_from_names, v_gname);
end $$;
revoke all on function public.ufuq_apply_level_result(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4) the student closes the result window
create or replace function public.ack_level_transition(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.level_transitions%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.level_transitions set seen_at = now()
   where id = p_id and user_id = auth.uid() and seen_at is null
   returning * into t;
  if not found then return; end if;
  -- failed and stayed on the same level (Level-1): start the level over now
  if t.outcome = 'failed' and t.from_level = t.to_level
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.level = t.to_level) then
    perform public.ufuq_reset_level_attempts(auth.uid(), t.to_level);
  end if;
end $$;
revoke all on function public.ack_level_transition(uuid) from public, anon;
grant execute on function public.ack_level_transition(uuid) to authenticated;

notify pgrst, 'reload schema';
