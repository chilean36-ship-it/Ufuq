-- ============================================================================
-- Exam security — stage 2 (Supabase), revised against the LIVE database. Safe to run more than once.
-- The live project already has 20261026145843 (exam_security_stage2: grants, pay-wall, guard functions).
-- This file only adds what is still missing:
--  * the answer key (written_exam_questions.criteria_text) moves to a staff-only table and the column is dropped
--  * staff-only RPC for the grading screen
--  * create-draft RPC writes criteria to the new table
--  * exam RPCs: never callable by anon
-- It deliberately does NOT drop or redefine existing policies (paywall_restrict, no_std_admin_*) or the
-- live student_written_exam_questions / begin_written_exam / save_written_answers functions (server clock).
-- ============================================================================

begin;

-- 1) Staff-only answer key table ------------------------------------------------------------------
create table if not exists public.written_exam_criteria (
  question_id   uuid primary key references public.written_exam_questions(id) on delete cascade,
  criteria_text text not null default '',
  updated_at    timestamptz not null default now()
);
alter table public.written_exam_criteria enable row level security;

create or replace function public.teaches_written_question(p_question_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exam_questions q
    join public.written_exams e on e.id = q.exam_id
    where q.id = p_question_id and public.teaches_group(e.group_code)
  );
$$;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'written_exam_questions' and column_name = 'criteria_text') then
    insert into public.written_exam_criteria (question_id, criteria_text)
      select id, coalesce(criteria_text, '') from public.written_exam_questions
      on conflict (question_id) do nothing;
    alter table public.written_exam_questions drop column criteria_text;
  end if;
end $$;

drop policy if exists wc_select on public.written_exam_criteria;
drop policy if exists wc_insert on public.written_exam_criteria;
drop policy if exists wc_update on public.written_exam_criteria;
drop policy if exists wc_delete on public.written_exam_criteria;
create policy wc_select on public.written_exam_criteria for select to authenticated using (public.teaches_written_question(question_id));
create policy wc_insert on public.written_exam_criteria for insert to authenticated with check (public.teaches_written_question(question_id));
create policy wc_update on public.written_exam_criteria for update to authenticated
  using (public.teaches_written_question(question_id)) with check (public.teaches_written_question(question_id));
create policy wc_delete on public.written_exam_criteria for delete to authenticated using (public.teaches_written_question(question_id));

revoke all on function public.teaches_written_question(uuid) from public, anon;
grant execute on function public.teaches_written_question(uuid) to authenticated;

revoke all on public.written_exam_criteria from anon, authenticated;
grant select, insert, update, delete on public.written_exam_criteria to authenticated;

-- 2) RPCs -----------------------------------------------------------------------------------------
-- Grading screen / editor: the answer key, teachers of the exam's group only.
create or replace function public.staff_written_exam_criteria(p_exam_id uuid)
returns table (question_id uuid, criteria_text text)
language sql stable security definer set search_path = public as $$
  select c.question_id, c.criteria_text
  from public.written_exam_criteria c join public.written_exam_questions q on q.id = c.question_id
  where q.exam_id = p_exam_id and public.teaches_written_exam(p_exam_id);
$$;

-- Draft creation writes the answer key to the staff-only table (body otherwise as in 20261029).
create or replace function public.ufuq_create_exam_draft(
  p_group_code text, p_level smallint, p_title text, p_duration_minutes int, p_questions jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_exam_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  q jsonb;
  v_i int := 0;
  v_qid uuid;
begin
  if auth.uid() is null or not public.ufuq_is_staff() then raise exception 'NOT_ALLOWED'; end if;
  if not public.teaches_group(p_group_code) then raise exception 'GROUP_NOT_LINKED'; end if;
  if p_level is null or p_level < 1 or p_level > 11 then raise exception 'EXAM_LEVEL_REQUIRED'; end if;
  if v_title = '' then raise exception 'EXAM_TITLE_REQUIRED'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then raise exception 'EXAM_NEEDS_QUESTIONS'; end if;

  insert into public.written_exams (group_code, title, level, duration_minutes, is_published, created_by)
  values (p_group_code, v_title, p_level, p_duration_minutes, false, auth.uid())
  returning id into v_exam_id;

  for q in select value from jsonb_array_elements(p_questions) loop
    if (q->>'type') not in ('short_answer', 'matching', 'antonym', 'grammar', 'essay') then raise exception 'BAD_QUESTION_TYPE'; end if;
    if btrim(coalesce(q->>'question_text', '')) = '' then raise exception 'QUESTION_TEXT_REQUIRED'; end if;
    insert into public.written_exam_questions (exam_id, order_num, type, question_text)
    values (v_exam_id, v_i, q->>'type', left(q->>'question_text', 4000))
    returning id into v_qid;
    insert into public.written_exam_criteria (question_id, criteria_text)
    values (v_qid, left(coalesce(q->>'criteria_text', ''), 4000));
    v_i := v_i + 1;
  end loop;

  return v_exam_id;
end $$;

-- 3) Exam functions: signed-in users only (existing ones only; missing names are skipped) ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.start_written_exam(uuid)', 'public.save_written_answers(uuid,jsonb)', 'public.submit_written_exam(uuid)',
    'public.begin_written_exam(uuid)', 'public.written_exam_remaining(uuid)', 'public.can_take_written_exam(uuid)',
    'public.student_written_exam_questions(uuid)', 'public.staff_written_exam_criteria(uuid)',
    'public.my_written_history()', 'public.group_written_ranking(text)',
    'public.log_exam_violation(text,text,text,integer)', 'public.ufuq_create_exam_draft(text,smallint,text,integer,jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

commit;
