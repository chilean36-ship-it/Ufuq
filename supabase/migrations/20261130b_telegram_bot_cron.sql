-- Owner-only Telegram bot: daily report at 08:00 Asia/Tashkent = 03:00 UTC (pg_cron runs in UTC).
-- pg_net calls the cron-monitor Edge Function. The shared secret is read from Vault at run time, never stored here.
-- Before the first run, create the Vault secret yourself in the SQL editor (same value as the BOT_CRON_SECRET function secret):
--   select vault.create_secret('<long random>', 'bot_cron_secret');
-- Without it the call is rejected with 401 and nothing is sent.
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'ufuq-bot-daily';
select cron.schedule('ufuq-bot-daily', '0 3 * * *', $$
  select net.http_post(
    url := 'https://ldbthwpikixtykwmvudy.supabase.co/functions/v1/cron-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'bot_cron_secret'), '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$$);
