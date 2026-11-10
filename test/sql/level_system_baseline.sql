-- TEST FIXTURE ONLY. Never run this against the real project.
-- A small copy of the parts of the live database (ldbthwpikixtykwmvudy, read on 2026-11-10) that the level system touches:
-- tables, triggers and the helper functions the level migration builds on. `scripts/test-level-sql.sh` loads this file into a
-- throw-away Postgres, applies supabase/migrations/20261201_level_groups_lifecycle.sql on top and runs level_system.test.sql.

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
-- the signed-in user of a test step: select set_config('test.uid', '<uuid>', false)
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.profile_status as enum ('unpaid', 'active', 'blocked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, status public.profile_status not null default 'unpaid', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), avatar_url text, level integer not null default 1 check (level between 1 and 14),
  role public.app_role not null default 'student', admin_tier text check (admin_tier in ('super', 'standard')),
  level_free boolean not null default false, notif_group boolean not null default true
);

create table public.groups (
  code text primary key check (code ~ '^[A-Z0-9]{5,12}$'), name text not null, schedule text not null, zoom_link text,
  is_active boolean not null default true, created_at timestamptz not null default now(), schedule_days jsonb not null default '[]'::jsonb,
  type text not null default 'class' check (type in ('class', 'individual')), slot_minutes integer not null default 10,
  buffer_minutes integer not null default 2, no_show_minutes integer not null default 3, duration_minutes integer not null default 120,
  level smallint check (level is null or level between 1 and 14), letter text check (letter is null or letter ~ '^[A-G]$'),
  deadline_closed_at timestamptz, reopened_at timestamptz
);
create unique index groups_letter_level_uidx on public.groups (letter, level) where letter is not null and level is not null;
create unique index groups_letter_placeholder_uidx on public.groups (letter) where letter is not null and level is null;

create table public.group_members (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, group_code text not null references public.groups(code) on delete cascade,
  name text, joined_at timestamptz default now(), avatar_url text
);
create unique index group_members_user_group_unique on public.group_members (user_id, group_code);

create table public.teacher_groups (
  teacher_id uuid not null references auth.users(id) on delete cascade, group_code text not null references public.groups(code) on delete cascade,
  created_at timestamptz not null default now(), primary key (teacher_id, group_code)
);
create table public.group_access_codes (code text primary key, group_code text not null unique, created_at timestamptz default now());
create table public.join_attempts (id bigserial primary key, user_id uuid not null, ip text, ok boolean not null default false, created_at timestamptz not null default now());
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text not null, title text not null, body text not null default '',
  link text, is_read boolean not null default false, created_at timestamptz not null default now()
);

create table public.written_exams (
  id uuid primary key default gen_random_uuid(), group_code text not null references public.groups(code) on delete cascade, title text not null,
  is_published boolean not null default false, created_by uuid, created_at timestamptz not null default now(), duration_minutes integer,
  level smallint check (level is null or level between 1 and 14), exam_kind text check (exam_kind is null or exam_kind in ('midterm', 'final')),
  deadline_at timestamptz
);
create table public.written_exam_submissions (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.written_exams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, status text not null default 'draft' check (status in ('draft', 'submitted', 'graded')),
  started_at timestamptz not null default now(), submitted_at timestamptz, total_score integer check (total_score is null or total_score between 0 and 100),
  ai_lock_until timestamptz, clock_started_at timestamptz, paused_seconds integer not null default 0, unique (exam_id, user_id)
);
create table public.written_exam_answers (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.written_exam_submissions(id) on delete cascade,
  question_id uuid not null, answer_text text not null default '', ai_score integer, teacher_score integer
);
create table public.written_exam_attempt_archive (
  id uuid primary key default gen_random_uuid(), submission_id uuid, exam_id uuid, user_id uuid not null, level integer, exam_kind text, status text,
  total_score integer, started_at timestamptz, submitted_at timestamptz, answers jsonb not null default '[]'::jsonb,
  reason text not null default 'level_reset', archived_at timestamptz not null default now()
);
create table public.written_exam_extensions (
  exam_id uuid not null references public.written_exams(id) on delete cascade, user_id uuid not null, until_at timestamptz not null,
  granted_by uuid default auth.uid(), created_at timestamptz not null default now(), primary key (exam_id, user_id)
);
create table public.level_transitions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, from_level integer not null,
  to_level integer not null, outcome text not null check (outcome in ('passed', 'failed')), total_points numeric, from_group text, to_group text,
  created_at timestamptz not null default now(), from_group_name text, to_group_name text, seen_at timestamptz, midterm_points numeric,
  final_points numeric, reason text not null default 'exam'
);

