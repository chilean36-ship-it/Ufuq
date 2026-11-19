-- Exam system v2 (2026-11-19). A level now has FOUR exams, 150 points in total, pass mark = half of the points that were open:
--   pop quiz 1 (exam_kind 'pop1', 25)  +  pop quiz 2 ('pop2', 50)  +  midterm (25)  +  final (50)
-- The pop quizzes ("الامتحان المفاجئ" / "Kutilmagan imtihon") are the OLD midterm / final rows, renamed in place (so every old
-- submission stays attached to them and keeps its percentage; points are rescaled by the new maxima). They stay closed
-- (is_published = false) until a teacher or admin opens them. The new midterm / final rows are the new multiple-choice exams.
--
-- Pass rule (decided 2026-11-19): pass mark = 50 % of (midterm 25 + final 50 + every pop quiz that was OPEN to the student).
-- A pop quiz counts as open when the student has a graded paper on it OR a published pop exam of that level exists in one
-- of the student's groups. With both pop quizzes open: 75 of 150. With none open: 37.5 of 75.
--
-- Also here: written_exam_questions.weight (+ a trigger that makes total_score the weighted average) and "@@exact:" items
-- (graded by the grade-exam function without AI). Idempotent: safe to run twice.

begin;

-- 1. kinds -------------------------------------------------------------------------------------------------------------
alter table public.written_exams drop constraint if exists written_exams_exam_kind_check;
alter table public.written_exams drop constraint if exists written_exams_kind_check;
alter table public.written_exams add constraint written_exams_kind_check
  check (exam_kind is null or exam_kind in ('midterm', 'final', 'pop1', 'pop2'));

create or replace function public.ufuq_exam_max(p_kind text) returns int language sql immutable set search_path = public as $$
  select case p_kind when 'midterm' then 25 when 'pop1' then 25 when 'final' then 50 when 'pop2' then 50 else 100 end
$$;

-- 2. question weights + weighted total ----------------------------------------------------------------------------------
alter table public.written_exam_questions add column if not exists weight numeric not null default 1;
alter table public.written_exam_questions drop constraint if exists written_exam_questions_weight_check;
alter table public.written_exam_questions add constraint written_exam_questions_weight_check check (weight > 0);

