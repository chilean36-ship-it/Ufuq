-- STAGE 9 (APPLIED to live via MCP on 2026-11-01). Safe to run more than once.
-- MODEL: a group keeps its letter for ever (Group A..G) and carries its own level 1..14: "Group A8".
--  * Everything (chat, audio, board photos, zoom, schedule, exams) stays with the group. Levels never move content.
--  * Students take the level exams (midterm 50 + final 100). >= 75/150 = passed, < 75 = failed.
--  * PASSED  -> the student stays in the group. When EVERY student of the group has passed the current level, the group goes
--               to the next level (A7 -> A8, renamed automatically) and so do its students.
--  * FAILED  -> the student moves at once to the nearest LOWER group (highest group level below the current one) and sees only
--               that group's content. His results / history (level_transitions, graded papers of other levels) stay with him.
--               No lower group -> he stays and retakes.
--  * One group per level (not enforced; ties are broken by the smaller group).

-- 1) the permanent letter
alter table public.groups add column if not exists letter text;
alter table public.groups drop constraint if exists groups_letter_check;
alter table public.groups add constraint groups_letter_check check (letter is null or letter ~ '^[A-G]$');
create unique index if not exists groups_letter_uidx on public.groups (letter) where letter is not null;

-- 2) name = "Group" + letter + level
create or replace function public.trg_groups_level_name() returns trigger
language plpgsql set search_path = public as $$
declare m text;
begin
  if new.type = 'individual' then new.level := null; new.letter := null; return new; end if;
  if tg_op = 'INSERT' or old.name is distinct from new.name then
    m := upper((regexp_match(btrim(new.name), '^(?:group|guruh)[ _-]*([A-Ga-g])[0-9]*$', 'i'))[1]);
    if m is not null then new.letter := m; end if;
  end if;
  if new.letter is not null then
    new.name := 'Group ' || new.letter || coalesce(new.level::text, '');
  end if;
  return new;
end $$;
drop trigger if exists groups_level_name on public.groups;
create trigger groups_level_name before insert or update of level, name, type, letter on public.groups
  for each row execute function public.trg_groups_level_name();

-- when a group's level is set by hand, its students follow it
create or replace function public.trg_groups_level_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'class' and new.level is not null and old.level is distinct from new.level then
    update public.profiles p set level = new.level, updated_at = now()
     where p.role = 'student' and not coalesce(p.level_free, false) and p.level is distinct from new.level
       and p.id in (select m.user_id from public.group_members m where m.group_code = new.code);
  end if;
  return null;
end $$;
drop trigger if exists groups_level_sync on public.groups;
create trigger groups_level_sync after update of level on public.groups
  for each row execute function public.trg_groups_level_sync();

-- 3) give the existing groups their letters back (A->8, B->1, C->5, D->9, E->3 are already in groups.level)
update public.groups set letter = case code
    when '24861' then 'A' when '57392' then 'B' when '68210' then 'C' when '91847' then 'D'
    when '30658' then 'E' when '74926' then 'F' when '19483' then 'G' end
 where code in ('24861','57392','68210','91847','30658','74926','19483') and type = 'class';

-- 4) the group of a level (never created automatically any more)
create or replace function public.ufuq_group_for_level(p_level int) returns text
language plpgsql security definer set search_path = public as $fn$
declare v_code text; v_active boolean;
begin
  select g.code, g.is_active into v_code, v_active from public.groups g
   where g.type = 'class' and g.level = p_level
   order by g.is_active desc, (select count(*) from public.group_members m where m.group_code = g.code), g.created_at limit 1;
  if v_code is not null and not v_active then update public.groups set is_active = true where code = v_code; end if;
  return v_code;
end $fn$;
revoke all on function public.ufuq_group_for_level(int) from public, anon, authenticated;
drop function if exists public.ufuq_get_or_create_level_group(integer, text);

-- 5) a student moves (failed exam / missed exam / manual change). The target is an EXISTING group.
create or replace function public.ufuq_move_student_level(p_user uuid, p_from integer, p_to integer, p_outcome text, p_reason text,
                                                          p_total numeric, p_mid numeric, p_fin numeric)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_from text; v_from_names text; v_target text; v_to int := p_to; v_gname text; v_name text;
