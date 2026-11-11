-- A new level group of a letter (A9 after A8 ...) inherits the staff links (teachers / ordinary admins) of that letter's other
-- groups, so somebody linked to "Group A" stays linked through every promotion. Complements the lifecycle migration, which
-- copies teachers from the template group when a promotion creates the group; this also covers groups made by hand.
-- Safe to run more than once.
create or replace function public.trg_groups_inherit_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'class' and new.letter is not null then
    insert into public.teacher_groups (teacher_id, group_code)
    select distinct tg.teacher_id, new.code
      from public.teacher_groups tg join public.groups g on g.code = tg.group_code
     where g.type = 'class' and g.letter = new.letter and g.code <> new.code
       and (g.is_active or g.reopened_at is not null or g.deadline_closed_at is not null or g.moved_on_at is not null)
    on conflict do nothing;
  end if;
  return null;
end $$;
revoke all on function public.trg_groups_inherit_staff() from public, anon, authenticated;
drop trigger if exists groups_inherit_staff on public.groups;
create trigger groups_inherit_staff after insert on public.groups
  for each row execute function public.trg_groups_inherit_staff();
