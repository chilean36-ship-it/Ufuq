-- Stage 2 (APPLIED to live via MCP; prep for stage 3): a group belongs to one level (1..14).
-- Nullable: old groups ("Group A"...) stay valid until renamed in stage 3.
alter table public.groups add column if not exists level smallint;
alter table public.groups drop constraint if exists groups_level_check;
alter table public.groups add constraint groups_level_check check (level is null or level between 1 and 14);
create index if not exists groups_level_idx on public.groups (level) where level is not null;
notify pgrst, 'reload schema';
