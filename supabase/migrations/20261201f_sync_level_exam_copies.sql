-- One level exam, one content: saving a level exam (midterm / final) in one group copies its title, questions and criteria to the same
-- level + kind exam of every other group. Duration, deadline and published state stay per group. Copies that already have
-- submissions are left alone (their papers must not change under the students). Safe to run more than once.
create or replace function public.staff_sync_level_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare src public.written_exams%rowtype; sib record; n_ok int := 0; n_skip int := 0;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  select * into src from public.written_exams where id = p_exam_id;
  if not found or src.exam_kind is null or src.level is null then return jsonb_build_object('synced', 0, 'skipped', 0); end if;

  for sib in select e.id from public.written_exams e
              where e.level = src.level and e.exam_kind = src.exam_kind and e.id <> src.id loop
    if exists (select 1 from public.written_exam_submissions s where s.exam_id = sib.id) then n_skip := n_skip + 1; continue; end if;

    update public.written_exams set title = src.title where id = sib.id and title is distinct from src.title;

    -- questions that no longer exist in the source
    delete from public.written_exam_questions q
     where q.exam_id = sib.id and q.order_num not in (select order_num from public.written_exam_questions where exam_id = src.id);
    -- same position: update in place; new position: insert
    update public.written_exam_questions q set type = s.type, question_text = s.question_text
      from public.written_exam_questions s
     where s.exam_id = src.id and q.exam_id = sib.id and q.order_num = s.order_num
       and (q.type is distinct from s.type or q.question_text is distinct from s.question_text);
    insert into public.written_exam_questions (exam_id, order_num, type, question_text)
    select sib.id, s.order_num, s.type, s.question_text from public.written_exam_questions s
     where s.exam_id = src.id
       and not exists (select 1 from public.written_exam_questions q where q.exam_id = sib.id and q.order_num = s.order_num);
    -- criteria follow the position too
    insert into public.written_exam_criteria (question_id, criteria_text, updated_at)
    select q.id, coalesce(c.criteria_text, ''), now()
      from public.written_exam_questions s
      join public.written_exam_questions q on q.exam_id = sib.id and q.order_num = s.order_num
      left join public.written_exam_criteria c on c.question_id = s.id
     where s.exam_id = src.id
    on conflict (question_id) do update set criteria_text = excluded.criteria_text, updated_at = now()
      where public.written_exam_criteria.criteria_text is distinct from excluded.criteria_text;
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('synced', n_ok, 'skipped', n_skip);
end $fn$;
revoke all on function public.staff_sync_level_exam(uuid) from public, anon;
grant execute on function public.staff_sync_level_exam(uuid) to authenticated;

notify pgrst, 'reload schema';
