-- Student and exam levels go from 8 / 11 up to 12. Safe to run more than once.

-- 1) profiles.level: drop whatever check constraint(s) limit it (name unknown), then allow 1..12.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.profiles'::regclass and con.contype = 'c' and a.attname = 'level'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_level_check check (level between 1 and 12);

-- 2) Server-side validation in the update function (status/level: main admin anywhere, others only their own groups).
create or replace function public.admin_update_student(p_user_id uuid, p_status profile_status default null, p_level integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_teacher()) then
    raise exception 'Faqat o''qituvchilar bu amalni bajara oladi.';
  end if;
  if p_level is not null and (p_level < 1 or p_level > 12) then
    raise exception 'Daraja 1 dan 12 gacha bo''lishi kerak.';
  end if;
  if not public.is_super_admin() and not exists (
    select 1 from public.group_members gm where gm.user_id = p_user_id and public.teaches_group(gm.group_code)
  ) then
    raise exception 'Bu talaba sizning guruhingizga tegishli emas.';
  end if;
  update public.profiles set status = coalesce(p_status, status), level = coalesce(p_level, level), updated_at = now() where id = p_user_id;
end $$;

-- 3) Written exams: level 1..12.
alter table public.written_exams drop constraint if exists written_exams_level_check;
alter table public.written_exams add constraint written_exams_level_check check (level is null or level between 1 and 12);

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
  if p_level is null or p_level < 1 or p_level > 12 then raise exception 'EXAM_LEVEL_REQUIRED'; end if;
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

notify pgrst, 'reload schema';

-- 4) New group in the admin panel: make sure the join-code generator exists and works (idempotent).
--    Called right after a group is created; returns the group's 7-character join code (keeps an existing one).
drop function if exists public.generate_group_join_code(text);
create function public.generate_group_join_code(p_group_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not (public.is_admin() or public.is_teacher()) then
    raise exception 'Faqat o''qituvchilar bu amalni bajara oladi.';
  end if;
  if not public.teaches_group(p_group_code) then
    raise exception 'Bu guruh sizga biriktirilmagan.';
  end if;
  select a.code into v from public.group_access_codes a where a.group_code = p_group_code limit 1;
  if v is not null then return v; end if;
  loop
    v := public._new_join_code();
    exit when not exists (select 1 from public.group_access_codes a where a.code = v)
          and not exists (select 1 from public.groups g where g.code = v);
  end loop;
  insert into public.group_access_codes (group_code, code) values (p_group_code, v);
  return v;
end $$;
revoke all on function public.generate_group_join_code(text) from public, anon;
grant execute on function public.generate_group_join_code(text) to authenticated;

notify pgrst, 'reload schema';
