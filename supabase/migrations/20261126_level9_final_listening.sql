-- Level 9 final: the 5 listening questions (Gemini fusha audio in public/listening/level9/g) appended to every final paper of the level that has none. Idempotent.
do $do$ declare ex record; q jsonb; qid uuid; n int; items jsonb := $j$[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level9/g/final-1.mp3\n@@opts: مَمْنُوعِينَ مِنَ السَّفَر|أَحْرَاراً يَتَجَوَّلُونَ لِطَلَبِ العِلْم|فُقَرَاءَ لَا يَعْمَلُون\nكَيْفَ كَانَ العُلَمَاءُ فِي ذَلِكَ الوَقْت؟","criteria":"أَحْرَاراً يَتَجَوَّلُونَ لِطَلَبِ العِلْم"},{"text":"@@audio: /listening/level9/g/final-2.mp3\n@@opts: فِي الكِيمْيَاء|فِي عِلْمِ الِاجْتِمَاع|فِي الرِّيَاضِيَّات\nفِي أَيِّ عِلْمٍ نَبَغَ الخَوَارِزْمِيّ؟","criteria":"فِي الرِّيَاضِيَّات"},{"text":"@@audio: /listening/level9/g/final-3.mp3\n@@opts: مِنْ تُرْكِيَا|مِنْ بَاكِسْتَان|مِنَ المَغْرِبِ العَرَبِيّ\nمِنْ أَيْنَ جَاءَ أَكْثَرُ المُهَاجِرِينَ إِلَى أَلْمَانِيَا؟","criteria":"مِنْ تُرْكِيَا"},{"text":"@@audio: /listening/level9/g/final-4.mp3\n@@opts: القُرْآنُ الكَرِيم|السُّنَّةُ النَّبَوِيَّة|أَقْوَالُ العُلَمَاء\nمَا المَصْدَرُ الثَّانِي لِلتَّشْرِيعِ الإِسْلَامِيّ؟","criteria":"السُّنَّةُ النَّبَوِيَّة"},{"text":"@@audio: /listening/level9/g/final-5.mp3\n@@opts: لِأَنَّ الوَرَقَ قَلِيل|لِأَنَّ الصَّحَابَةَ لَا يَكْتُبُون|خَوْفَ الخَلْطِ بَيْنَهُمَا\nلِمَاذَا مُنِعَتْ كِتَابَةُ الحَدِيثِ مَعَ القُرْآنِ فِي كِتَابٍ وَاحِد؟","criteria":"خَوْفَ الخَلْطِ بَيْنَهُمَا"}]$j$::jsonb;
begin
 for ex in select id from public.written_exams where level=9 and exam_kind='final' loop
  if exists (select 1 from public.written_exam_questions where exam_id=ex.id and question_text like '%@@audio:%') then continue; end if;
  select coalesce(max(order_num),-1)+1 into n from public.written_exam_questions where exam_id=ex.id;
  for q in select value from jsonb_array_elements(items) loop
   insert into public.written_exam_questions(exam_id, order_num, type, question_text) values (ex.id, n, 'short_answer', q->>'text') returning id into qid;
   insert into public.written_exam_criteria(question_id, criteria_text) values (qid, q->>'criteria');
   n := n+1;
  end loop;
 end loop;
end $do$;
