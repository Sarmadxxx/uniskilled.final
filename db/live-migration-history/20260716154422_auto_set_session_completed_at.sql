-- Exported from the live database migration history (20260716154422 auto_set_session_completed_at).

CREATE OR REPLACE FUNCTION public.set_session_completed_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_session_completed_at ON public.sessions;
CREATE TRIGGER trg_set_session_completed_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_session_completed_at();
