-- Stage 3 (zero-bug pass): Supabase security advisor fixes. Applied to live 2026-10-26. Safe to run more than once.
-- Admin helpers are signed-in only (the admin panel calls them after login; the RLS policies run as authenticated).
begin;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
revoke all on function public.is_standard_admin() from public, anon;
grant execute on function public.is_standard_admin() to authenticated;
do $$
begin
  if to_regprocedure('public.ufuq_member_avatar()') is not null then
    revoke all on function public.ufuq_member_avatar() from public, anon;
    grant execute on function public.ufuq_member_avatar() to authenticated;
  end if;
  if to_regprocedure('public.ufuq_mirror_avatar()') is not null then
    revoke all on function public.ufuq_mirror_avatar() from public, anon;
    grant execute on function public.ufuq_mirror_avatar() to authenticated;
  end if;
  if to_regprocedure('public._audit_block_mutation()') is not null then
    alter function public._audit_block_mutation() set search_path = public;
  end if;
end $$;
commit;
