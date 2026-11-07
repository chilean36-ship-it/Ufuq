-- Level 1 listening: the full 5+5 questions with the Gemini fusha audio (public/listening/level1/g). Existing listening rows are updated in place (submission answers kept), missing ones inserted.
do $do$ declare ex record; r record; payload jsonb := $j${"midterm":[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level1/g/midterm-1.mp3\n@@opts: مِنْ سُورِيَا|مِنْ مِصْرَ|مِنْ تُرْكِيَا\nمِنْ أَيْنَ زَيْنَب؟","criteria":"مِنْ مِصْرَ"},{"text":"@@audio: /listening/level1/g/midterm-2.mp3\n@@opts: خَالِد|مُحَمَّد|خَلِيل\nمَا اسْمُ الرَّجُلِ الثَّانِي؟","criteria":"خَلِيل"},{"text":"@@audio: /listening/level1/g/midterm-3.mp3\n@@opts: مُهَنْدِس|مُدَرِّس|طَبِيب\nمَا مِهْنَةُ صَدِيقِ أَحْمَد؟","criteria":"مُهَنْدِس"},{"text":"@@audio: /listening/level1/g/midterm-4.mp3\n@@opts: طَبِيب|مُهَنْدِس|مُدَرِّس\nمَا مِهْنَةُ وَالِدِ عَلِيّ؟","criteria":"مُهَنْدِس"},{"text":"@@audio: /listening/level1/g/midterm-5.mp3\n@@opts: فِي المَسْجِد|فِي المُصَلَّى|فِي الحَمَّام\nأَيْنَ سَعْد؟","criteria":"فِي الحَمَّام"}],"final":[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level1/g/final-1.mp3\n@@opts: فِي حَيِّ المَدِينَة|فِي حَيِّ الجَامِعَة|فِي حَيِّ المَطَار\nفِي أَيِّ حَيٍّ يَسْكُنُ حَسَّان؟","criteria":"فِي حَيِّ المَطَار"},{"text":"@@audio: /listening/level1/g/final-2.mp3\n@@opts: ثَلَاثُ غُرَف|أَرْبَعُ غُرَف|خَمْسُ غُرَف\nكَمْ غُرْفَةً فِي البَيْتِ؟","criteria":"ثَلَاثُ غُرَف"},{"text":"@@audio: /listening/level1/g/final-3.mp3\n@@opts: أَرِيكَةً وَسَجَّادَة|سَرِيراً وَسِتَارَة|فُرْناً وَثَلَّاجَة\nمَاذَا يُرِيدُ المُشْتَرِي لِغُرْفَةِ النَّوْم؟","criteria":"سَرِيراً وَسِتَارَة"},{"text":"@@audio: /listening/level1/g/final-4.mp3\n@@opts: مُبَكِّراً|عِنْدَ الفَجْر|مُتَأَخِّراً\nمَتَى يَسْتَيْقِظُ طَارِق يَوْمَ العُطْلَة؟","criteria":"مُتَأَخِّراً"},{"text":"@@audio: /listening/level1/g/final-5.mp3\n@@opts: أَقْرَأُ القُرْآن|أَسْتَيْقِظُ مُبَكِّراً|أَذْهَبُ بِالحَافِلَة\nاخْتَرِ الجَوَابَ المُنَاسِب.","criteria":"أَقْرَأُ القُرْآن"}]}$j$::jsonb; items jsonb; k int; n int; qid uuid; begin
 for ex in select id, exam_kind from public.written_exams where level=1 and exam_kind in ('midterm','final') loop
  items := payload->ex.exam_kind; k := 0;
  for r in select q.id from public.written_exam_questions q where q.exam_id=ex.id and q.question_text like '%@@audio:%' order by q.order_num loop
   if k < jsonb_array_length(items) then
    update public.written_exam_questions set question_text = items->k->>'text' where id = r.id;
    update public.written_exam_criteria set criteria_text = items->k->>'criteria' where question_id = r.id;
   else
    delete from public.written_exam_questions where id = r.id;
   end if;
   k := k + 1;
  end loop;
  select coalesce(max(order_num),-1)+1 into n from public.written_exam_questions where exam_id=ex.id;
  while k < jsonb_array_length(items) loop
   insert into public.written_exam_questions(exam_id, order_num, type, question_text) values (ex.id, n, 'short_answer', items->k->>'text') returning id into qid;
   insert into public.written_exam_criteria(question_id, criteria_text) values (qid, items->k->>'criteria');
   n := n+1; k := k+1;
  end loop;
 end loop;
end $do$;
