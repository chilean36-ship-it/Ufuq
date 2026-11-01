-- STAGE 10b (APPLIED to live via MCP on 2026-11-01): the group deadline sweep runs every minute.
-- The sweep is also called when an admin opens Groups, when a student opens Home, and whenever a final exam is saved,
-- so a missing cron job only delays the closing; it never breaks anything.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'ufuq-sweep-group-deadlines';
select cron.schedule('ufuq-sweep-group-deadlines', '* * * * *', $$select public.ufuq_sweep_group_deadlines()$$);
