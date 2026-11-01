-- Hifz (Qur'an memorisation) checker for individual groups.
-- Depends on helpers from group_media.sql: ufuq_is_staff(), ufuq_is_admin(); and tables profiles, group_members, teacher_groups.
-- Run once in the Supabase SQL editor (project "ldbthwpikixtykwmvudy", already applied).

create table if not exists public.hifz_assignments (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  surah       int  not null check (surah between 1 and 114),
  from_ayah   int  not null check (from_ayah >= 1),
  to_ayah     int  not null,
  due_date    date,
  note        text not null default '',
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint hifz_range_ok check (to_ayah >= from_ayah and to_ayah - from_ayah < 60)
);
create index if not exists hifz_assignments_student_idx on public.hifz_assignments (student_id, created_at desc);
create index if not exists hifz_assignments_group_idx on public.hifz_assignments (group_code);

create table if not exists public.hifz_attempts (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.hifz_assignments(id) on delete cascade,
  student_id     uuid not null,
  transcript     text not null default '',
  word_results   jsonb not null default '[]'::jsonb,   -- [{ayah,text,status,heard}]
  extras         jsonb not null default '[]'::jsonb,
  score          numeric(5,1) not null default 0,
  correct_count  int not null default 0,
  near_count     int not null default 0,
  wrong_count    int not null default 0,
  missing_count  int not null default 0,
  total_words    int not null default 0,
  asr_engine     text not null default '',
  teacher_verdict text check (teacher_verdict in ('approved','repeat')),
  teacher_note   text,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists hifz_attempts_assignment_idx on public.hifz_attempts (assignment_id, created_at desc);
create index if not exists hifz_attempts_student_recent_idx on public.hifz_attempts (student_id, created_at desc);

-- SECURITY DEFINER helpers so policies never recurse into RLS of other tables.
create or replace function public.ufuq_teaches(code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teacher_groups where teacher_id = auth.uid() and group_code = code);
$$;
create or replace function public.ufuq_is_member(uid uuid, code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where user_id = uid and group_code = code);
$$;
create or replace function public.ufuq_hifz_group(aid uuid) returns text
language sql stable security definer set search_path = public as $$
  select group_code from public.hifz_assignments where id = aid;
$$;

alter table public.hifz_assignments enable row level security;
alter table public.hifz_attempts enable row level security;

drop policy if exists hifz_assignments_select on public.hifz_assignments;
create policy hifz_assignments_select on public.hifz_assignments for select to authenticated using (
  student_id = (select auth.uid()) or created_by = (select auth.uid())
  or public.ufuq_is_admin() or public.ufuq_teaches(group_code)
);
drop policy if exists hifz_assignments_insert on public.hifz_assignments;
create policy hifz_assignments_insert on public.hifz_assignments for insert to authenticated with check (
  created_by = (select auth.uid()) and public.ufuq_is_staff()
  and (public.ufuq_is_admin() or public.ufuq_teaches(group_code))
  and public.ufuq_is_member(student_id, group_code)
);
drop policy if exists hifz_assignments_delete on public.hifz_assignments;
create policy hifz_assignments_delete on public.hifz_assignments for delete to authenticated using (
  created_by = (select auth.uid()) or public.ufuq_is_admin()
);

-- Students never insert attempts themselves: only the edge function (service role) does, so scores cannot be forged.
drop policy if exists hifz_attempts_select on public.hifz_attempts;
create policy hifz_attempts_select on public.hifz_attempts for select to authenticated using (
  student_id = (select auth.uid()) or public.ufuq_is_admin()
  or public.ufuq_teaches(public.ufuq_hifz_group(assignment_id))
);
drop policy if exists hifz_attempts_review on public.hifz_attempts;
create policy hifz_attempts_review on public.hifz_attempts for update to authenticated
  using (public.ufuq_is_admin() or public.ufuq_teaches(public.ufuq_hifz_group(assignment_id)))
  with check (public.ufuq_is_admin() or public.ufuq_teaches(public.ufuq_hifz_group(assignment_id)));

-- A teacher may only fill in the review columns.
create or replace function public.ufuq_hifz_review_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.assignment_id is distinct from old.assignment_id or new.student_id is distinct from old.student_id
     or new.transcript is distinct from old.transcript or new.word_results is distinct from old.word_results
     or new.score is distinct from old.score or new.created_at is distinct from old.created_at then
    raise exception 'hifz_attempts: only the review fields can be changed';
  end if;
  if new.teacher_verdict is distinct from old.teacher_verdict or new.teacher_note is distinct from old.teacher_note then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists hifz_attempts_review_only on public.hifz_attempts;
create trigger hifz_attempts_review_only before update on public.hifz_attempts
  for each row execute function public.ufuq_hifz_review_only();

-- Test assignment (replace the values):
-- insert into public.hifz_assignments (group_code, student_id, surah, from_ayah, to_ayah)
-- values ('<group_code>', '<student profile uuid>', 112, 1, 4);

-- Applied to project ldbthwpikixtykwmvudy as "hifz_review_column_grant" (2026-10-10).
-- The review policy needs an UPDATE privilege; grant only the two review columns (the trigger fills reviewed_by/at).
revoke update on public.hifz_attempts from authenticated, anon;
grant update (teacher_verdict, teacher_note) on public.hifz_attempts to authenticated;
revoke all on public.hifz_assignments from anon;
revoke all on public.hifz_attempts from anon;