/* ---- role helpers (as live) ---- */
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
create function public.is_teacher() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher') $$;
create function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super') $$;
create function public.is_standard_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.admin_tier = 'standard') $$;
create function public.ufuq_is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin')) $$;
create function public.teaches_group(p_group_code text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (select 1 from public.teacher_groups where teacher_id = auth.uid() and group_code = p_group_code) $$;
create function public.user_has_access(p_uid uuid) returns boolean language sql stable as $$ select true $$;   -- payments are not enforced
create function public._new_join_code() returns text language plpgsql set search_path = public as $$
declare alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v text; b bytea; i int;
begin
  loop
    b := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 1 for 1);
    v := '';
    for i in 0..6 loop v := v || substr(alphabet, (get_byte(b, i) % 31) + 1, 1); end loop;
    exit when v ~ '[A-Z]' and v ~ '[2-9]';
  end loop;
  return v;
end $$;

/* ---- scoring (as live) ---- */
create function public.ufuq_pass_mark() returns integer language sql immutable as $$ select 75 $$;
create function public.ufuq_exam_max(p_kind text) returns integer language sql immutable as $$ select case p_kind when 'midterm' then 50 else 100 end $$;
create function public.ufuq_exam_points(p_total numeric, p_kind text) returns numeric language sql immutable as $$
  select case when p_total is null then null else round(least(greatest(p_total, 0), 100) * public.ufuq_exam_max(p_kind) / 100.0, 1) end $$;

