-- APPLIED to project "ldbthwpikixtykwmvudy" (2026-10-12) as migration "set_my_name". Kept here for the record.
-- One function that changes a person's display name everywhere it is stored.
create or replace function public.set_my_name(p_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(n) < 2 or char_length(n) > 60 then raise exception 'INVALID_NAME'; end if;

  update public.profiles set full_name = n, updated_at = now() where id = uid;

  update public.group_members           set name         = n where user_id   = uid and name         is distinct from n;
  update public.group_slots             set student_name = n where user_id   = uid and student_name is distinct from n;
  update public.group_messages          set sender_name  = n where sender_id = uid and sender_name  is distinct from n;
  update public.group_chat_reads        set user_name    = n where user_id   = uid and user_name    is distinct from n;
  update public.group_message_reactions set user_name    = n where user_id   = uid and user_name    is distinct from n;

  return n;
end;
$function$;

revoke all on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
