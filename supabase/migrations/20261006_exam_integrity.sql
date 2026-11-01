-- Exam integrity + ranking. Safe to run more than once. Run in the Supabase SQL editor.
-- Ids are stored as text so this works whatever type exams.id / written_exams.id use.

create table if not exists public.exam_attempts (
  exam_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (exam_id, user_id)
);
alter table public.exam_attempts enable row level security;   -- no policies: only the RPCs below touch it

create table if not exists public.exam_violations (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_type text not null check (exam_type in ('level','written')),
  exam_id text not null,
  kind text not null,
  count int not null default 1,
  created_at timestamptz not null default now()
);
alter table public.exam_violations enable row level security;
create index if not exists exam_violations_exam_idx on public.exam_violations (exam_type, exam_id, user_id);

-- Starts or resumes an attempt; the timer is measured by the server so reloading never resets it.
create or replace function public.start_exam_attempt(p_exam_id text)
returns table (started_at timestamptz, remaining_seconds int)
language plpgsql security definer set search_path = public as $$
declare dur int; st timestamptz;
begin
  select e.duration_minutes into dur from public.exams e where e.id::text = p_exam_id;
  if dur is null then raise exception 'exam not found'; end if;
  insert into public.exam_attempts (exam_id, user_id) values (p_exam_id, auth.uid()) on conflict do nothing;
  select a.started_at into st from public.exam_attempts a where a.exam_id = p_exam_id and a.user_id = auth.uid();
  return query select st, greatest(0, (dur * 60 - extract(epoch from (now() - st)))::int);
end $$;

create or replace function public.log_exam_violation(p_exam_type text, p_exam_id text, p_kind text, p_count int)
returns void language sql security definer set search_path = public as $$
  insert into public.exam_violations (user_id, exam_type, exam_id, kind, count)
  values (auth.uid(), p_exam_type, p_exam_id, left(p_kind, 20), greatest(1, p_count));
$$;

-- Teachers/admins: violation totals per student for one exam.
create or replace function public.exam_violation_summary(p_exam_type text, p_exam_id text)
returns table (user_id uuid, total int)
language sql stable security definer set search_path = public as $$
  select v.user_id, count(*)::int from public.exam_violations v
  where public.ufuq_is_staff() and v.exam_type = p_exam_type and v.exam_id = p_exam_id group by v.user_id;
$$;

-- Class ranking by average level-exam percentage. Members of the group and staff may read it.
create or replace function public.group_exam_ranking(p_group_code text)
returns table (user_id uuid, name text, avg_pct int, exams_taken int, rank int)
language sql stable security definer set search_path = public as $$
  with allowed as (
    select 1 where public.ufuq_is_staff() or exists (select 1 from public.group_members gm where gm.group_code = p_group_code and gm.user_id = auth.uid())
  ), agg as (
    select gm.user_id, gm.name,
           coalesce(round(avg(r.score::numeric / nullif(r.total,0) * 100)), 0)::int as avg_pct,
           count(r.exam_id)::int as exams_taken
    from public.group_members gm
    left join public.exam_results r on r.user_id = gm.user_id and r.total > 0
    where gm.group_code = p_group_code and exists (select 1 from allowed)
    group by gm.user_id, gm.name
  )
  select a.user_id, a.name, a.avg_pct, a.exams_taken,
         (rank() over (order by a.avg_pct desc, a.exams_taken desc))::int
  from agg a order by 5, a.name;
$$;

grant execute on function public.start_exam_attempt(text), public.log_exam_violation(text,text,text,int),
  public.exam_violation_summary(text,text), public.group_exam_ranking(text) to authenticated;

-- Hardened submit_exam: no second submission, nothing accepted long after the server-side timer ran out.
create or replace function public.submit_exam(p_exam_id uuid, p_answers jsonb)
returns table(score integer, total integer)
language plpgsql security definer set search_path to 'public' as $$
declare v_score integer := 0; v_total integer := 0; q record; v_answer integer; v_start timestamptz; v_dur integer;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.exam_results r where r.exam_id = p_exam_id and r.user_id = auth.uid()) then raise exception 'ALREADY_SUBMITTED'; end if;
  select a.started_at into v_start from public.exam_attempts a where a.exam_id = p_exam_id::text and a.user_id = auth.uid();
  select e.duration_minutes into v_dur from public.exams e where e.id = p_exam_id;
  if v_start is not null and v_dur is not null and now() > v_start + (v_dur * 60 + 45) * interval '1 second' then
    delete from public.exam_attempts where exam_id = p_exam_id::text and user_id = auth.uid();
    raise exception 'TIME_OVER';
  end if;
  for q in select id, correct_index from public.exam_questions where exam_id = p_exam_id order by position loop
    v_total := v_total + 1;
    v_answer := nullif(p_answers->>(q.id::text), '')::integer;
    if v_answer is not null and v_answer = q.correct_index then v_score := v_score + 1; end if;
  end loop;
  if v_total = 0 then raise exception 'Exam has no questions'; end if;
  insert into public.exam_results (exam_id, user_id, score, total, taken_at) values (p_exam_id, auth.uid(), v_score, v_total, now())
  on conflict (exam_id, user_id) do update set score = excluded.score, total = excluded.total, taken_at = now();
  delete from public.exam_attempts where exam_id = p_exam_id::text and user_id = auth.uid();
  return query select v_score, v_total;
end; $$;

-- Admins appointed through the panel see every group, like the existing admins do.
create or replace function public.admin_appoint(p_email text, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_tier not in ('super','standard') then raise exception 'bad tier'; end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email));
  if uid is null then raise exception 'user_not_found'; end if;
  if uid = auth.uid() then raise exception 'cannot change yourself'; end if;
  update public.profiles set role = 'admin', admin_tier = p_tier, updated_at = now() where id = uid;
  insert into public.teacher_groups (teacher_id, group_code) select uid, g.code from public.groups g on conflict (teacher_id, group_code) do nothing;
end $$;
