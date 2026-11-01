-- NOT YET APPLIED (changes the table, a column grant and a storage policy: needs the owner's go-ahead).
-- A homework submission can hold up to 5 photos: the first stays in file_path / file_name (so every existing screen keeps working), the
-- other 4 are stored as [{ "path": "...", "name": "..." }] in the new column extra_files. Until this is applied the student page
-- detects the missing column and accepts ONE photo, exactly as before.
alter table public.task_submissions add column if not exists extra_files jsonb not null default '[]'::jsonb;
alter table public.task_submissions drop constraint if exists task_submissions_extra_files_max4;
alter table public.task_submissions add constraint task_submissions_extra_files_max4
  check (jsonb_typeof(extra_files) = 'array' and jsonb_array_length(extra_files) <= 4);
-- the table uses column-level grants: the new column needs its own
grant select (extra_files), insert (extra_files), update (extra_files) on public.task_submissions to authenticated;
-- a teacher may read the extra photos of the students of the groups they teach (the old rule matched file_path only)
alter policy submissions_teacher_read on storage.objects using (
  (bucket_id = 'task-submissions') and exists (
    select 1 from public.task_submissions ts join public.tasks t on t.id = ts.task_id
     where (ts.file_path = objects.name
            or exists (select 1 from jsonb_array_elements(ts.extra_files) x where x->>'path' = objects.name))
       and public.teaches_group(t.group_code)));