begin
  select string_agg(m.group_code, ','), string_agg(g.name, ', ') into v_from, v_from_names
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and (g.level is null or g.level = p_from);

  if p_to <> p_from then
    v_target := public.ufuq_group_for_level(p_to);
    if v_target is null and p_to < p_from then v_target := public.ufuq_pick_level_group(p_from, false); end if;
    if v_target is null then raise exception 'NO_GROUP_FOR_LEVEL'; end if;
    select g.level into v_to from public.groups g where g.code = v_target;

    select coalesce(p.full_name, 'Student') into v_name from public.profiles p where p.id = p_user;
    delete from public.group_members m using public.groups g
     where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
       and (g.level is null or g.level = p_from) and m.group_code <> v_target;
    insert into public.group_members (user_id, group_code, name, joined_at)
    values (p_user, v_target, v_name, now()) on conflict (user_id, group_code) do nothing;
    select g.name into v_gname from public.groups g where g.code = v_target;

    update public.profiles set level = v_to, updated_at = now() where id = p_user;
    perform public.ufuq_reset_level_attempts(p_user, v_to);
  end if;

  insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, total_points, midterm_points, final_points,
                                        from_group, to_group, from_group_name, to_group_name)
  values (p_user, p_from, v_to, p_outcome, p_reason, p_total, p_mid, p_fin, v_from, v_target, v_from_names, v_gname);
end $fn$;
revoke all on function public.ufuq_move_student_level(uuid, integer, integer, text, text, numeric, numeric, numeric) from public, anon, authenticated;

-- 6) the group goes up when EVERY student in it has passed the current level
create or replace function public.ufuq_try_advance_group(p_group text) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  g public.groups%rowtype; m record; r record; v_cut timestamptz; v_new int; v_from_name text; v_to_name text;
  v_rows jsonb := '[]'::jsonb; e jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_group:' || p_group, 0));
  select * into g from public.groups where code = p_group and type = 'class' and level is not null;
  if not found then return; end if;

  for m in select p.id from public.group_members gm join public.profiles p on p.id = gm.user_id
            where gm.group_code = p_group and p.role = 'student' and not coalesce(p.level_free, false) loop
    select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = m.id and t.from_level = g.level and t.reason = 'exam';
    select * into r from public.ufuq_level_result(m.id, g.level, v_cut);
    if r is null or not r.complete or not r.passed then return; end if;
    v_rows := v_rows || jsonb_build_object('id', m.id, 'total', r.total_points, 'mid', r.midterm_points, 'fin', r.final_points);
  end loop;
  if jsonb_array_length(v_rows) = 0 then return; end if;

  v_new := least(g.level + 1, 14);
  v_from_name := g.name;
  if v_new <> g.level then update public.groups set level = v_new where code = p_group; end if;   -- trigger renames it (A7 -> A8)
  select name into v_to_name from public.groups where code = p_group;

  for e in select * from jsonb_array_elements(v_rows) loop
    if v_new <> g.level then
      update public.profiles set level = v_new, updated_at = now() where id = (e->>'id')::uuid;
      perform public.ufuq_reset_level_attempts((e->>'id')::uuid, v_new);
    end if;
    insert into public.level_transitions (user_id, from_level, to_level, outcome, reason, total_points, midterm_points, final_points,
                                          from_group, to_group, from_group_name, to_group_name)
    values ((e->>'id')::uuid, g.level, v_new, 'passed', 'exam', (e->>'total')::numeric, (e->>'mid')::numeric, (e->>'fin')::numeric,
            p_group, p_group, v_from_name, v_to_name);
  end loop;
end $fn$;
revoke all on function public.ufuq_try_advance_group(text) from public, anon, authenticated;

-- a student leaving / being removed may be the last one that was holding the group back
create or replace function public.trg_member_left_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin perform public.ufuq_try_advance_group(old.group_code);
  exception when others then raise warning 'group advance failed for %: %', old.group_code, sqlerrm; end;
  return null;
