-- A closed (inactive) class group keeps nobody: the moment a group is switched off (deadline passed, cohort moved on, by hand)
-- every member is removed from it. Replaces the "Students in switched-off groups" window of the Groups page.
-- Safe to run more than once.
create or replace function public.trg_group_closed_empties() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'class' and not new.is_active and coalesce(old.is_active, false) then
    delete from public.group_members where group_code = new.code;
  end if;
  return null;
end $$;
revoke all on function public.trg_group_closed_empties() from public, anon, authenticated;
drop trigger if exists group_closed_empties on public.groups;
create trigger group_closed_empties after update of is_active on public.groups
  for each row execute function public.trg_group_closed_empties();

-- one-time: whoever still sits in a group that is already closed leaves it now
delete from public.group_members m using public.groups g
 where g.code = m.group_code and g.type = 'class' and not g.is_active;
