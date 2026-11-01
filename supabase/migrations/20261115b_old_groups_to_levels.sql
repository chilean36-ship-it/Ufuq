-- STAGE 8b (APPLIED to live via MCP on 2026-11-01). Old lettered groups -> level groups, students follow their group.
-- Mapping: Group A -> Level 8, Group B -> Level 1, Group C -> Level 5, Group D -> Level 9.
-- NOT touched: Group E (one test account in it; the second "Group B -> Level 3" was ambiguous), F / G (already inactive),
--              the Qur'an group (type 'individual').
-- The trigger trg_groups_level_name renames a group to "Level-N" as soon as its level is set.
-- The test account "Student" is marked level_free (may sit in many groups; its level never moves it).

update public.profiles set level_free = true where id = 'c869c1ee-8bdf-470c-ab3d-4e587df37c56' and role = 'student';

update public.groups set level = 8 where type = 'class' and lower(btrim(name)) ~ '^(group|guruh)[ _-]*a$';
update public.groups set level = 1 where type = 'class' and lower(btrim(name)) ~ '^(group|guruh)[ _-]*b$';
update public.groups set level = 5 where type = 'class' and lower(btrim(name)) ~ '^(group|guruh)[ _-]*c$';
update public.groups set level = 9 where type = 'class' and lower(btrim(name)) ~ '^(group|guruh)[ _-]*d$';

-- a student in exactly one level group takes that group's level
with one as (
  select m.user_id, min(g.level) as lvl
    from public.group_members m join public.groups g on g.code = m.group_code join public.profiles p on p.id = m.user_id
   where g.type = 'class' and g.level is not null and p.role = 'student' and not p.level_free
   group by m.user_id having count(distinct g.level) = 1)
update public.profiles p set level = one.lvl, updated_at = now() from one where p.id = one.user_id and p.level is distinct from one.lvl;

-- a student still sitting in a level group of ANOTHER level leaves it (keeps the group of their own level)
delete from public.group_members m using public.groups g, public.profiles p
 where g.code = m.group_code and p.id = m.user_id and p.role = 'student' and not p.level_free
   and g.type = 'class' and g.level is not null and g.level <> coalesce(p.level, 1);

-- to switch off the other lettered groups later (reversible):
-- update public.groups set is_active = false where type = 'class' and level is null and is_active;
