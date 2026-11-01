-- Security hardening (2026-10-13). Safe to run more than once. Run in the Supabase SQL editor.
-- Nothing here changes how the site works for honest users; it closes doors that should never have been open.

-- 1) Roles can only be changed by an administrator -------------------------------------------------------------
--    20261007 already stops non-main-admins from creating admins; this also stops anyone but an admin from
--    promoting themselves (e.g. student -> teacher) with a plain `update profiles set role = ...`.
--    auth.uid() is null for the SQL editor / service role, so migrations and dashboard edits keep working.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only an administrator can change a role';
  end if;
  return new;
end $$;
revoke all on function public.guard_profile_role() from public, anon, authenticated;
drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role before update on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.guard_profile_role();

-- 2) Signed-in-only RPCs: Postgres gives EXECUTE to PUBLIC (= anon too) by default ----------------------------
--    Every function below already checks auth.uid(), so this is defence in depth: signed-out callers are refused
--    before any code runs. Missing functions are skipped, so the order of migrations does not matter.
do $$
declare f text;
begin
  foreach f in array array[
    'public.start_exam_attempt(text)',
    'public.log_exam_violation(text,text,text,integer)',
    'public.exam_violation_summary(text,text)',
    'public.group_exam_ranking(text)',
    'public.submit_exam(uuid,jsonb)',
    'public.is_super_admin()',
    'public.is_standard_admin()',
    'public.admin_list_admins()',
    'public.admin_appoint(text,text)',
    'public.admin_set_tier(uuid,text)',
    'public.admin_revoke(uuid)',
    'public.admin_set_role(uuid,public.app_role)',
    'public.join_group(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

-- 3) Exam violation log: stop a signed-in user from flooding the table ----------------------------------------
create or replace function public.log_exam_violation(p_exam_type text, p_exam_id text, p_kind text, p_count int)
returns void language sql security definer set search_path = public as $$
  insert into public.exam_violations (user_id, exam_type, exam_id, kind, count)
  select auth.uid(), p_exam_type, left(p_exam_id, 64), left(p_kind, 20), least(greatest(1, coalesce(p_count, 1)), 50)
  where auth.uid() is not null
    and (select count(*) from public.exam_violations v
         where v.user_id = auth.uid() and v.created_at > now() - interval '1 minute') < 60;
$$;
revoke all on function public.log_exam_violation(text,text,text,int) from public, anon;
grant execute on function public.log_exam_violation(text,text,text,int) to authenticated;

-- 4) A class link must be a web link ----------------------------------------------------------------------------
--    The site now refuses to open anything but http(s) links, and the database refuses to store anything else.
--    NOT VALID = existing rows are left alone, every new or edited row is checked.
do $$
begin
  if to_regclass('public.groups') is not null
     and not exists (select 1 from pg_constraint where conname = 'groups_zoom_link_http') then
    alter table public.groups
      add constraint groups_zoom_link_http check (zoom_link is null or zoom_link ~* '^https?://') not valid;
  end if;
end $$;
