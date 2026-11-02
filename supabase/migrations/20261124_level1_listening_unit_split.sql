-- Level 1 = units 1-4 of the book (midterm: units 1-2, final: units 3-4), Level 2 = units 5-8. The listening of the Level 1 papers is re-set to that split:
-- questions are updated in place (answers of existing submissions are kept); the surplus listening rows are removed. Only questions that already have audio are kept for now.
do $do$ declare ex record; r record; payload jsonb := $j${"final":[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level1/level1-final-1.mp3\n@@opts: ثَلَاثُ غُرَف|أَرْبَعُ غُرَف|خَمْسُ غُرَف\nكَمْ غُرْفَةً فِي البَيْتِ؟","criteria":"ثَلَاثُ غُرَف"},{"text":"@@audio: /listening/level1/level1-final-2.mp3\n@@opts: مُبَكِّراً|مُتَأَخِّراً|عِنْدَ الفَجْر\nمَتَى يَسْتَيْقِظُ طَارِق يَوْمَ العُطْلَة؟","criteria":"مُتَأَخِّراً"},{"text":"@@audio: /listening/level1/level1-final-3.mp3\n@@opts: أَذْهَبُ بِالحَافِلَة|أَسْتَيْقِظُ مُبَكِّراً|أَقْرَأُ القُرْآن\nاخْتَرِ الجَوَابَ المُنَاسِب.","criteria":"أَقْرَأُ القُرْآن"}],"midterm":[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level1/level1-midterm-1.mp3\n@@opts: مِنْ سُورِيَا|مِنْ مِصْرَ|مِنْ تُرْكِيَا\nمِنْ أَيْنَ زَيْنَب؟","criteria":"مِنْ مِصْرَ"},{"text":"@@audio: /listening/level1/level1-midterm-2.mp3\n@@opts: طَبِيب|مُدَرِّس|مُهَنْدِس\nمَا مِهْنَةُ وَالِدِ عَلِيّ؟","criteria":"مُهَنْدِس"}]}$j$::jsonb; items jsonb; k int; begin
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
 end loop;
end $do$;
