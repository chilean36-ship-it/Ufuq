-- NOT APPLIED. Performance only: no rule changes, nothing a user can see. Apply in the morning (no classes), then
-- re-run the Supabase performance advisor. Safe to run more than once.
--
-- 1) auth.uid() inside these policies was evaluated once per row; wrapped in (select …) it is evaluated once per query.
--    ALTER POLICY keeps each policy's name, command, roles and permissive/restrictive kind.
alter policy orders_read_own on public.orders using (user_id = (select auth.uid()));
alter policy subs_read_own on public.subscriptions using (user_id = (select auth.uid()));
alter policy exams_students_published_only on public.written_exams using (
  is_published or public.ufuq_is_staff()
  or exists (select 1 from public.written_exam_submissions s where s.exam_id = written_exams.id and s.user_id = (select auth.uid())));
alter policy ai_chats_own_select on public.ai_chats using (user_id = (select auth.uid()));
alter policy ai_chats_own_insert on public.ai_chats with check (user_id = (select auth.uid()));
alter policy ai_chats_own_update on public.ai_chats using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy ai_chats_own_delete on public.ai_chats using (user_id = (select auth.uid()));
alter policy dictionary_favorites_sel on public.dictionary_favorites using (user_id = (select auth.uid()));
alter policy dictionary_favorites_ins on public.dictionary_favorites with check (user_id = (select auth.uid()));
alter policy dictionary_favorites_upd on public.dictionary_favorites using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy dictionary_favorites_del on public.dictionary_favorites using (user_id = (select auth.uid()));

-- 2) join_attempts has two identical indexes (join_attempts_user_idx = join_attempts_user_time). Keep one.
drop index if exists public.join_attempts_user_idx;

-- 3) Foreign keys without a covering index (deletes / joins on the parent scan the whole child table).
create index if not exists group_message_reactions_user_id_idx on public.group_message_reactions (user_id);
create index if not exists orders_plan_id_idx on public.orders (plan_id);
create index if not exists orders_reviewed_by_idx on public.orders (reviewed_by);
create index if not exists saved_photos_photo_id_idx on public.saved_photos (photo_id);
create index if not exists subscriptions_order_id_idx on public.subscriptions (order_id);
create index if not exists written_exam_extensions_user_id_idx on public.written_exam_extensions (user_id);
create index if not exists written_exam_staff_actions_submission_id_idx on public.written_exam_staff_actions (submission_id);
-- landing_media.updated_by is skipped: a handful of rows, never filtered by it.
