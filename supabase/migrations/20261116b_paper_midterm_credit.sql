-- PROPOSAL (NOT applied). Midterm taken on paper BEFORE the site went live -> staff records the paper score once;
-- the student then only sits the final, and the normal promotion (midterm 50 + final 100, pass >= 75/150) runs as usual.
-- Safe to run more than once. Run after 20261115_admin_level_change_moves_group.sql.

create table if not exists public.level_midterm_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level int not null check (level between 1 and 14),
  points numeric not null check (points >= 0 and points <= 50),   -- same scale as an online midterm (max 50)
  note text,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists level_midterm_credits_user_idx on public.level_midterm_credits (user_id, level, created_at desc);
alter table public.level_midterm_credits enable row level security;
drop policy if exists midterm_credits_select on public.level_midterm_credits;
create policy midterm_credits_select on public.level_midterm_credits for select to authenticated
  using (user_id = (select auth.uid()) or public.ufuq_is_staff());
revoke all on public.level_midterm_credits from anon;
revoke insert, update, delete on public.level_midterm_credits from authenticated;

-- Result of a level: an online graded midterm wins; otherwise the paper credit made after the last level change counts.
create or replace function public.ufuq_level_result(p_user uuid, p_level integer, p_since timestamptz)
returns table(level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points integer, pass_mark integer,
              midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path to 'public' as $$
  with s as (
    select e.exam_kind as kind, public.ufuq_exam_points(sub.total_score, e.exam_kind) as pts,
           row_number() over (partition by e.exam_kind order by coalesce(sub.submitted_at, sub.started_at) desc) as rn
    from public.written_exam_submissions sub
    join public.written_exams e on e.id = sub.exam_id
    where sub.user_id = p_user and sub.status = 'graded' and sub.total_score is not null
      and e.level = p_level and e.exam_kind in ('midterm', 'final')
      and (p_since is null or coalesce(sub.submitted_at, sub.started_at) > p_since)
  ), c as (
    select cr.points from public.level_midterm_credits cr
     where cr.user_id = p_user and cr.level = p_level and (p_since is null or cr.created_at > p_since)
     order by cr.created_at desc limit 1
  ), r as (
    select coalesce((select pts from s where kind = 'midterm' and rn = 1), (select points from c)) as m,
           (select pts from s where kind = 'final' and rn = 1) as f
  )
  select p_level, r.m, r.f, coalesce(r.m, 0) + coalesce(r.f, 0), 150, public.ufuq_pass_mark(),
         r.m is not null, r.f is not null, (r.m is not null and r.f is not null),
         (r.m is not null and r.f is not null and coalesce(r.m, 0) + coalesce(r.f, 0) >= public.ufuq_pass_mark())
  from r
$$;
revoke all on function public.ufuq_level_result(uuid, integer, timestamptz) from public, anon, authenticated;

-- Staff: record the paper midterm score (0..50) of a student for the student's CURRENT level.
create or replace function public.staff_grant_paper_midterm(p_user uuid, p_points numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_lvl int;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_teacher()) then raise exception 'not_allowed'; end if;
  if p_points is null or p_points < 0 or p_points > 50 then raise exception 'points_0_50'; end if;
  if not public.is_super_admin() and not exists (
       select 1 from public.group_members gm where gm.user_id = p_user and public.teaches_group(gm.group_code)) then
    raise exception 'not_your_student';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_lvl from public.profiles p where p.id = p_user and p.role = 'student' and not p.level_free;
  if v_lvl is null then raise exception 'not_a_student'; end if;
  insert into public.level_midterm_credits (user_id, level, points, note, granted_by)
  values (p_user, v_lvl, p_points, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  -- if the final is already graded this completes the level right now
  perform public.ufuq_apply_level_result(p_user, v_lvl);
end $fn$;
revoke all on function public.staff_grant_paper_midterm(uuid, numeric, text) from public, anon;
grant execute on function public.staff_grant_paper_midterm(uuid, numeric, text) to authenticated;

notify pgrst, 'reload schema';

-- STILL TO DO in the app (not in this file):
--  * start_written_exam: refuse a 'midterm' start when a credit exists for the student's level (else they could sit it twice).
--  * my_level_exams / student exam card: show the midterm as "Done on paper: X/50".
--  * a "Paper midterm" button + points field on the teacher's student row (calls staff_grant_paper_midterm), plus a bulk import (CSV).
