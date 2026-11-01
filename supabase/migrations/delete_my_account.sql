-- Self-service account deletion (Privacy Policy §7). Deletes the caller's auth user; almost every table
-- cascades from auth.users. Tables without a cascading FK are cleaned explicitly. Admins cannot delete
-- themselves here (avoids locking the platform out) — they must be demoted first.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.profiles where id = uid and role = 'admin') then
    raise exception 'admin_cannot_self_delete';
  end if;
  delete from public.voice_chat_messages where user_id = uid;
  delete from public.hifz_attempts where student_id = uid;
  delete from public.group_slots where user_id = uid;
  delete from public.group_members where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
