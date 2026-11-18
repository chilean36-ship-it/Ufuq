-- Manual level RAISE (admin / teacher) always lands the student in the next group of HIS letter, opening or creating it.
-- Safe to run more than once. Replaces admin_update_student of 20261201_level_groups_lifecycle.sql.
--
-- What was wrong
--   * A test account (profiles.level_free) only got a new number: it stayed in Group D9 while its level said 10.
--   * A real student raised by more than one level, or to a group of his letter that the cohort had left, was sent to another
--     letter's group or got NO_ACTIVE_GROUP_AT_LEVEL.
-- Now
--   * Raise (p_level > current): target = group of his letter at p_level, created / switched on when missing or closed.
--     Real student: moves there (leaves his other class groups). Test account: JOINS it (keeps its other groups, it is
--     used to look at every group) and its level becomes the group's level.
--   * Lowering a level keeps the old rule (only a RUNNING group is a target, nothing is switched on behind the admin's back).

create or replace function public.admin_update_student(p_user_id uuid, p_status public.profile_status default null, p_level integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur int; v_role text; v_free boolean; v_tid uuid; v_letter text; v_tpl text; v_target text; v_name text; v_to int; v_tier text;
begin
  if not (public.is_admin() or public.is_teacher()) then
    raise exception 'Faqat o''qituvchilar bu amalni bajara oladi.';
  end if;
  if p_level is not null and (p_level < 1 or p_level > 14) then
    raise exception 'Daraja 1 dan 14 gacha bo''lishi kerak.';
  end if;
  if not public.is_super_admin() and not exists (
    select 1 from public.group_members gm where gm.user_id = p_user_id and public.teaches_group(gm.group_code)
  ) then
    raise exception 'Bu talaba sizning guruhingizga tegishli emas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user_id::text, 0));

  if p_status is not null then
    update public.profiles set status = p_status, updated_at = now() where id = p_user_id;
  end if;

  if p_level is not null then
    select p.level, p.role::text, coalesce(p.level_free, false), coalesce(p.admin_tier, 'super') into v_cur, v_role, v_free, v_tier from public.profiles p where p.id = p_user_id;

    -- ordinary (standard) admins study like students: they are moved the same way
    if (v_role = 'student' or (v_role = 'admin' and v_tier = 'standard')) and v_cur is not null and p_level <> v_cur then
      -- the series (letter) he follows: his class group of the level he leaves first
      v_target := null;
      if p_level > v_cur then
        select g.letter, g.code into v_letter, v_tpl
          from public.group_members m join public.groups g on g.code = m.group_code
         where m.user_id = p_user_id and g.type = 'class' and g.letter is not null
         order by (g.level is not distinct from v_cur) desc, g.is_active desc, m.joined_at
         limit 1;
        if v_letter is not null then
          v_target := public.ufuq_group_for_letter_level(v_letter, p_level, v_tpl, true);
        end if;
      end if;

      if not v_free then
        perform public.ufuq_move_student_level(p_user_id, v_cur, p_level,
                  case when p_level > v_cur then 'passed' else 'failed' end, 'manual', null, null, null, v_target);
        select t.id into v_tid from public.level_transitions t
         where t.user_id = p_user_id and t.reason = 'manual' order by t.created_at desc limit 1;
        if v_tid is not null then update public.level_transitions set seen_at = now() where id = v_tid; end if;
      elsif v_target is not null then
        -- test account: join the group, keep the others
        select coalesce(nullif(btrim(full_name), ''), 'Student') into v_name from public.profiles where id = p_user_id;
        insert into public.group_members (user_id, group_code, name, joined_at)
        values (p_user_id, v_target, coalesce(v_name, 'Student'), now()) on conflict (user_id, group_code) do nothing;
        select coalesce(g.level, p_level) into v_to from public.groups g where g.code = v_target;
        update public.profiles set level = v_to, updated_at = now() where id = p_user_id;
        perform public.ufuq_reset_level_attempts(p_user_id, v_to);
      else
        update public.profiles set level = p_level, updated_at = now() where id = p_user_id;
      end if;
    elsif v_cur is distinct from p_level then
      update public.profiles set level = p_level, updated_at = now() where id = p_user_id;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
