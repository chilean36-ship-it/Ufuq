-- NOT YET APPLIED (adds data: needs the owner's go-ahead).
-- The Level 7 midterm existed only under Group A8; every other group already holds its own (empty draft) Level 7 final but had no
-- Level 7 midterm. This copies A8's midterm (exam row + questions + answer keys) as an UNPUBLISHED draft into the class / individual
-- groups that miss it, so every group lists the same exams. Nothing is published and no student sees these copies.
do $$
declare src public.written_exams%rowtype; g record; new_exam uuid; q record; new_q uuid;
begin
  select * into src from public.written_exams where id = '1e5da25c-4ba1-428b-b207-6d389503d030' and exam_kind = 'midterm' and level = 7;
  if not found then raise notice 'source midterm not found'; return; end if;
  for g in select gr.code from public.groups gr
            where gr.code <> src.group_code
              and exists (select 1 from public.written_exams f where f.group_code = gr.code and f.exam_kind = 'final' and f.level = 7)   -- groups that already hold the Level 7 final copy
  loop
    if exists (select 1 from public.written_exams e where e.group_code = g.code and e.exam_kind = 'midterm' and e.level = 7) then continue; end if;
    insert into public.written_exams (group_code, title, is_published, created_by, duration_minutes, level, exam_kind, deadline_at)
      values (g.code, src.title, false, src.created_by, src.duration_minutes, src.level, src.exam_kind, null) returning id into new_exam;
    for q in select * from public.written_exam_questions where exam_id = src.id order by order_num loop
      insert into public.written_exam_questions (exam_id, order_num, type, question_text) values (new_exam, q.order_num, q.type, q.question_text) returning id into new_q;
      insert into public.written_exam_criteria (question_id, criteria_text) select new_q, c.criteria_text from public.written_exam_criteria c where c.question_id = q.id;
    end loop;
  end loop;
end $$;