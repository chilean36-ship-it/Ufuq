-- Admin > Administration > Resources: database size and file-storage size for the Edge Function `resource-usage`
-- (the function checks that the caller is the main admin; only service_role may run this).
create or replace function public.admin_resource_usage() returns jsonb
language sql stable security definer set search_path = public, storage as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum(coalesce((o.metadata->>'size')::bigint, 0)) from storage.objects o), 0),
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('name', b.bucket_id, 'bytes', b.bytes) order by b.bytes desc)
                           from (select o.bucket_id, sum(coalesce((o.metadata->>'size')::bigint, 0)) bytes from storage.objects o group by o.bucket_id) b), '[]'::jsonb)
  )
$$;
revoke all on function public.admin_resource_usage() from public, anon, authenticated;
grant execute on function public.admin_resource_usage() to service_role;
