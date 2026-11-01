-- Stage 4 (security pass): the remaining "all groups" shortcuts also apply to the MAIN admin only.
-- Ordinary admins and teachers reach just the groups linked to them in teacher_groups. Safe to run more than once.

create or replace function public.is_group_manager(p_group_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teacher_groups tg where tg.group_code = p_group_code and tg.teacher_id = auth.uid())
      or public.is_super_admin();
$$;

create or replace function public.my_teacher_group_codes()
returns setof text language sql stable security definer set search_path = public as $$
  select code from public.groups where public.is_super_admin()
  union select group_code from public.teacher_groups where teacher_id = auth.uid();
$$;

-- Used by the media / hifz policies as "unrestricted admin".
create or replace function public.ufuq_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin();
$$;