create function public.ufuq_level_result(p_user uuid, p_level integer, p_since timestamptz)
returns table (level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points integer, pass_mark integer,
               midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path = public as $$
  with s as (
    select e.exam_kind as kind, public.ufuq_exam_points(sub.total_score, e.exam_kind) as pts,
           row_number() over (partition by e.exam_kind order by coalesce(sub.submitted_at, sub.started_at) desc) as rn
    from public.written_exam_submissions sub
    join public.written_exams e on e.id = sub.exam_id
    where sub.user_id = p_user and sub.status = 'graded' and sub.total_score is not null
      and e.level = p_level and e.exam_kind in ('midterm', 'final')
      and (p_since is null or coalesce(sub.submitted_at, sub.started_at) > p_since)
  ), r as (
    select (select pts from s where kind = 'midterm' and rn = 1) as m, (select pts from s where kind = 'final' and rn = 1) as f
  )
  select p_level, r.m, r.f, coalesce(r.m, 0) + coalesce(r.f, 0), 150, public.ufuq_pass_mark(),
         r.m is not null, r.f is not null, (r.m is not null and r.f is not null),
         (r.m is not null and r.f is not null and coalesce(r.m, 0) + coalesce(r.f, 0) >= public.ufuq_pass_mark())
  from r
$$;
create function public.ufuq_level_result(p_user uuid, p_level integer)
returns table (level integer, midterm_points numeric, final_points numeric, total_points numeric, max_points integer, pass_mark integer,
               midterm_done boolean, final_done boolean, complete boolean, passed boolean)
language sql stable security definer set search_path = public as $$ select * from public.ufuq_level_result(p_user, p_level, null::timestamptz) $$;

create function public.ufuq_reset_level_attempts(p_user uuid, p_level integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_n int;
begin
  select array_agg(s.id) into v_ids from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id
   where s.user_id = p_user and e.level = p_level and e.exam_kind in ('midterm', 'final');
  if v_ids is null then return 0; end if;
  insert into public.written_exam_attempt_archive (submission_id, exam_id, user_id, level, exam_kind, status, total_score, started_at, submitted_at, answers, reason)
  select s.id, s.exam_id, s.user_id, p_level, e.exam_kind, s.status, s.total_score, s.started_at, s.submitted_at,
         coalesce((select jsonb_agg(to_jsonb(a)) from public.written_exam_answers a where a.submission_id = s.id), '[]'::jsonb), 'level_reset'
    from public.written_exam_submissions s join public.written_exams e on e.id = s.exam_id where s.id = any (v_ids);
  delete from public.written_exam_submissions where id = any (v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

/* ---- group triggers (as live) ---- */
create function public.trg_groups_level_name() returns trigger language plpgsql set search_path = public as $$
declare m text;
begin
  if new.type = 'individual' then new.level := null; new.letter := null; return new; end if;
  if tg_op = 'INSERT' or old.name is distinct from new.name then
    m := upper((regexp_match(btrim(new.name), '^(?:group|guruh)[ _-]*([A-Ga-g])[0-9]*$', 'i'))[1]);
    if m is not null then new.letter := m; end if;
  end if;
  if new.letter is not null then new.name := 'Group ' || new.letter || coalesce(new.level::text, ''); end if;
  return new;
end $$;
create trigger groups_level_name before insert or update of level, name, type, letter on public.groups for each row execute function public.trg_groups_level_name();

create function public.trg_groups_require_letter_level() returns trigger language plpgsql set search_path = public as $$
begin
  if new.type = 'class' then
    if new.letter is null or new.letter !~ '^[A-G]$' then raise exception 'GROUP_LETTER_REQUIRED'; end if;
    if new.level is null or new.level < 1 or new.level > 14 then raise exception 'GROUP_LEVEL_REQUIRED'; end if;
  end if;
  return new;
end $$;
create trigger groups_require_letter_level before insert on public.groups for each row execute function public.trg_groups_require_letter_level();

create function public.trg_groups_reopen_mark() returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_active and not coalesce(old.is_active, false) then
    new.reopened_at := now();
    new.deadline_closed_at := null;
  end if;
  return new;
end $$;
create trigger groups_reopen_mark before update of is_active on public.groups for each row execute function public.trg_groups_reopen_mark();

create function public.trg_new_group_access_code() returns trigger language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop c := public._new_join_code(); exit when not exists (select 1 from public.group_access_codes a where a.code = c); end loop;
  insert into public.group_access_codes (code, group_code) values (c, new.code) on conflict do nothing;
  return new;
end $$;
create trigger new_group_access_code after insert on public.groups for each row execute function public.trg_new_group_access_code();

create function public.sync_new_group_to_admins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.teacher_groups (teacher_id, group_code)
  select id, new.code from public.profiles where role = 'admin'
  on conflict (teacher_id, group_code) do nothing;
  return new;
end $$;
create trigger trg_sync_new_group_to_admins after insert on public.groups for each row execute function public.sync_new_group_to_admins();

create function public.notify_group_on_new_member() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select gm.user_id, 'group', coalesce(new.name, 'Yangi talaba') || ' guruhga qo''shildi', '', null
  from public.group_members gm join public.profiles p on p.id = gm.user_id
  where gm.group_code = new.group_code and gm.user_id <> new.user_id and p.notif_group = true;
  return new;
end $$;
create trigger trg_notify_new_member after insert on public.group_members for each row execute function public.notify_group_on_new_member();

/* ---- exams: who teaches / deadline sweep / automatic result (as live) ---- */
create function public.ufuq_teaches_level_exam(p_exam_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
     where e.id = p_exam_id and e.exam_kind is not null and e.level is not null
       and exists (select 1 from public.teacher_groups tg join public.groups g on g.code = tg.group_code
                    where tg.teacher_id = auth.uid() and g.type = 'class' and g.level = e.level)) $$;
create function public.teaches_written_exam(p_exam_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.written_exams e where e.id = p_exam_id and public.teaches_group(e.group_code))
      or public.ufuq_teaches_level_exam(p_exam_id) $$;

create function public.ufuq_group_final_deadline(p_group text, p_level integer) returns timestamptz language sql stable set search_path = public as $$
  select max(e.deadline_at) from public.written_exams e
   where e.exam_kind = 'final' and e.level = p_level and e.is_published and e.deadline_at is not null
     and (e.group_code = p_group
          or e.group_code in (select g2.code from public.groups g2
                               where g2.type = 'class' and g2.letter is not null
                                 and g2.letter = (select g.letter from public.groups g where g.code = p_group))) $$;

create function public.ufuq_sweep_group_deadlines() returns integer language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  update public.groups g set is_active = false, deadline_closed_at = now()
   where g.type = 'class' and g.level is not null and g.is_active
     and public.ufuq_group_final_deadline(g.code, g.level) < now()
     and public.ufuq_group_final_deadline(g.code, g.level) > coalesce(g.reopened_at, '-infinity'::timestamptz);
  get diagnostics n = row_count;
  update public.groups g set is_active = true
   where g.type = 'class' and g.level is not null and not g.is_active and g.deadline_closed_at is not null
     and public.ufuq_group_final_deadline(g.code, g.level) > now();
  get diagnostics k = row_count;
  return n + k;
end $$;

create function public.trg_exam_deadline_sweep() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.exam_kind = 'final' then
    begin perform public.ufuq_sweep_group_deadlines();
    exception when others then raise warning 'deadline sweep failed: %', sqlerrm; end;
  end if;
  return null;
end $$;
create trigger exam_deadline_sweep after insert or update of deadline_at, is_published, level, exam_kind on public.written_exams
  for each row execute function public.trg_exam_deadline_sweep();

-- old versions of the functions the migration replaces with another signature / return type
create function public.ufuq_pick_level_group(p_from_level integer, p_up boolean) returns text language sql stable as $$ select null::text $$;
create function public.ufuq_resolve_target_group(p_user uuid, p_from integer, p_to integer) returns text language sql stable as $$ select null::text $$;
create function public.my_closed_groups() returns table (code text, name text, level smallint, closed_at timestamptz) language sql stable as $$
  select null::text, null::text, null::smallint, null::timestamptz where false $$;

-- the grading trigger exactly as live: an exception inside the level move is downgraded to a warning (the grade itself is kept)
create function public.ufuq_apply_level_result(p_user uuid, p_level integer) returns void language sql as $$ select $$;
create function public.trg_level_result_apply() returns trigger language plpgsql security definer set search_path = public as $$
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
create trigger level_result_apply after insert or update of status, total_score on public.written_exam_submissions
  for each row execute function public.trg_level_result_apply();

create function public.ack_level_transition(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare t public.level_transitions%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.level_transitions set seen_at = now() where id = p_id and user_id = auth.uid() and seen_at is null returning * into t;
  if not found then return; end if;
  if t.reason = 'exam' and t.outcome = 'failed' and t.from_level = t.to_level
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.level = t.to_level) then
    perform public.ufuq_reset_level_attempts(auth.uid(), t.to_level);
  end if;
end $$;
