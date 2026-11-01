-- APPLIED via Supabase MCP (groups_code_allow_letters).
-- New groups get an internal key that contains letters. Existing rows are untouched (they still satisfy the wider check).
alter table public.groups drop constraint if exists groups_code_is_5_digits;
alter table public.groups drop constraint if exists groups_code_format;
alter table public.groups add constraint groups_code_format check (code ~ '^[A-Z0-9]{5,12}$');
