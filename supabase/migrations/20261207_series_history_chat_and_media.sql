-- Group chat + teacher media (videos / audio) follow the student up the levels, like audio lessons and board photos already do
-- (20261129_series_materials_and_real_students.sql). Safe to run twice. NOT applied until run in the SQL editor.
--
-- Problem: a student who moves to the next level group (A1 -> A2 ...) lands in a NEW group code, and group_messages / group_media_targets
-- are keyed by group code, so the chat looked empty and the teacher's videos / audio of the old group disappeared.
-- Nothing is copied or moved: the old rows stay where they are, and the student may READ every group of his own letter at or below
-- his level (public.ufuq_my_series_codes()). Writing (new messages, reactions, edits, deletes) still only works in the current group.
--
-- Permissive policies are OR-ed, so these are additions; the existing policies (and the paywall_restrict ones) stay as they are.

drop policy if exists group_messages_select_series on public.group_messages;
create policy group_messages_select_series on public.group_messages for select to authenticated
  using (group_code in (select public.ufuq_my_series_codes()));

drop policy if exists group_message_reactions_select_series on public.group_message_reactions;
create policy group_message_reactions_select_series on public.group_message_reactions for select to authenticated
  using (group_code in (select public.ufuq_my_series_codes()));

drop policy if exists group_media_select_series on public.group_media;
create policy group_media_select_series on public.group_media for select to authenticated
  using (exists (select 1 from public.group_media_targets t
                  where t.media_id = group_media.id and t.group_code in (select public.ufuq_my_series_codes())));

drop policy if exists group_media_targets_select_series on public.group_media_targets;
create policy group_media_targets_select_series on public.group_media_targets for select to authenticated
  using (group_code in (select public.ufuq_my_series_codes()));
