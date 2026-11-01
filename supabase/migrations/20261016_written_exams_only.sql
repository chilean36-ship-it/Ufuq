-- Written exams only (2026-10-16).  Safe to run more than once.
--
-- 1) Student-facing RPCs that replace raw table writes, so a student can never hit
--    "new row violates row-level security policy for table written_exam_submissions / written_exam_answers":
--      start_written_exam(exam)        - opens (or resumes) the student's draft; clear errors instead of an RLS failure
--      save_written_answers(sub, json) - autosave; silently ignored once the paper is submitted
--      submit_written_exam(sub)        - idempotent "Finish"
-- 2) Progress / ranking now come from graded written exams (total_score is 0-100):
--      my_written_history(), group_written_ranking(group)
-- (Dropping the old level-test tables is in 20261016b_drop_level_tests.sql — run it separately when you are ready.)

begin;

create or replace function public.start_written_exam(p_exam_id uuid)
returns setof public.written_exam_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_sub public.written_exam_submissions;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select e.id, e.group_code, e.is_published into v_exam from public.written_exams e where e.id = p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;

  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  if found then return next v_sub; return; end if;           -- resume / view result

  if not v_exam.is_published then raise exception 'EXAM_NOT_PUBLISHED'; end if;
  if not exists (select 1 from public.group_members gm where gm.user_id = v_uid and gm.group_code = v_exam.group_code) then
    raise exception 'NOT_IN_GROUP';
  end if;

  insert into public.written_exam_submissions (exam_id, user_id, status) values (p_exam_id, v_uid, 'draft')
    on conflict (exam_id, user_id) do nothing;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  return next v_sub;
end $$;

create or replace function public.save_written_answers(p_submission_id uuid, p_answers jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sub record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select s.id, s.exam_id, s.status into v_sub from public.written_exam_submissions s where s.id = p_submission_id and s.user_id = v_uid;
  if not found then raise exception 'SUBMISSION_NOT_FOUND'; end if;
  if v_sub.status <> 'draft' then return false; end if;       -- already handed in: nothing to save, and no error
  if jsonb_typeof(p_answers) <> 'array' then raise exception 'BAD_ANSWERS'; end if;

  insert into public.written_exam_answers (submission_id, question_id, answer_text, updated_at)
  select p_submission_id, (a->>'question_id')::uuid, left(coalesce(a->>'answer_text', ''), 20000), now()
  from jsonb_array_elements(p_answers) a
  where exists (select 1 from public.written_exam_questions q where q.id = (a->>'question_id')::uuid and q.exam_id = v_sub.exam_id)
  on conflict (submission_id, question_id) do update set answer_text = excluded.answer_text, updated_at = now();
  return true;
end $$;

create or replace function public.submit_written_exam(p_submission_id uuid)
returns public.written_exam_submissions
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sub public.written_exam_submissions;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.written_exam_submissions set status = 'submitted', submitted_at = now()
    where id = p_submission_id and user_id = v_uid and status = 'draft';
  select * into v_sub from public.written_exam_submissions where id = p_submission_id and user_id = v_uid;
  if not found then raise exception 'SUBMISSION_NOT_FOUND'; end if;
  return v_sub;
end $$;

create or replace function public.my_written_history()
returns table (id uuid, exam_id uuid, title text, score int, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.exam_id, e.title, s.total_score, coalesce(s.submitted_at, s.started_at)
  from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
  where s.user_id = auth.uid() and s.status = 'graded' and s.total_score is not null
  order by 5;
$$;

create or replace function public.group_written_ranking(p_group_code text)
returns table (user_id uuid, name text, avg_pct int, exams_taken int, rank int)
language sql stable security definer set search_path = public as $$
  with allowed as (
    select 1 where public.ufuq_is_staff() or exists (select 1 from public.group_members gm where gm.group_code = p_group_code and gm.user_id = auth.uid())
  ), agg as (
    select gm.user_id, gm.name,
           coalesce(round(avg(s.total_score)), 0)::int as avg_pct,
           count(s.id)::int as exams_taken
    from public.group_members gm
    left join public.written_exams e on e.group_code = p_group_code
    left join public.written_exam_submissions s on s.exam_id = e.id and s.user_id = gm.user_id and s.status = 'graded' and s.total_score is not null
    where gm.group_code = p_group_code and exists (select 1 from allowed)
    group by gm.user_id, gm.name
  )
  select a.user_id, a.name, a.avg_pct, a.exams_taken, (rank() over (order by a.avg_pct desc, a.exams_taken desc))::int
  from agg a order by 5, a.name;
$$;

revoke all on function public.start_written_exam(uuid), public.save_written_answers(uuid, jsonb), public.submit_written_exam(uuid),
  public.my_written_history(), public.group_written_ranking(text) from public, anon;
grant execute on function public.start_written_exam(uuid), public.save_written_answers(uuid, jsonb), public.submit_written_exam(uuid),
  public.my_written_history(), public.group_written_ranking(text) to authenticated;

commit;
