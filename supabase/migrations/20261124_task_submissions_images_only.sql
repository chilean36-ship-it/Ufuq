-- APPLIED to live on 2026-11-01 (with the owner's request: homework uploads are photos only).
-- The private bucket "task-submissions" only accepts image types, whatever the browser sends (the app checks it first, this is the server-side guard).
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','image/bmp','image/tiff']
 where id = 'task-submissions';