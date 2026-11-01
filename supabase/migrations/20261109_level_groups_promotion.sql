-- Stage 3 (APPLIED to live via MCP): groups are named by level ("Level-5") and students move between level groups automatically.
-- Pass (>= 75 of 150, both midterm and final graded) -> level + 1; fail -> level - 1. Safe to run more than once.

-- 1) Group names come from the level: "Level-N", a second group on the same level becomes "Level-N-2", ...
create or replace function public.ufuq_level_group_name(p_level int, p_exclude text default null)
returns text language plpgsql stable set search_path = public as $$
declare n int := 1; v text;
begin
  loop
    v := case when n = 1 then 'Level-' || p_level else 'Level-' || p_level || '-' || n end;
    exit when not exists (select 1 from public.groups g where g.name = v and g.code is distinct from p_exclude);
    n := n + 1;
  end loop;
  return v;
end $$;

create or replace function public.trg_groups_level_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.type = 'individual' then new.level := null; end if;   -- only class groups have levels
  if new.level is not null then
    if tg_op = 'INSERT' or old.level is distinct from new.level
       or new.name !~ ('^Level-' || new.level::text || '(-[0-9]+)?$') then
      new.name := public.ufuq_level_group_name(new.level, new.code);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists groups_level_name on public.groups;
create trigger groups_level_name before insert or update of level, name, type on public.groups
  for each row execute function public.trg_groups_level_name();

-- 2) Log of automatic moves (a student reads their own rows, staff read all).
create table if not exists public.level_transitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_level int not null,
  to_level int not null,
  outcome text not null check (outcome in ('passed', 'failed')),
  total_points numeric,
  from_group text,
  to_group text,
  created_at timestamptz not null default now()
);
create index if not exists level_transitions_user_idx on public.level_transitions (user_id, created_at desc);
alter table public.level_transitions enable row level security;
drop policy if exists level_transitions_select on public.level_transitions;
create policy level_transitions_select on public.level_transitions for select to authenticated
  using (user_id = (select auth.uid()) or public.ufuq_is_staff());
revoke all on public.level_transitions from anon;
revoke insert, update, delete on public.level_transitions from authenticated;

-- 3) Pick the target group. Only active class groups that have a level are candidates;
--    on one level the group with the fewest students wins (then the oldest).
--    Promotion: the next existing level above; none -> null (stay).
--    Demotion : the nearest existing level below; none -> the lowest existing level, but never above the student's level (else null = stay).
create or replace function public.ufuq_pick_level_group(p_from_level int, p_up boolean)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_level int; v_code text;
begin
  if p_up then
    select min(g.level) into v_level from public.groups g where g.type = 'class' and g.is_active and g.level > p_from_level;
  else
    select max(g.level) into v_level from public.groups g where g.type = 'class' and g.is_active and g.level < p_from_level;
    if v_level is null then
      select min(g.level) into v_level from public.groups g where g.type = 'class' and g.is_active and g.level is not null;
      if v_level is not null and v_level >= p_from_level then v_level := null; end if;
    end if;
  end if;
  if v_level is null then return null; end if;
  select g.code into v_code from public.groups g
   where g.type = 'class' and g.is_active and g.level = v_level
   order by (select count(*) from public.group_members m where m.group_code = g.code), g.created_at limit 1;
  return v_code;
end $$;
revoke all on function public.ufuq_pick_level_group(int, boolean) from public, anon, authenticated;

-- 4) Apply a finished level (midterm + final graded). Internal; called by the grading trigger only.
create or replace function public.ufuq_apply_level_result(p_user uuid, p_level int)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; v_cur int; v_last timestamptz; v_new int; v_target text; v_from text; v_name text;
begin
  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student';
  if v_cur is null or v_cur <> p_level then return; end if;          -- staff, or an old level: nothing to move

  select * into r from public.ufuq_level_result(p_user, p_level);
  if r is null or not r.complete then return; end if;

  select max(coalesce(sub.submitted_at, sub.started_at)) into v_last
    from public.written_exam_submissions sub join public.written_exams e on e.id = sub.exam_id
   where sub.user_id = p_user and sub.status = 'graded' and e.level = p_level and e.exam_kind in ('midterm', 'final');
  if exists (select 1 from public.level_transitions t where t.user_id = p_user and t.from_level = p_level and t.created_at >= v_last) then
    return;                                                           -- this result was already applied
  end if;

  v_new := case when r.passed then least(p_level + 1, 14) else greatest(p_level - 1, 1) end;
  v_target := public.ufuq_pick_level_group(p_level, r.passed);

  -- Source: the student's class groups that are legacy (no level) or on this level.
  select string_agg(m.group_code, ',') into v_from
    from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = p_user and g.type = 'class' and (g.level is null or g.level = p_level);

  if v_target is not null then
    select coalesce(p.full_name, 'Student') into v_name from public.profiles p where p.id = p_user;
    delete from public.group_members m using public.groups g
     where m.user_id = p_user and g.code = m.group_code and g.type = 'class'
       and (g.level is null or g.level = p_level) and m.group_code <> v_target;
    insert into public.group_members (user_id, group_code, name, joined_at)
    values (p_user, v_target, v_name, now()) on conflict (user_id, group_code) do nothing;
  end if;

  if v_new <> p_level then
    update public.profiles set level = v_new, updated_at = now() where id = p_user;
  end if;

  insert into public.level_transitions (user_id, from_level, to_level, outcome, total_points, from_group, to_group)
  values (p_user, p_level, v_new, case when r.passed then 'passed' else 'failed' end, r.total_points, v_from, v_target);
end $$;
revoke all on function public.ufuq_apply_level_result(uuid, int) from public, anon, authenticated;

-- 5) Grading trigger: never blocks grading, a failure only raises a warning.
create or replace function public.trg_level_result_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_level smallint; v_kind text;
begin
  if new.status = 'graded' and new.total_score is not null then
    select e.level, e.exam_kind into v_level, v_kind from public.written_exams e where e.id = new.exam_id;
    if v_level is not null and v_kind in ('midterm', 'final') then
      begin
        perform public.ufuq_apply_level_result(new.user_id, v_level::int);
      exception when others then
        raise warning 'level promotion failed for % level %: %', new.user_id, v_level, sqlerrm;
      end;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.trg_level_result_apply() from public, anon, authenticated;
drop trigger if exists level_result_apply on public.written_exam_submissions;
create trigger level_result_apply after insert or update of status, total_score on public.written_exam_submissions
  for each row execute function public.trg_level_result_apply();

notify pgrst, 'reload schema';