end $$;
revoke all on function public.trg_member_left_group() from public, anon, authenticated;
drop trigger if exists group_members_left_advance on public.group_members;
create trigger group_members_left_advance after delete on public.group_members
  for each row execute function public.trg_member_left_group();

-- 7) a graded level result: pass -> check the group, fail -> nearest lower group
create or replace function public.ufuq_apply_level_result(p_user uuid, p_level integer)
returns void language plpgsql security definer set search_path = public as $fn$
declare r record; v_cur int; v_cut timestamptz; v_grp text; v_target text; v_to int;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false);
  if v_cur is null or v_cur <> p_level then return; end if;

  select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = p_user and t.from_level = p_level and t.reason = 'exam';
  select * into r from public.ufuq_level_result(p_user, p_level, v_cut);
  if r is null or not r.complete then return; end if;

  if r.passed then
    select gm.group_code into v_grp from public.group_members gm join public.groups g on g.code = gm.group_code
     where gm.user_id = p_user and g.type = 'class' and g.level = p_level limit 1;
    if v_grp is not null then perform public.ufuq_try_advance_group(v_grp); end if;
    return;
  end if;

  v_target := public.ufuq_pick_level_group(p_level, false);
  if v_target is null then v_to := p_level; else select g.level into v_to from public.groups g where g.code = v_target; end if;
  perform public.ufuq_move_student_level(p_user, p_level, v_to, 'failed', 'exam', r.total_points, r.midterm_points, r.final_points);
end $fn$;
revoke all on function public.ufuq_apply_level_result(uuid, integer) from public, anon, authenticated;

-- 8) joining a group: the student takes the level of the group (no more LEVEL_MISMATCH for a student without another level group)
create or replace function public.join_group(p_code text)
returns table(group_code text, group_name text, group_schedule text, group_zoom_link text, group_schedule_days jsonb)
language plpgsql security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  v_group public.groups%rowtype; v_user_name text; v_group_code text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_fails int; v_role text; v_level int; v_free boolean;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.user_has_access(auth.uid()) then raise exception 'PAYMENT_REQUIRED'; end if;

  select count(*) into v_fails from public.join_attempts where user_id = auth.uid() and created_at > now() - interval '15 minutes';
  if v_fails >= 8 then raise exception 'TOO_MANY_ATTEMPTS'; end if;

  if v_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$' then
    select gac.group_code into v_group_code from public.group_access_codes gac where gac.code = v_code;
    if v_group_code is not null then
      select * into v_group from public.groups g where g.code = v_group_code and g.is_active = true limit 1;
    end if;
  end if;

  if v_group.code is null then
    insert into public.join_attempts (user_id) values (auth.uid());
    delete from public.join_attempts where created_at < now() - interval '2 days';
    return;
  end if;

  select p.role::text, coalesce(p.level, 1), coalesce(p.level_free, false) into v_role, v_level, v_free from public.profiles p where p.id = auth.uid();
  if v_role = 'student' and not v_free and v_group.type = 'class' and v_group.level is not null and v_group.level <> v_level then
    if exists (select 1 from public.group_members gm join public.groups g on g.code = gm.group_code
                where gm.user_id = auth.uid() and g.type = 'class' and g.level is not null and gm.group_code <> v_group.code) then
      raise exception 'LEVEL_MISMATCH';
    end if;
    update public.profiles p set level = v_group.level, updated_at = now() where p.id = auth.uid();
  end if;

  select coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Student')
    into v_user_name from auth.users u where u.id = auth.uid();

  insert into public.group_members (user_id, group_code, name, joined_at)
  values (auth.uid(), v_group.code, coalesce(v_user_name, 'Student'), now())
  on conflict (user_id, group_code) do nothing;

  update public.profiles p set status = 'active', updated_at = now() where p.id = auth.uid();

  return query select v_group.code, v_group.name, v_group.schedule, v_group.zoom_link, v_group.schedule_days;
end $function$;
revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

notify pgrst, 'reload schema';
