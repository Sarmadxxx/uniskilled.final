-- UniSkilled — let the hourly payout job's HTTP call wait up to 60 s (applied 20 Nov 2026).
-- With pg_net's default 5 s the call timed out every hour (net._http_response "Timeout of 5000 ms
-- reached"), so its result and any errors were never recorded, although the function finished.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'release-tutor-payouts-hourly'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://orghkbbohnabcietidiv.supabase.co/functions/v1/release-tutor-payout',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);
