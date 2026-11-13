-- Level 2 final: the 5 listening questions (Gemini fusha audio in public/listening/level2/g) appended to every final paper of the level that has none. Idempotent.
do $do$ declare ex record; q jsonb; qid uuid; n int; items jsonb := $j$[{"text":"@@sec: الاستماع: استمع إلى الصوت ثم اختر الإجابة الصحيحة\n@@audio: /listening/level2/g/final-1.mp3\n@@opts: فِي شَهْرِ رَمَضَان|فِي شَهْرِ شَعْبَان|يَوْمَ الخَمِيس\nمَتَى يَنْتَهِي العَامُ الدِّرَاسِيّ؟","criteria":"فِي شَهْرِ رَمَضَان"},{"text":"@@audio: /listening/level2/g/final-2.mp3\n@@opts: فِي كُلِّيَّةِ التَّرْبِيَة|فِي كُلِّيَّةِ الطِّبّ|فِي كُلِّيَّةِ الهَنْدَسَة\nفِي أَيِّ كُلِّيَّةٍ تَدْرُسُ نَدَى؟","criteria":"فِي كُلِّيَّةِ الطِّبّ"},{"text":"@@audio: /listening/level2/g/final-3.mp3\n@@opts: سَبْعُ حِصَص|خَمْسُ حِصَص|سِتُّ حِصَص\nكَمْ حِصَّةً يَدْرُسُ غَسَّانُ فِي اليَوْم؟","criteria":"سِتُّ حِصَص"},{"text":"@@audio: /listening/level2/g/final-4.mp3\n@@opts: طَيَّاراً|مُهَنْدِساً|مُمَرِّضاً\nمَاذَا سَيَعْمَلُ الطَّالِبُ الَّذِي يَدْرُسُ الطَّيَرَان؟","criteria":"طَيَّاراً"},{"text":"@@audio: /listening/level2/g/final-5.mp3\n@@opts: ثَلَاثَةُ أَطْفَال|خَمْسَةُ أَطْفَال|سِتَّةُ أَطْفَال\nكَمْ طِفْلاً لِمَرْيَم؟","criteria":"خَمْسَةُ أَطْفَال"}]$j$::jsonb;
begin
 for ex in select id from public.written_exams where level=2 and exam_kind='final' loop
  if exists (select 1 from public.written_exam_questions where exam_id=ex.id and question_text like '%@@audio:%') then continue; end if;
  select coalesce(max(order_num),-1)+1 into n from public.written_exam_questions where exam_id=ex.id;
  for q in select value from jsonb_array_elements(items) loop
   insert into public.written_exam_questions(exam_id, order_num, type, question_text) values (ex.id, n, 'short_answer', q->>'text') returning id into qid;
   insert into public.written_exam_criteria(question_id, criteria_text) values (qid, q->>'criteria');
   n := n+1;
  end loop;
 end loop;
end $do$;
