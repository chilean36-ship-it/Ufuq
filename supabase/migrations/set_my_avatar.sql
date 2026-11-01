-- Profile photo fallback.
-- If `profiles` has a restrictive RLS policy, a plain UPDATE of avatar_url can touch 0 rows without raising an error
-- (the photo then "disappears" after you leave the page). This function lets a signed-in user change ONLY their own
-- avatar_url, without opening up the rest of the row (role, level, status…) to updates.
create or replace function public.set_my_avatar(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles set avatar_url = p_url where id = auth.uid();
  -- classmate lists read the photo from group_members, keep it in step (no-op if the user has no membership)
  update public.group_members set avatar_url = p_url where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;
