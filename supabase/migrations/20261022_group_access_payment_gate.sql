-- 20261022 — Group join code + group content follow the payment state (students AND standard admins alike).
-- 1) Not paid + not in a group: join_group() already raises PAYMENT_REQUIRED (20261019); the client never asks for a code.
-- 2) Paid: everything works as before.
-- 3) Was in a group, plan ended: membership is KEPT (group_members is not touched) but group content is closed
--    until the plan is paid again. Teachers and main admins always pass (user_has_access). Safe to run more than once.

create or replace function public.my_group_access_ok() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.user_has_access(auth.uid());
$$;
revoke all on function public.my_group_access_ok() from public, anon;
grant execute on function public.my_group_access_ok() to authenticated;

-- The student-facing join code is shown only to a member whose plan is active.
create or replace function public.my_group_join_code(p_group_code text) returns text
language sql stable security definer set search_path to 'public' as $$
  select case
    when auth.uid() is null then null
    when not public.user_has_access(auth.uid()) then null
    when exists (select 1 from public.group_members m where m.user_id = auth.uid() and m.group_code = p_group_code)
      then coalesce((select a.code from public.group_access_codes a where a.group_code = p_group_code limit 1), p_group_code)
    else null
  end;
$$;
revoke all on function public.my_group_join_code(text) from public, anon;
grant execute on function public.my_group_join_code(text) to authenticated;

-- Group content: a RESTRICTIVE policy is ANDed with the existing ones, so nothing else changes for paid users.
do $$
declare t text;
begin
  foreach t in array array[
    'group_messages','group_message_reactions','group_chat_reads','tasks','task_submissions',
    'attendance_sessions','attendance_records','audio_lessons','group_media','group_media_targets',
    'hifz_assignments','hifz_attempts'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_paid_only', t);
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.my_group_access_ok()) with check (public.my_group_access_ok())', t || '_paid_only', t);
    end if;
  end loop;
end $$;
