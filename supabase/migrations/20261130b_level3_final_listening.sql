-- Level 3 final: the 5 listening questions (Gemini fusha audio in public/listening/level3/g) appended to every final paper of the level that has none. Idempotent.
do $do$ declare ex record; q jsonb; qid uuid; n int; items jsonb := $j$[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level3/g/final-1.mp3\n@@opts: لِلْعَمَل|لِلدِّرَاسَة|لِلزِّيَارَة\nلِمَاذَا حَضَرَ بَدْرٌ؟","criteria":"لِلدِّرَاسَة"},{"text":"@@audio: /listening/level3/g/final-2.mp3\n@@opts: ثَلَاثَ سَاعَات|عَشْرَ دَقَائِق|سَاعَةً وَاحِدَةً تَقْرِيباً\nكَمْ تَسْتَغْرِقُ الرِّحْلَةُ مِنْ مَكَّةَ إِلَى جُدَّةَ بِالسَّيَّارَة؟","criteria":"سَاعَةً وَاحِدَةً تَقْرِيباً"},{"text":"@@audio: /listening/level3/g/final-3.mp3\n@@opts: أَذْهَبُ إِلَى شَاطِئِ البَحْر|نَعَم، تَذْهَبُ الأُسْرَةُ مَعِي|هِوَايَتِي القِرَاءَة\nاخْتَرِ الجَوَابَ المُنَاسِب.","criteria":"أَذْهَبُ إِلَى شَاطِئِ البَحْر"},{"text":"@@audio: /listening/level3/g/final-4.mp3\n@@opts: الصُّحُفَ وَالمَجَلَّات|الكُتُبَ الإِسْلَامِيَّة|الكُتُبَ العِلْمِيَّة\nمَاذَا يَقْرَأُ جَابِر؟","criteria":"الكُتُبَ الإِسْلَامِيَّة"},{"text":"@@audio: /listening/level3/g/final-5.mp3\n@@opts: جَمْعِيَّةَ الخَطِّ العَرَبِيّ|جَمْعِيَّةَ السِّبَاحَة|جَمْعِيَّةَ التَّدْبِيرِ المَنْزِلِيّ\nأَيَّ جَمْعِيَّةٍ تَخْتَارُ زَيْنَب؟","criteria":"جَمْعِيَّةَ التَّدْبِيرِ المَنْزِلِيّ"}]$j$::jsonb;
begin
 for ex in select id from public.written_exams where level=3 and exam_kind='final' loop
  if exists (select 1 from public.written_exam_questions where exam_id=ex.id and question_text like '%@@audio:%') then continue; end if;
  select coalesce(max(order_num),-1)+1 into n from public.written_exam_questions where exam_id=ex.id;
  for q in select value from jsonb_array_elements(items) loop
   insert into public.written_exam_questions(exam_id, order_num, type, question_text) values (ex.id, n, 'short_answer', q->>'text') returning id into qid;
   insert into public.written_exam_criteria(question_id, criteria_text) values (qid, q->>'criteria');
   n := n+1;
  end loop;
 end loop;
end $do$;
