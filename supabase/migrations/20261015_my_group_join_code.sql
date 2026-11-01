-- Student "Manage Group" dialog: show the code students actually type to join (group_access_codes.code),
-- not the internal groups.code. Students cannot read group_access_codes (teacher-only RLS), so this returns it
-- only to a member of that group. Falls back to the internal code when the group has no join-code row.
-- STATUS: APPLIED to project "ldbthwpikixtykwmvudy" (2026-10-15) as "my_group_join_code".
create or replace function public.my_group_join_code(p_group_code text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.group_members m where m.user_id = auth.uid() and m.group_code = p_group_code)
      then coalesce((select a.code from public.group_access_codes a where a.group_code = p_group_code limit 1), p_group_code)
    else null
  end;
$function$;

revoke all on function public.my_group_join_code(text) from public, anon;
grant execute on function public.my_group_join_code(text) to authenticated;
