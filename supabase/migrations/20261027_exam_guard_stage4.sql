-- Exam leave-guard, stage 4. Safe to run more than once. Run in the Supabase SQL editor after 20261013_security_hardening.sql.
--  1) A retry of the same departure never adds a second row (client_id is unique per student).
--  2) The teacher summary counts real departures and technical interruptions (tech_*) separately.
--  The time of each row is the server's (created_at default now()); the client does not send a time.

alter table public.exam_violations add column if not exists client_id text;
create unique index if not exists exam_violations_client_uniq
  on public.exam_violations (user_id, client_id) where client_id is not null;

-- New signature with p_client_id. The old 4-argument version is removed so calls cannot become ambiguous.
drop function if exists public.log_exam_violation(text, text, text, int);
create or replace function public.log_exam_violation(p_exam_type text, p_exam_id text, p_kind text, p_count int, p_client_id text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.exam_violations (user_id, exam_type, exam_id, kind, count, client_id)
  select auth.uid(), p_exam_type, left(p_exam_id, 64), left(p_kind, 20), least(greatest(1, coalesce(p_count, 1)), 50), left(p_client_id, 120)
  where auth.uid() is not null
    and p_exam_type in ('level', 'written')
    and (select count(*) from public.exam_violations v
         where v.user_id = auth.uid() and v.created_at > now() - interval '1 minute') < 60
  on conflict do nothing;
$$;
revoke all on function public.log_exam_violation(text, text, text, int, text) from public, anon;
grant execute on function public.log_exam_violation(text, text, text, int, text) to authenticated;

-- Summary: total = real departures, technical = interruptions while offline (not counted against the student).
drop function if exists public.exam_violation_summary(text, text);
create or replace function public.exam_violation_summary(p_exam_type text, p_exam_id text)
returns table (user_id uuid, total int, technical int)
language sql stable security definer set search_path = public as $$
  select v.user_id,
         count(*) filter (where left(v.kind, 5) <> 'tech_')::int,
         count(*) filter (where left(v.kind, 5) = 'tech_')::int
  from public.exam_violations v
  where public.ufuq_is_staff() and v.exam_type = p_exam_type and v.exam_id = p_exam_id
  group by v.user_id;
$$;
revoke all on function public.exam_violation_summary(text, text) from public, anon;
grant execute on function public.exam_violation_summary(text, text) to authenticated;
