-- Level 3 midterm: the 5 listening questions (Gemini fusha audio in public/listening/level3/g) appended to every midterm paper of the level that has none. Idempotent.
do $do$ declare ex record; q jsonb; qid uuid; n int; items jsonb := $j$[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level3/g/midterm-1.mp3\n@@opts: مِئَةَ رِيَال|خَمْسِينَ رِيَالاً|ثَمَانِينَ رِيَالاً\nكَمْ رِيَالاً يُرِيدُ أَحْمَد؟","criteria":"مِئَةَ رِيَال"},{"text":"@@audio: /listening/level3/g/midterm-2.mp3\n@@opts: بِخَمْسَةِ رِيَالَات|بِثَلَاثَةِ رِيَالَات|بِتِسْعَةِ رِيَالَات\nبِكَمْ عُلْبَةُ البُنّ؟","criteria":"بِثَلَاثَةِ رِيَالَات"},{"text":"@@audio: /listening/level3/g/midterm-3.mp3\n@@opts: سِتُّونَ رِيَالاً|ثَمَانُونَ رِيَالاً|سَبْعُونَ رِيَالاً\nكَمْ رِيَالاً المَطْلُوب؟","criteria":"سَبْعُونَ رِيَالاً"},{"text":"@@audio: /listening/level3/g/midterm-4.mp3\n@@opts: دَافِئ|بَارِد|حَارٌّ جِدّاً\nكَيْفَ الجَوُّ فِي دِمَشْقَ اليَوْم؟","criteria":"دَافِئ"},{"text":"@@audio: /listening/level3/g/midterm-5.mp3\n@@opts: فِي لَنْدَن|فِي مِصْر|فِي دِمَشْق\nأَيْنَ يَقْضِي أَحْمَدُ عُطْلَةَ الصَّيْف؟","criteria":"فِي مِصْر"}]$j$::jsonb;
begin
 for ex in select id from public.written_exams where level=3 and exam_kind='midterm' loop
  if exists (select 1 from public.written_exam_questions where exam_id=ex.id and question_text like '%@@audio:%') then continue; end if;
  select coalesce(max(order_num),-1)+1 into n from public.written_exam_questions where exam_id=ex.id;
  for q in select value from jsonb_array_elements(items) loop
   insert into public.written_exam_questions(exam_id, order_num, type, question_text) values (ex.id, n, 'short_answer', q->>'text') returning id into qid;
   insert into public.written_exam_criteria(question_id, criteria_text) values (qid, q->>'criteria');
   n := n+1;
  end loop;
 end loop;
end $do$;
