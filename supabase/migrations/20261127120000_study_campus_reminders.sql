-- Study Campus: reminders, "My progress" and research.
-- NOT APPLIED. Apply only after approval, together with the studyhq-reminders and
-- studyhq-calendar functions and the new study_daily email template.
--
-- 1. study_items may now hold "achievement" (something the student did) and "research"
--    (a research topic with its sources). The "Add something I did" button already existed
--    but could not save: the database did not accept the kind.
-- 2. study_reminders: one row per student. Everything is off until the student turns it on.
--    email_daily: one morning email on days with something due (never on empty days).
--    cal_token:   the secret in the student's private calendar link. Resetting it breaks the old link.
-- 3. A scheduled job runs studyhq-reminders every hour at :07.

ALTER TABLE public.study_items DROP CONSTRAINT IF EXISTS study_items_kind_check;
ALTER TABLE public.study_items ADD CONSTRAINT study_items_kind_check
  CHECK (kind IN ('assignment', 'task', 'note', 'resource', 'achievement', 'research'));

CREATE TABLE IF NOT EXISTS public.study_reminders (
  user_id      uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  email_daily  boolean NOT NULL DEFAULT false,
  email_hour   smallint NOT NULL DEFAULT 8 CHECK (email_hour BETWEEN 5 AND 11),
  tz           text NOT NULL DEFAULT 'Europe/Berlin' CHECK (char_length(tz) BETWEEN 1 AND 64),
  cal_token    text UNIQUE CHECK (cal_token IS NULL OR cal_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  last_sent_on date,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Same protection as every other Study Campus table: a student sees and changes only their own row.
ALTER TABLE public.study_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS study_own ON public.study_reminders;
CREATE POLICY study_own ON public.study_reminders FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.study_reminders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_reminders TO authenticated;
GRANT ALL ON public.study_reminders TO service_role;

-- The student may not set last_sent_on themselves (only the reminder job does), and the owner never changes.
CREATE OR REPLACE FUNCTION public.study_reminders_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'A Study Campus row cannot change owner' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    NEW.last_sent_on := CASE WHEN TG_OP = 'UPDATE' THEN OLD.last_sent_on ELSE NULL END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.study_reminders_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS study_reminders_guard ON public.study_reminders;
CREATE TRIGGER study_reminders_guard BEFORE INSERT OR UPDATE ON public.study_reminders
  FOR EACH ROW EXECUTE FUNCTION public.study_reminders_guard();

-- "Delete all Study Campus data" in Settings also removes this row (the page deletes it directly).

SELECT cron.unschedule('studyhq-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'studyhq-reminders');
SELECT cron.schedule('studyhq-reminders', '7 * * * *', $$
  SELECT net.http_post(
    url := 'https://orghkbbohnabcietidiv.supabase.co/functions/v1/studyhq-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')),
    body := '{}'::jsonb
  );
$$);