-- Whatever writes a graded total (grade-exam, a teacher's approval, the night cron), an exam with uneven weights ends up
-- with the weighted average of its items (teacher score, else AI score, else 0). Exams where every weight is 1 are untouched.
create or replace function public.trg_weighted_total() returns trigger language plpgsql security definer set search_path = public as $$
declare v_den numeric; v_num numeric; v_uneven boolean;
begin
  if new.status = 'graded' and new.total_score is not null then
    select sum(q.weight), sum(q.weight * coalesce(a.teacher_score, a.ai_score, 0)), coalesce(bool_or(q.weight <> 1), false)
      into v_den, v_num, v_uneven
      from public.written_exam_questions q
      left join public.written_exam_answers a on a.question_id = q.id and a.submission_id = new.id
     where q.exam_id = new.exam_id;
    if v_uneven and v_den > 0 then new.total_score := least(100, greatest(0, round(v_num / v_den)))::int; end if;
  end if;
  return new;
end $$;
revoke all on function public.trg_weighted_total() from public, anon, authenticated;
drop trigger if exists zz_weighted_total on public.written_exam_submissions;
create trigger zz_weighted_total before insert or update on public.written_exam_submissions
  for each row execute function public.trg_weighted_total();

-- the sibling-sync of a level exam copies the weight as well
create or replace function public.staff_sync_level_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare src public.written_exams%rowtype; sib record; n_ok int := 0; n_skip int := 0;
begin
  if auth.uid() is null or not public.teaches_written_exam(p_exam_id) then raise exception 'not_allowed'; end if;
  select * into src from public.written_exams where id = p_exam_id;
  if not found or src.exam_kind is null or src.level is null then return jsonb_build_object('synced', 0, 'skipped', 0); end if;

  for sib in select e.id from public.written_exams e
              where e.level = src.level and e.exam_kind = src.exam_kind and e.id <> src.id loop
    if exists (select 1 from public.written_exam_submissions s where s.exam_id = sib.id) then n_skip := n_skip + 1; continue; end if;

    update public.written_exams set title = src.title where id = sib.id and title is distinct from src.title;

    delete from public.written_exam_questions q
     where q.exam_id = sib.id and q.order_num not in (select order_num from public.written_exam_questions where exam_id = src.id);
    update public.written_exam_questions q set type = s.type, question_text = s.question_text, weight = s.weight
      from public.written_exam_questions s
     where s.exam_id = src.id and q.exam_id = sib.id and q.order_num = s.order_num
       and (q.type is distinct from s.type or q.question_text is distinct from s.question_text or q.weight is distinct from s.weight);
    insert into public.written_exam_questions (exam_id, order_num, type, question_text, weight)
    select sib.id, s.order_num, s.type, s.question_text, s.weight from public.written_exam_questions s
     where s.exam_id = src.id
       and not exists (select 1 from public.written_exam_questions q where q.exam_id = sib.id and q.order_num = s.order_num);
    insert into public.written_exam_criteria (question_id, criteria_text, updated_at)
    select q.id, coalesce(c.criteria_text, ''), now()
      from public.written_exam_questions s
      join public.written_exam_questions q on q.exam_id = sib.id and q.order_num = s.order_num
      left join public.written_exam_criteria c on c.question_id = s.id
     where s.exam_id = src.id
    on conflict (question_id) do update set criteria_text = excluded.criteria_text, updated_at = now()
      where public.written_exam_criteria.criteria_text is distinct from excluded.criteria_text;
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('synced', n_ok, 'skipped', n_skip);
end $$;

-- 3. level result: four exams, the open-points pass rule -----------------------------------------------------------------
alter table public.level_transitions add column if not exists max_points numeric;
alter table public.level_transitions add column if not exists pass_mark numeric;

drop function if exists public.ufuq_level_result(uuid, integer);
drop function if exists public.ufuq_level_result(uuid, integer, timestamptz);
drop function if exists public.my_level_results();

create function public.ufuq_level_result(p_user uuid, p_level integer, p_since timestamptz)
returns table (level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points numeric, pass_mark numeric,
               midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path = public as $$
  with s as (
    select e.exam_kind as kind, public.ufuq_exam_points(sub.total_score, e.exam_kind) as pts,
           row_number() over (partition by e.exam_kind order by coalesce(sub.submitted_at, sub.started_at) desc) as rn
    from public.written_exam_submissions sub
    join public.written_exams e on e.id = sub.exam_id
    where sub.user_id = p_user and sub.status = 'graded' and sub.total_score is not null
      and e.level = p_level and e.exam_kind in ('midterm', 'final', 'pop1', 'pop2')
      and (p_since is null or coalesce(sub.submitted_at, sub.started_at) > p_since)
  ), b as (select kind, pts from s where rn = 1),
  r as (
    select (select pts from b where kind = 'midterm') as m, (select pts from b where kind = 'final') as f,
           (select pts from b where kind = 'pop1') as p1, (select pts from b where kind = 'pop2') as p2
  ), op as (   -- pop quizzes that were open to this student
    select exists (select 1 from b where kind = 'pop1')
        or exists (select 1 from public.written_exams e join public.group_members gm on gm.group_code = e.group_code and gm.user_id = p_user
                    where e.level = p_level and e.exam_kind = 'pop1' and e.is_published) as o1,
           exists (select 1 from b where kind = 'pop2')
        or exists (select 1 from public.written_exams e join public.group_members gm on gm.group_code = e.group_code and gm.user_id = p_user
                    where e.level = p_level and e.exam_kind = 'pop2' and e.is_published) as o2
  ), lg as (   -- a level the student already LEFT (old results): no new midterm / final, judged by the move that happened
    select p_since is null and exists (select 1 from public.level_transitions t where t.user_id = p_user and t.from_level = p_level and t.outcome = 'passed') as passed_before,
           p_since is null and exists (select 1 from public.level_transitions t where t.user_id = p_user and t.from_level = p_level) as left_before
  ), c as (
    select r.m, r.f, coalesce(r.m, 0) + coalesce(r.f, 0) + coalesce(r.p1, 0) + coalesce(r.p2, 0) as tot,
           (r.m is not null and r.f is not null) as cplt,
           (lg.left_before and not (r.m is not null and r.f is not null)) as legacy, lg.passed_before,
           25 + 50 + (case when op.o1 then 25 else 0 end) + (case when op.o2 then 50 else 0 end) as mx_new,
           (case when r.m is not null then 25 else 0 end) + (case when r.f is not null then 50 else 0 end)
             + (case when r.p1 is not null then 25 else 0 end) + (case when r.p2 is not null then 50 else 0 end) as mx_old
      from r, op, lg
  )
  select p_level, c.m, c.f, c.tot,
         (case when c.legacy then c.mx_old else c.mx_new end)::numeric,
         ((case when c.legacy then c.mx_old else c.mx_new end) / 2.0)::numeric,
         c.m is not null, c.f is not null,
         (c.cplt or c.legacy),
         case when c.legacy then c.passed_before
              else (c.cplt and c.tot >= (c.mx_new / 2.0)) end
    from c
$$;
revoke all on function public.ufuq_level_result(uuid, integer, timestamptz) from public, anon, authenticated;

create function public.ufuq_level_result(p_user uuid, p_level integer)
returns table (level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points numeric, pass_mark numeric,
               midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path = public as $$
  select * from public.ufuq_level_result(p_user, p_level, null::timestamptz)
$$;
revoke all on function public.ufuq_level_result(uuid, integer) from public, anon, authenticated;

create function public.my_level_results()
returns table (level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points numeric, pass_mark numeric,
               midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path = public as $$
  select x.* from (
    select distinct e.level::int as lv
    from public.written_exam_submissions sub join public.written_exams e on e.id = sub.exam_id
    where sub.user_id = auth.uid() and sub.status = 'graded' and e.level is not null and e.exam_kind in ('midterm', 'final', 'pop1', 'pop2')
  ) l, lateral public.ufuq_level_result(auth.uid(), l.lv) x
  where auth.uid() is not null and (x.midterm_done or x.final_done or x.total_points > 0)
  order by x.level
$$;
revoke all on function public.my_level_results() from public, anon;
grant execute on function public.my_level_results() to authenticated;

-- promotion: same rule as before, and the transition remembers the max / pass mark it was judged against
create or replace function public.ufuq_apply_level_result(p_user uuid, p_level integer)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_cur int; v_cut timestamptz; v_target text; v_to int; v_letter text;
begin
  perform pg_advisory_xact_lock(hashtextextended('ufuq_level:' || p_user::text, 0));
  select p.level into v_cur from public.profiles p where p.id = p_user and p.role = 'student' and not coalesce(p.level_free, false);
  if v_cur is null or v_cur <> p_level then return; end if;

  select max(t.created_at) into v_cut from public.level_transitions t where t.user_id = p_user and t.from_level = p_level and t.reason = 'exam';
  select * into r from public.ufuq_level_result(p_user, p_level, v_cut);
  if r is null or not r.complete then return; end if;

  if r.passed then
    perform public.ufuq_move_student_level(p_user, p_level, least(p_level + 1, 14), 'passed', 'exam',
                                           r.total_points, r.midterm_points, r.final_points);
  else
    select g.letter into v_letter from public.group_members m join public.groups g on g.code = m.group_code
     where m.user_id = p_user and g.type = 'class' order by (g.level is not distinct from p_level) desc, g.is_active desc, m.joined_at limit 1;
    v_target := public.ufuq_pick_level_group(p_level, false, v_letter);
    if v_target is null then v_to := p_level; else select g.level into v_to from public.groups g where g.code = v_target; end if;
    perform public.ufuq_move_student_level(p_user, p_level, v_to, 'failed', 'exam', r.total_points, r.midterm_points, r.final_points, v_target);
  end if;
  update public.level_transitions set max_points = r.max_points, pass_mark = r.pass_mark
   where id = (select t.id from public.level_transitions t where t.user_id = p_user and t.from_level = p_level order by t.created_at desc limit 1);
end $$;

-- 4. certificates keep the old cohorts: the old final (now pop2) still ranks its level; later pop quizzes never do ----------
-- (my_certificates / ufuq_issue_certificates read this function; the rows already issued stay in public.certificates)
create or replace function public.ufuq_certificate_rows(p_user uuid)
returns table (level integer, place integer, total_points numeric, max_points integer, cohort_size integer, exam_id uuid, issued_at timestamptz, seen boolean)
language sql stable security definer set search_path = public as $$
  with ontime as (
    select s.exam_id, s.user_id, s.submitted_at, s.started_at, e.level, e.deadline_at
      from public.written_exam_submissions s
      join public.written_exams e on e.id = s.exam_id
     where s.status = 'graded' and s.total_score is not null
       and (e.exam_kind = 'final' or (e.exam_kind = 'pop2' and e.created_at < timestamptz '2026-11-19 00:00:00+00'))
       and e.level is not null and e.deadline_at is not null
       and coalesce(s.submitted_at, s.started_at, e.deadline_at) <= e.deadline_at
  ), mine as (
    select distinct on (o.level) o.level, o.exam_id, o.deadline_at
      from ontime o
     where o.user_id = p_user
     order by o.level, coalesce(o.submitted_at, o.started_at) desc
  ), cohort as (
    select m.level, m.exam_id, m.deadline_at, c.user_id, r.total_points
      from mine m
      join (select distinct o.exam_id, o.user_id from ontime o) c on c.exam_id = m.exam_id
      join public.profiles pr on pr.id = c.user_id and pr.role <> 'teacher' and not (pr.role = 'admin' and coalesce(pr.admin_tier, 'super') = 'super')
      cross join lateral public.ufuq_level_result(c.user_id, m.level) r
  ), ranked as (
    select k.*, dense_rank() over (partition by k.level order by k.total_points desc)::int as place,
           count(*) over (partition by k.level)::int as n
      from cohort k
  )
  select rk.level::int, rk.place, rk.total_points, 150, rk.n, rk.exam_id, rk.deadline_at,
         exists (select 1 from public.certificate_seen cs where cs.user_id = p_user and cs.exam_id = rk.exam_id)
    from ranked rk
   where rk.user_id = p_user and rk.place <= 2 and rk.deadline_at < now()
     and not exists (select 1 from public.written_exam_submissions s2
                      where s2.exam_id = rk.exam_id and s2.status = 'submitted'
                        and coalesce(s2.submitted_at, s2.started_at, rk.deadline_at) <= rk.deadline_at)
   order by rk.level
$$;

commit;
notify pgrst, 'reload schema';
