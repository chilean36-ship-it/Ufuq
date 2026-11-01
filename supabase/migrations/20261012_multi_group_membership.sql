-- Bir o'quvchi bir nechta guruhga a'zo bo'la olsin.
-- STATUS: APPLIED to project "ldbthwpikixtykwmvudy" (2026-10-12) as "multi_group_membership" + hotfix "fix_join_group_ambiguous_group_code".
--
-- Why: group_members had UNIQUE(user_id) and join_group() deleted the student's old membership before
-- inserting the new one, so a student could only ever be in ONE group.
-- Already multi-group safe (checked, unchanged): my_group_codes(), ufuq_my_group_codes(), every RLS policy that
-- reads group_members (all use IN / EXISTS), trg_drop_waiting_slots (scoped by group_code), delete policy
-- (own rows by user_id, so the app deletes by user_id + group_code).
--
-- Rollback (only if no student is in 2+ groups yet):
--   alter table public.group_members add constraint group_members_user_id_unique unique (user_id);
--   -- and restore the old join_group() that starts with: DELETE FROM public.group_members WHERE user_id = auth.uid();

begin;

-- 1) One row per (student, group) instead of one row per student.
create unique index if not exists group_members_user_group_unique
  on public.group_members (user_id, group_code);

alter table public.group_members drop constraint if exists group_members_user_id_unique;

-- 2) join_group(): ADD the group, keep the student's other groups. Joining a group you are already in is a no-op.
create or replace function public.join_group(p_code text)
returns table(group_code text, group_name text, group_schedule text, group_zoom_link text, group_schedule_days jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
    v_group public.groups%rowtype;
    v_user_name text;
    v_code text;
    v_group_code text;
begin
    if auth.uid() is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    v_code := trim(p_code);

    -- The code the student types is the student-facing "join code" (group_access_codes.code).
    select gac.group_code into v_group_code
    from public.group_access_codes gac
    where gac.code = v_code;

    -- Fallback: the group's own internal code.
    if v_group_code is null then
        v_group_code := v_code;
    end if;

    select * into v_group
    from public.groups
    where code = v_group_code and is_active = true
    limit 1;

    if not found then
        raise exception 'INVALID_CODE';
    end if;

    select coalesce(
        raw_user_meta_data->>'full_name',
        raw_user_meta_data->>'name',
        split_part(email, '@', 1),
        'Student'
    )
    into v_user_name
    from auth.users
    where id = auth.uid();

    -- (the old "DELETE FROM group_members WHERE user_id = auth.uid()" is gone on purpose)
    insert into public.group_members (user_id, group_code, name, joined_at)
    values (auth.uid(), v_group.code, coalesce(v_user_name, 'Student'), now())
    on conflict do nothing;

    update public.profiles
    set status = 'active', updated_at = now()
    where id = auth.uid();

    return query
    select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end;
$function$;

commit;
