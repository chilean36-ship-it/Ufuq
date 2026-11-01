-- Account deletion for EVERY role + anonymous exit survey.
--
-- Already applied on the live project:  account_deletions table (RLS: only main admins can read) and record_deletion_feedback(reason, details).
-- NOT applied yet (the SQL tool refused to create a function that erases user data — run this file once in the Supabase SQL editor):
--   delete_my_account(p_reason, p_details)   erases the caller (student / teacher / admin) and everything tied to them.
-- Until it is applied the app falls back to the old delete_my_account() (students and teachers work; admins get a friendly message).

create or replace function public.delete_my_account(p_reason text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_role text; v_tier text; v_had_group boolean;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'not_given');
begin
  if uid is null then raise exception 'not signed in'; end if;
  select role, admin_tier into v_role, v_tier from public.profiles where id = uid;
  -- the platform must never be left without a main admin
  if v_role = 'admin' and coalesce(v_tier, 'super') = 'super'
     and not exists (select 1 from public.profiles p where p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super' and p.id <> uid) then
    raise exception 'last_admin_cannot_delete';
  end if;
  v_had_group := exists (select 1 from public.group_members where user_id = uid) or exists (select 1 from public.teacher_groups where teacher_id = uid);
  insert into public.account_deletions (role, reason, details, had_group)
    values (coalesce(v_role, 'student'), left(v_reason, 40), left(nullif(trim(coalesce(p_details, '')), ''), 1000), v_had_group);

  delete from public.voice_chat_messages where user_id = uid;
  delete from public.hifz_attempts where student_id = uid;
  update public.hifz_attempts set reviewed_by = null where reviewed_by = uid;
  delete from public.hifz_assignments where student_id = uid;
  delete from public.group_slots where user_id = uid;
  delete from public.group_members where user_id = uid;
  delete from public.group_chat_reads where user_id = uid;
  delete from public.group_message_reactions where user_id = uid;
  delete from public.group_messages where sender_id = uid;
  delete from public.written_exam_submissions where user_id = uid;
  delete from public.exam_violations where user_id = uid;
  delete from public.task_submissions where user_id = uid;
  delete from public.attendance_records where user_id = uid;
  delete from public.student_progress where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.ai_chat_messages where user_id = uid;
  delete from public.ai_chats where user_id = uid;
  delete from public.dictionary_favorites where user_id = uid;
  delete from public.saved_lessons where user_id = uid;
  delete from public.saved_photos where user_id = uid;
  delete from public.teacher_groups where teacher_id = uid;
  delete from auth.users where id = uid;     -- profile and the rest cascade
end $$;

revoke all on function public.delete_my_account(text, text) from public, anon;
grant execute on function public.delete_my_account(text, text) to authenticated;

-- (already applied) feedback table + recorder:
-- create table public.account_deletions (id bigserial primary key, role text, reason text not null, details text, had_group boolean default false, created_at timestamptz not null default now());
-- alter table public.account_deletions enable row level security;
-- create policy "admins read deletion feedback" on public.account_deletions for select to authenticated using (public.is_super_admin());
-- create function public.record_deletion_feedback(p_reason text, p_details text) ...
