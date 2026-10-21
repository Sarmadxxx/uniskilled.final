-- Exported from the live database migration history (20261008212258 cron_shared_secret).

-- Random shared secret for pg_cron -> Edge Function calls, stored only in Vault.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'cron_secret',
      'Shared secret sent by pg_cron jobs to scheduled Edge Functions (x-cron-secret header)');
  END IF;
END $$;

-- Lets Edge Functions (service role only) check a presented secret without ever reading it.
CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(length(p_secret) > 0 AND p_secret = (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'), false);
$$;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;
