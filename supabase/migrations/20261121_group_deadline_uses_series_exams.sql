-- APPLIED to live on 2026-11-01 (with the owner's go-ahead; it changes when groups are closed).
-- The sweep that switches a group off when the deadline of ITS final exam passes (ufuq_sweep_group_deadlines -> ufuq_group_final_deadline)
-- only looked at final exams stored under the group's OWN code. A series keeps its level exams under the code of the group that was
-- created first (Group A8's code holds the level-7 final), so Group A7 never saw the deadline and would stay active for ever,
-- while the students who did not pass could never be moved on. The deadline of a group is now the latest published final of its
-- level among all class groups of the same series (same letter); a group without a letter keeps the old behaviour.
create or replace function public.ufuq_group_final_deadline(p_group text, p_level integer)
returns timestamp with time zone
language sql stable set search_path to 'public' as $$
  select max(e.deadline_at) from public.written_exams e
   where e.exam_kind = 'final' and e.level = p_level and e.is_published and e.deadline_at is not null
     and (e.group_code = p_group
          or e.group_code in (select g2.code from public.groups g2
                               where g2.type = 'class' and g2.letter is not null
                                 and g2.letter = (select g.letter from public.groups g where g.code = p_group)))
$$;