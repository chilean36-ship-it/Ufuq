-- Certificate verification: every certificate gets a random serial that is stored on the server, and a public function
-- (verify_certificate) lets anybody - also without an account - check it (the page is /verify/<serial>, the QR code on the
-- certificate opens it). A forged or edited certificate carries a serial that does not exist or a different name / place / score.
-- Safe to run more than once. Replaces my_certificates of 20261204_certificates_on_time_and_auto_grading.sql (same rules, two more columns).
--
--   * public.certificates      one row per (student, final exam): serial, name AT THE TIME OF ISSUE, level, place, points, date
--   * revoked_at               set by hand to cancel a certificate: the check then says "revoked" and the student no longer sees it
--   * the serial is made the first time the student opens "Certificates" (and now, for everybody who already has one)

create table if not exists public.certificates (
  serial       text primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  exam_id      uuid not null,
  level        integer not null,
  place        integer not null,
  total_points numeric not null,
  max_points   integer not null default 150,
  holder_name  text not null,
  issued_at    timestamptz not null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  unique (user_id, exam_id)
);
alter table public.certificates enable row level security;   -- no policy: only the functions below touch it
revoke all on public.certificates from anon, authenticated;

create or replace function public.ufuq_new_certificate_serial()
returns text language plpgsql volatile set search_path = public as $$
declare v text;
begin
  loop
    v := 'UFQ-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5)) || '-' || upper(substr(md5(clock_timestamp()::text || random()::text), 1, 5));
    exit when not exists (select 1 from public.certificates c where c.serial = v);
  end loop;
  return v;
end $$;
revoke all on function public.ufuq_new_certificate_serial() from public, anon, authenticated;

-- the rules of 20261204 (on-time papers only, places settled after the deadline and after grading), for ONE student
create or replace function public.ufuq_certificate_rows(p_user uuid)
returns table(level integer, place integer, total_points numeric, max_points integer, cohort_size integer, exam_id uuid, issued_at timestamptz, seen boolean)
language sql stable security definer set search_path to 'public' as $function$
  with ontime as (
    select s.exam_id, s.user_id, s.submitted_at, s.started_at, e.level, e.deadline_at
      from public.written_exam_submissions s
      join public.written_exams e on e.id = s.exam_id
     where s.status = 'graded' and s.total_score is not null
       and e.exam_kind = 'final' and e.level is not null and e.deadline_at is not null
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
$function$;
revoke all on function public.ufuq_certificate_rows(uuid) from public, anon, authenticated;

-- make sure every certificate this student is entitled to has its serial (the name is frozen at the first issue)
create or replace function public.ufuq_issue_certificates(p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into public.certificates (serial, user_id, exam_id, level, place, total_points, max_points, holder_name, issued_at)
  select public.ufuq_new_certificate_serial(), p_user, r.exam_id, r.level, r.place, r.total_points, r.max_points,
         coalesce(nullif(btrim(p.full_name), ''), 'Student'), r.issued_at
    from public.ufuq_certificate_rows(p_user) r
    join public.profiles p on p.id = p_user
  on conflict (user_id, exam_id) do update
     set place = excluded.place, total_points = excluded.total_points, issued_at = excluded.issued_at
   where public.certificates.revoked_at is null;
end $fn$;
revoke all on function public.ufuq_issue_certificates(uuid) from public, anon, authenticated;

drop function if exists public.my_certificates();
create or replace function public.my_certificates()
returns table(level integer, place integer, total_points numeric, max_points integer, cohort_size integer, exam_id uuid,
              issued_at timestamptz, seen boolean, serial text, holder_name text)
language plpgsql volatile security definer set search_path to 'public' as $fn$
begin
  if auth.uid() is null then return; end if;
  perform public.ufuq_issue_certificates(auth.uid());
  return query
    select r.level, r.place, r.total_points, r.max_points, r.cohort_size, r.exam_id, r.issued_at, r.seen, c.serial, c.holder_name
      from public.ufuq_certificate_rows(auth.uid()) r
      join public.certificates c on c.user_id = auth.uid() and c.exam_id = r.exam_id and c.revoked_at is null
     order by r.level;
end $fn$;
revoke all on function public.my_certificates() from public, anon;
grant execute on function public.my_certificates() to authenticated;

-- PUBLIC check (no account needed). Returns no row for a serial that does not exist. Shows only what the certificate itself shows.
create or replace function public.verify_certificate(p_serial text)
returns table(holder_name text, level integer, place integer, total_points numeric, max_points integer, issued_at timestamptz, revoked boolean)
language sql stable security definer set search_path to 'public' as $$
  select c.holder_name, c.level, c.place, c.total_points, c.max_points, c.issued_at, c.revoked_at is not null
    from public.certificates c
   where c.serial = upper(btrim(coalesce(p_serial, ''))) and length(btrim(coalesce(p_serial, ''))) between 8 and 40
   limit 1
$$;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- everybody who already earned a certificate gets the serial now
do $$
declare u uuid;
begin
  for u in select distinct s.user_id from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
            where e.exam_kind = 'final' and s.status = 'graded' loop
    perform public.ufuq_issue_certificates(u);
  end loop;
end $$;

notify pgrst, 'reload schema';
