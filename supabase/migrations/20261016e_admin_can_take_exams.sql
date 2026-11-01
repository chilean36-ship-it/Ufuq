-- Admins may open/take written exams of any group without being a group member. Teachers still cannot (checked in UI + here).
create or replace function public.start_written_exam(p_exam_id uuid)
returns setof public.written_exam_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_sub public.written_exam_submissions;
  v_role text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select role into v_role from public.profiles where id = v_uid;
  select e.id, e.group_code, e.is_published into v_exam from public.written_exams e where e.id = p_exam_id;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;

  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  if found then return next v_sub; return; end if;

  if not v_exam.is_published then raise exception 'EXAM_NOT_PUBLISHED'; end if;
  if coalesce(v_role, '') <> 'admin'
     and not exists (select 1 from public.group_members gm where gm.user_id = v_uid and gm.group_code = v_exam.group_code) then
    raise exception 'NOT_IN_GROUP';
  end if;

  insert into public.written_exam_submissions (exam_id, user_id, status) values (p_exam_id, v_uid, 'draft')
    on conflict (exam_id, user_id) do nothing;
  select * into v_sub from public.written_exam_submissions s where s.exam_id = p_exam_id and s.user_id = v_uid;
  return next v_sub;
end $$;

-- The questions RPC (and RLS) rely on this helper: let admins through too.
create or replace function public.can_take_written_exam(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.written_exams e
    where e.id = p_exam_id
      and e.is_published
      and (
        e.group_code in (select public.my_group_codes())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  );
$$;
