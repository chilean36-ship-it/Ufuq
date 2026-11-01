-- Exams: ordered by level, and a safe way to create DRAFT exams in bulk (2026-10-29). Safe to run more than once.
-- * ufuq_create_exam_draft(...) always inserts with is_published = false. Publishing stays a separate, deliberate
--   teacher/admin action (guard_exam_publish still requires a level and at least one question).
-- * Only staff may call it; an ordinary admin only for groups linked to them (teaches_group).

create or replace function public.ufuq_create_exam_draft(
  p_group_code text,
  p_level smallint,
  p_title text,
  p_duration_minutes int,
  p_questions jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_exam_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  q jsonb;
  v_i int := 0;
begin
  if auth.uid() is null or not public.ufuq_is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  if not public.teaches_group(p_group_code) then
    raise exception 'GROUP_NOT_LINKED';
  end if;
  if p_level is null or p_level < 1 or p_level > 11 then
    raise exception 'EXAM_LEVEL_REQUIRED';
  end if;
  if v_title = '' then
    raise exception 'EXAM_TITLE_REQUIRED';
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'EXAM_NEEDS_QUESTIONS';
  end if;

  insert into public.written_exams (group_code, title, level, duration_minutes, is_published, created_by)
  values (p_group_code, v_title, p_level, p_duration_minutes, false, auth.uid())
  returning id into v_exam_id;

  for q in select value from jsonb_array_elements(p_questions) loop
    if (q->>'type') not in ('short_answer', 'matching', 'antonym', 'grammar', 'essay') then
      raise exception 'BAD_QUESTION_TYPE';
    end if;
    if btrim(coalesce(q->>'question_text', '')) = '' then
      raise exception 'QUESTION_TEXT_REQUIRED';
    end if;
    insert into public.written_exam_questions (exam_id, order_num, type, question_text, criteria_text)
    values (v_exam_id, v_i, q->>'type', left(q->>'question_text', 4000), left(coalesce(q->>'criteria_text', ''), 4000));
    v_i := v_i + 1;
  end loop;

  return v_exam_id;
end $$;

revoke all on function public.ufuq_create_exam_draft(text, smallint, text, int, jsonb) from public;
grant execute on function public.ufuq_create_exam_draft(text, smallint, text, int, jsonb) to authenticated;
