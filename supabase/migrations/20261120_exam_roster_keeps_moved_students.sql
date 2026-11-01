-- APPLIED to live via MCP on 2026-11-01.
-- Results of a level exam must keep showing the students who already passed and moved up to the next group.
-- The results table used to list only the CURRENT members of the exam's group, so a student who passed (and moved from
-- Group A7 to Group A8) vanished from the old group's results, while the ones who had not taken the exam stayed visible.
--
-- staff_exam_roster(exam) = everybody who belongs to the exam's group + everybody who has a paper for the exam,
-- with the name, whether the student is still in that group and the class group they sit in now.
-- Only staff who may teach the exam get rows (same check as the submissions policies: teaches_written_exam).
create or replace function public.staff_exam_roster(p_exam_id uuid)
returns table(user_id uuid, name text, in_group boolean, current_group text, level integer)
language sql stable security definer set search_path = public as $fn$
  select p.id,
         coalesce(nullif(p.full_name, ''),
                  (select m2.name from public.group_members m2 where m2.user_id = p.id and coalesce(m2.name, '') <> '' limit 1),
                  'Student'),
         exists (select 1 from public.group_members m where m.user_id = p.id and m.group_code = e.group_code),
         (select g2.name from public.group_members m3 join public.groups g2 on g2.code = m3.group_code
           where m3.user_id = p.id and g2.type = 'class' order by g2.level desc nulls last limit 1),
         coalesce(p.level, 1)::int
    from public.written_exams e
    join lateral (
           select m.user_id from public.group_members m where m.group_code = e.group_code
           union
           select s.user_id from public.written_exam_submissions s where s.exam_id = e.id
         ) u on true
    join public.profiles p on p.id = u.user_id and p.role = 'student'
   where e.id = p_exam_id and public.teaches_written_exam(e.id)
   order by 2;
$fn$;
revoke all on function public.staff_exam_roster(uuid) from public, anon;
grant execute on function public.staff_exam_roster(uuid) to authenticated;

notify pgrst, 'reload schema';
