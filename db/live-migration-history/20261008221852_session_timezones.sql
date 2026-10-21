-- Exported from the live database migration history (20261008221852 session_timezones).

-- Sessions store a wall-clock date/time as the booker saw it, plus the IANA zone it was meant in.
-- starts_at / ends_at are the real instants, computed by the database, used by every job.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Berlin',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.group_sessions
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Berlin',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

CREATE OR REPLACE FUNCTION public.valid_timezone(tz text)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF tz IS NULL OR length(tz) > 64 THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz);
END $$;

-- Wall-clock time in a zone -> real instant. Used by Edge Functions (service role).
CREATE OR REPLACE FUNCTION public.local_to_utc(p_date date, p_time time, p_tz text)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT (p_date + p_time) AT TIME ZONE CASE WHEN public.valid_timezone(p_tz) THEN p_tz ELSE 'Europe/Berlin' END;
$$;
REVOKE ALL ON FUNCTION public.local_to_utc(date, time, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.local_to_utc(date, time, text) TO service_role;

-- Runs before the guard triggers (name sorts first) so guards can rely on starts_at.
CREATE OR REPLACE FUNCTION public.a0_compute_session_times()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.valid_timezone(NEW.timezone) THEN NEW.timezone := 'Europe/Berlin'; END IF;
  IF NEW.scheduled_date IS NOT NULL AND NEW.scheduled_time IS NOT NULL THEN
    NEW.starts_at := (NEW.scheduled_date + NEW.scheduled_time) AT TIME ZONE NEW.timezone;
    NEW.ends_at := NEW.starts_at + make_interval(mins => COALESCE(NEW.duration_minutes, 60));
  ELSE
    NEW.starts_at := NULL; NEW.ends_at := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.a0_compute_session_times() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER a0_compute_session_times BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.a0_compute_session_times();
CREATE OR REPLACE TRIGGER a0_compute_session_times BEFORE INSERT OR UPDATE ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.a0_compute_session_times();

-- Backfill existing rows (all current bookings were made in Berlin). Old €0 test rows that
-- predate the minimum-price rule are finished and unpaid; they're skipped.
UPDATE public.sessions
   SET timezone = timezone
 WHERE scheduled_date IS NOT NULL AND scheduled_time IS NOT NULL AND starts_at IS NULL
   AND (price IS NULL OR (currency = 'USD' AND price >= 11) OR (currency IS DISTINCT FROM 'USD' AND price >= 10));

CREATE INDEX IF NOT EXISTS idx_sessions_tutor_starts ON public.sessions (tutor_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status_ends ON public.sessions (status, ends_at);
