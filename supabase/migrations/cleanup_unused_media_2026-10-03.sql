-- Cleanup 2026-10-03 (APPLIED). Removed leftovers that nothing in the app uses:
--   * public.saved_media, public.media_items  — empty (0 rows), no code references; superseded by group_media / group_media_targets
--   * public.delete_media_item(uuid)          — helper of media_items only
--   * public.get_video_source(uuid)           — legacy YouTube helper; its table private.video_sources no longer exists
drop table if exists public.saved_media;
drop table if exists public.media_items;
drop function if exists public.delete_media_item(uuid);
drop function if exists public.get_video_source(uuid);
