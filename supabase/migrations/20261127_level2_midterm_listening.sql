-- Level 2 midterm: the 5 listening questions (Gemini fusha audio in public/listening/level2/g) appended to every midterm paper of the level that has none. Idempotent.
do $do$ declare ex record; q jsonb; qid uuid; n int; items jsonb := $j$[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level2/g/midterm-1.mp3\n@@opts: وَجْبَةً وَاحِدَة|أَرْبَعَ وَجَبَات|ثَلَاثَ وَجَبَات\nكَمْ وَجْبَةً يَأْكُلُ سَالِمٌ فِي اليَوْم؟","criteria":"ثَلَاثَ وَجَبَات"},{"text":"@@audio: /listening/level2/g/midterm-2.mp3\n@@opts: الدَّجَاجُ وَالخُبْز|السَّمَكُ وَالأَرُزّ|اللَّحْمُ وَالسَّلَطَة\nمَاذَا تَطْلُبُ المُسَافِرَةُ مِنَ الطَّعَام؟","criteria":"الدَّجَاجُ وَالخُبْز"},{"text":"@@audio: /listening/level2/g/midterm-3.mp3\n@@opts: بِالسَّيَّارَة|بِالطَّائِرَة|بِالحَافِلَة\nكَيْفَ يُسَافِرُ صَالِحٌ إِلَى المَدِينَة؟","criteria":"بِالطَّائِرَة"},{"text":"@@audio: /listening/level2/g/midterm-4.mp3\n@@opts: لِأَنَّهُ مَرِيض|لِأَنَّ المَسْجِدَ بَعِيد|لِأَنَّهُ كَسْلَان\nلِمَاذَا لَا يُصَلِّي صَادِقٌ فِي المَسْجِد؟","criteria":"لِأَنَّهُ كَسْلَان"},{"text":"@@audio: /listening/level2/g/midterm-5.mp3\n@@opts: أُصَلِّي الفَجْرَ فِي البَيْت|أُصَلِّي الظُّهْرَ فِي المَسْجِد|أَذْهَبُ بِالسَّيَّارَة\nاخْتَرِ الجَوَابَ المُنَاسِب.","criteria":"أُصَلِّي الفَجْرَ فِي البَيْت"}]$j$::jsonb;
begin
 for ex in select id from public.written_exams where level=2 and exam_kind='midterm' loop
  if exists (select 1 from public.written_exam_questions where exam_id=ex.id and question_text like '%@@audio:%') then continue; end if;
  select coalesce(max(order_num),-1)+1 into n from public.written_exam_questions where exam_id=ex.id;
  for q in select value from jsonb_array_elements(items) loop
   insert into public.written_exam_questions(exam_id, order_num, type, question_text) values (ex.id, n, 'short_answer', q->>'text') returning id into qid;
   insert into public.written_exam_criteria(question_id, criteria_text) values (qid, q->>'criteria');
   n := n+1;
  end loop;
 end loop;
end $do$;
