-- Study Campus: the Sunday summary email.
-- Applied 28 Nov 2026 after approval, together with the updated studyhq-reminders function.
--
-- weekly_email:   the student turned on the Sunday summary (off by default).
-- weekly_sent_on: the local date the last summary went out; only the server job sets it.

ALTER TABLE public.study_reminders ADD COLUMN IF NOT EXISTS weekly_email boolean NOT NULL DEFAULT false;
ALTER TABLE public.study_reminders ADD COLUMN IF NOT EXISTS weekly_sent_on date;

-- Same guard as before, now also keeping weekly_sent_on for the server job only.
CREATE OR REPLACE FUNCTION public.study_reminders_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'A Study Campus row cannot change owner' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    NEW.last_sent_on := CASE WHEN TG_OP = 'UPDATE' THEN OLD.last_sent_on ELSE NULL END;
    NEW.weekly_sent_on := CASE WHEN TG_OP = 'UPDATE' THEN OLD.weekly_sent_on ELSE NULL END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.study_reminders_guard() FROM PUBLIC;
