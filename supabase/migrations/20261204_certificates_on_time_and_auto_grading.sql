-- Certificates: on-time papers only + wait until every on-time paper is graded; overdue papers are graded automatically.
-- Safe to run more than once. Depends on: my_certificates (20261128/29), ufuq_level_result, certificate_seen, Edge Function grade-exam v8.
--
-- Rules
--   1. A certificate counts only a paper SUBMITTED ON TIME (submitted_at <= the final exam's deadline_at). A student who did not
--      hand in before the deadline - even if a teacher reopened the exam later and he scored the highest - is not ranked.
--   2. Places are decided (and shown) only after the deadline AND once every on-time submitted paper of that exam is graded,
--      so a late grading can never take a place away from somebody who already has the certificate.
--   3. Papers still "submitted" (not graded) after the deadline are graded by the AI automatically: pg_cron runs
--      ufuq_grade_overdue_papers() every 5 minutes and calls the Edge Function grade-exam with a secret kept in Vault.

-- ---------------------------------------------------------------- secret shared by the cron and the Edge Function
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'grade_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'grade_cron_secret');
  end if;
end $$;

create or replace function public.ufuq_cron_secret_ok(p text)
returns boolean language sql stable security definer set search_path = public, vault as $$
  select coalesce(p, '') <> '' and exists (select 1 from vault.decrypted_secrets d where d.name = 'grade_cron_secret' and d.decrypted_secret = p)
$$;
revoke all on function public.ufuq_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.ufuq_cron_secret_ok(text) to service_role;

-- ---------------------------------------------------------------- certificates
create or replace function public.my_certificates()
returns table(level integer, place integer, total_points numeric, max_points integer, cohort_size integer, exam_id uuid, issued_at timestamptz, seen boolean)
language sql stable security definer set search_path to 'public' as $function$
  with ontime as (       -- graded papers handed in before the deadline of a final exam that HAS a deadline
    select s.exam_id, s.user_id, s.submitted_at, s.started_at, e.level, e.deadline_at
      from public.written_exam_submissions s
      join public.written_exams e on e.id = s.exam_id
     where s.status = 'graded' and s.total_score is not null
       and e.exam_kind = 'final' and e.level is not null and e.deadline_at is not null
       and coalesce(s.submitted_at, s.started_at, e.deadline_at) <= e.deadline_at
  ), mine as (
    select distinct on (o.level) o.level, o.exam_id, o.deadline_at
      from ontime o
     where o.user_id = auth.uid()
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
         exists (select 1 from public.certificate_seen cs where cs.user_id = auth.uid() and cs.exam_id = rk.exam_id)
    from ranked rk
   where rk.user_id = auth.uid() and rk.place <= 2 and rk.deadline_at < now()
     -- every paper handed in on time must be graded first
     and not exists (select 1 from public.written_exam_submissions s2
                      where s2.exam_id = rk.exam_id and s2.status = 'submitted'
                        and coalesce(s2.submitted_at, s2.started_at, rk.deadline_at) <= rk.deadline_at)
   order by rk.level
$function$;

-- ---------------------------------------------------------------- automatic grading after the deadline
create or replace function public.ufuq_grade_overdue_papers()
returns integer language plpgsql security definer set search_path = public, vault, extensions as $fn$
declare
  v_secret text;
  v_n integer := 0;
  r record;
begin
  select d.decrypted_secret into v_secret from vault.decrypted_secrets d where d.name = 'grade_cron_secret';
  if v_secret is null then return 0; end if;
  for r in
    select s.id
      from public.written_exam_submissions s
      join public.written_exams e on e.id = s.exam_id
     where s.status = 'submitted'
       and e.deadline_at is not null and e.deadline_at < now() - interval '1 minute'
       and (s.ai_lock_until is null or s.ai_lock_until < now())
     order by e.deadline_at, s.submitted_at
     limit 6
  loop
    perform net.http_post(
      url := 'https://ldbthwpikixtykwmvudy.supabase.co/functions/v1/grade-exam',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- the public anon key only lets the request through the gateway; the real proof is x-cron-secret
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYnRod3Bpa2l4dHlrd212dWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MTUxNDIsImV4cCI6MjEwNDI5MTE0Mn0.8SqYUMLD3MYWFwHT4R8__MJlnIwIoTOJC-hKSmP1zm8',
        'x-cron-secret', v_secret),
      body := jsonb_build_object('submission_id', r.id),
      timeout_milliseconds := 125000);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;
revoke all on function public.ufuq_grade_overdue_papers() from public, anon, authenticated;

create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'ufuq-grade-overdue';
select cron.schedule('ufuq-grade-overdue', '*/5 * * * *', 'select public.ufuq_grade_overdue_papers()');

notify pgrst, 'reload schema';
