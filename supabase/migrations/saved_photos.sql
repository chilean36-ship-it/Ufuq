-- ALREADY APPLIED to the Supabase project (ldbthwpikixtykwmvudy) on 2026-10-02 as migration "saved_photos". Kept here for the record.
-- Student bookmarks for Board Photos (Library → List → "Photos"). Saved audio lives in saved_lessons, so the two never mix.

do $$
declare t text;
begin
  -- match board_photos.id whatever its type is (uuid / bigint)
  select format_type(atttypid, atttypmod) into t
  from pg_attribute where attrelid = 'public.board_photos'::regclass and attname = 'id';

  execute format($f$
    create table if not exists public.saved_photos (
      user_id  uuid not null references auth.users(id) on delete cascade,
      photo_id %s   not null references public.board_photos(id) on delete cascade,
      saved_at timestamptz not null default now(),
      primary key (user_id, photo_id)
    )$f$, t);
end $$;

alter table public.saved_photos enable row level security;

drop policy if exists saved_photos_select_own on public.saved_photos;
create policy saved_photos_select_own on public.saved_photos
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists saved_photos_insert_own on public.saved_photos;
create policy saved_photos_insert_own on public.saved_photos
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists saved_photos_delete_own on public.saved_photos;
create policy saved_photos_delete_own on public.saved_photos
  for delete to authenticated using (user_id = (select auth.uid()));

-- needed by upsert (ON CONFLICT DO UPDATE)
drop policy if exists saved_photos_update_own on public.saved_photos;
create policy saved_photos_update_own on public.saved_photos
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
