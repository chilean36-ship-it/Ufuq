-- Audio darslar faqat o'z guruhi a'zolari (va guruh ustozi/admin) uchun ko'rinadi.
drop policy if exists audio_lessons_select_authenticated on public.audio_lessons;
create policy audio_lessons_select_group on public.audio_lessons
  for select to authenticated
  using (group_code is null or group_code in (select public.my_group_codes()) or public.teaches_group(group_code));
