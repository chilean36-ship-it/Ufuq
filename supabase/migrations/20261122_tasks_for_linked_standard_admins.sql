-- NOT YET APPLIED (changes who may create tasks: needs the owner's go-ahead).
-- Creating / editing / deleting a task failed for the teachers' accounts with
--   new row violates row-level security policy "no_std_admin_ins" for table "tasks"
-- because three RESTRICTIVE policies (no_std_admin_ins / _upd / _del) refuse every "standard" admin, while the teachers work with
-- exactly such accounts. Without them the ordinary policies decide: tasks_insert_teacher / _update_teacher / _delete_teacher
-- require teaches_group(group_code), i.e. a standard admin can manage the tasks of the groups LINKED to them and of no other group.
drop policy if exists no_std_admin_ins on public.tasks;
drop policy if exists no_std_admin_upd on public.tasks;
drop policy if exists no_std_admin_del on public.tasks;