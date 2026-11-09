-- APPLIED to live (ldbthwpikixtykwmvudy) on 2026-11-09 via MCP, with the owner's approval. Kept so the repo matches production.
-- Lesson audio in the Supabase bucket "lesson-audio" was readable by EVERY signed-in user (policy lesson_audio_read_all),
-- and since sign-up needs no email confirmation, anyone could register and download every group's lessons.
-- Files live at <group_code>/<file>; now only that group's members (and its series), its teachers, and a "global" folder.
-- Verified: a member of 24861 sees 1 object, a student of another group sees 0.
-- Note: most lesson audio is actually served from the public R2 bucket (pub-…r2.dev, ufuq-audio-uploader worker);
-- that copy is still public by URL and can only be closed in Cloudflare.

drop policy if exists lesson_audio_read_all on storage.objects;
drop policy if exists lesson_audio_read_group on storage.objects;
create policy lesson_audio_read_group on storage.objects for select to authenticated
using (
  bucket_id = 'lesson-audio' and (
    (storage.foldername(name))[1] = 'global'
    or (storage.foldername(name))[1] in (select public.my_group_codes())
    or (storage.foldername(name))[1] in (select public.ufuq_my_series_codes())
    or public.teaches_group((storage.foldername(name))[1])
  )
);
