-- STATUS: NOT YET APPLIED (the MCP session cancelled it). Run the whole file once in Supabase -> SQL Editor.

-- A) Exams: students never write exam tables directly (only via begin/save/submit RPCs); only the exam's teacher may update.
drop policy if exists written_exam_answers_insert_own on public.written_exam_answers;
drop policy if exists written_exam_submissions_insert_own on public.written_exam_submissions;

drop policy if exists written_exam_answers_update_combined on public.written_exam_answers;
create policy written_exam_answers_update_teacher on public.written_exam_answers for update to authenticated
  using (exists (select 1 from public.written_exam_submissions s where s.id = written_exam_answers.submission_id and public.teaches_written_exam(s.exam_id)))
  with check (exists (select 1 from public.written_exam_submissions s where s.id = written_exam_answers.submission_id and public.teaches_written_exam(s.exam_id)));

drop policy if exists written_exam_submissions_update_combined on public.written_exam_submissions;
create policy written_exam_submissions_update_teacher on public.written_exam_submissions for update to authenticated
  using (public.teaches_written_exam(exam_id))
  with check (public.teaches_written_exam(exam_id));

-- B) Exam access also requires an active subscription
create or replace function public.can_take_written_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.written_exams e
    where e.id = p_exam_id and e.is_published
      and (
        (e.group_code in (select public.my_group_codes()) and public.user_has_access(auth.uid()))
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  );
$$;

-- C) Admin escalation: only a super admin may touch the role/admin_tier of an admin or create one; student_id is immutable for non-admins
create or replace function public.guard_admin_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.admin_tier is distinct from old.admin_tier
       or (new.role = 'admin' and old.role is distinct from 'admin')
       or (old.role = 'admin' and new.role is distinct from 'admin') then
      raise exception 'Faqat asosiy administrator admin rollarini o''zgartira oladi.';
    end if;
    if new.student_id is distinct from old.student_id and not public.is_admin() then
      raise exception 'student_id o''zgartirib bo''lmaydi.';
    end if;
  end if;
  return new;
end $$;

-- D) Housekeeping
drop function if exists public._probe_fn();
revoke execute on function public.record_deletion_feedback(text, text) from public, anon;
