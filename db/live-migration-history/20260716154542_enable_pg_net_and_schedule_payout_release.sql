-- Exported from the live database migration history (20260716154542 enable_pg_net_and_schedule_payout_release).

CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'release-tutor-payouts-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://orghkbbohnabcietidiv.supabase.co/functions/v1/release-tutor-payout',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
