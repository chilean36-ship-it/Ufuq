-- Level 1 midterm / final: give every original exercise group its own section again (the papers were stored as one flat list,
-- so the editor showed them as a single section). Text is untouched except that the leading label that now lives in the section/part
-- heading (المفردات / القواعد / الإملاء / الخط) is removed. Boundaries are the same in all 8 copies of each paper. Idempotent.
with m(kind, ord, part, sec) as (values
 ('midterm',0,'','القراءة: اقرأ النص ثم أجب عن الأسئلة'),
 ('midterm',5,'المفردات','ضع الكلمة في جملة من عندك'),
 ('midterm',10,'','هات جمع الكلمة ثم ضعها في جملة من عندك'),
 ('midterm',15,'القواعد','اختر الإجابة الصحيحة'),
 ('midterm',20,'','صحح الخطأ في الجملة'),
 ('midterm',24,'','صرّف الفعل مع الضمائر'),
 ('midterm',27,'','الإملاء'),
 ('midterm',28,'','الخط'),
 ('final',0,'','القراءة: اقرأ النص ثم أجب عن الأسئلة'),
 ('final',5,'المفردات','اكتب ضد الكلمة وضعها في جملة'),
 ('final',10,'','هات جمع الكلمة ثم ضعها في جملة من عندك'),
 ('final',15,'','ضع الكلمة في جملة من عندك'),
 ('final',20,'القواعد','اختر الإجابة الصحيحة'),
 ('final',25,'','صحح الخطأ في الجملة'),
 ('final',30,'','الإملاء'),
 ('final',31,'','الخط'))
update public.written_exam_questions q set question_text =
  (case when m.part <> '' then '@@part: ' || m.part || E'\n' else '' end) || '@@sec: ' || m.sec || E'\n' ||
  regexp_replace(regexp_replace(q.question_text, '^(@@(sec|part):[^\n]*\n)+', ''), '^(المفردات|القواعد|الإملاء|الخط): ', '')
from public.written_exams e, m
where q.exam_id = e.id and e.level = 1 and e.exam_kind = m.kind and q.order_num = m.ord and q.question_text not like '%@@audio:%';
