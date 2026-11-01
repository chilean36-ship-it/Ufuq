-- STAGE 6: exam deadline. After written_exams.deadline_at a student can no longer START the exam
-- (a paper already started can still be finished). Staff can list who missed it. Safe to run more than once.
alter table public.written_exams add column if not exists deadline_at timestamptz;

create or replace function public.start_written_exam(p_exam_id uuid)
returns setof public.written_exam_submissions
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_sub public.written_exam_submissions;
  v_role text;
  v_lvl int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select role::text, coalesce(level, 1) into v_role, v_lvl from public.profiles where id = v_uid;
  select e.id, e.group_code, e.is_published, e.level, e.exam_kind, e.deadline_at into v_exam from public.written_exams e where e.id = p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  if found then return next v_sub; return; end if;
  if not v_exam.is_published then raise exception 'EXAM_NOT_PUBLISHED'; end if;
  if v_exam.deadline_at is not null and now() > v_exam.deadline_at and coalesce(v_role, '') = 'student' then
    raise exception 'EXAM_DEADLINE_PASSED';
  end if;
  if not public.user_has_access(v_uid) then raise exception 'PAYMENT_REQUIRED'; end if;
  if coalesce(v_role, '') <> 'admin'
     and not exists (select 1 from public.group_members gm where gm.user_id = v_uid and gm.group_code = v_exam.group_code) then
    raise exception 'NOT_IN_GROUP';
  end if;
  if v_role = 'student' and v_exam.exam_kind is not null and v_exam.level is not null and v_exam.level <> v_lvl then
    raise exception 'LEVEL_MISMATCH';
  end if;
  insert into public.written_exam_submissions (exam_id, user_id, status) values (p_exam_id, v_uid, 'draft')
    on conflict (exam_id, user_id) do nothing;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  return next v_sub;
end $$;

-- Staff (teacher of the exam's group): group members who never handed this exam in.
create or replace function public.exam_missed_students(p_exam_id uuid)
returns table(user_id uuid, name text, status text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.name, s.status
    from public.written_exams e
    join public.group_members m on m.group_code = e.group_code
    left join public.written_exam_submissions s on s.exam_id = e.id and s.user_id = m.user_id
   where e.id = p_exam_id and public.teaches_written_exam(e.id)
     and (s.id is null or s.status = 'draft')
   order by m.name
$$;
revoke all on function public.exam_missed_students(uuid) from public, anon;
grant execute on function public.exam_missed_students(uuid) to authenticated;

notify pgrst, 'reload schema';
