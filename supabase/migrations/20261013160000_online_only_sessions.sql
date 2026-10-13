-- 13 Oct 2026 — all sessions are online.
-- Existing tutor profiles are set to online, defaults become 'online', and a small trigger keeps
-- the format 'online' even if an old (cached) page sends something else.

UPDATE public.tutor_profiles SET teaching_format = 'online' WHERE teaching_format IS DISTINCT FROM 'online';
UPDATE public.tutor_profiles SET format = 'online' WHERE format IS DISTINCT FROM 'online';
ALTER TABLE public.tutor_profiles ALTER COLUMN format SET DEFAULT 'online';
ALTER TABLE public.tutor_profiles ALTER COLUMN teaching_format SET DEFAULT 'online';
UPDATE public.group_sessions SET format = 'online' WHERE format IS DISTINCT FROM 'online';

CREATE OR REPLACE FUNCTION public.a1_force_online_format()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'tutor_profiles' THEN
    NEW.format := 'online';
    NEW.teaching_format := 'online';
  ELSE
    NEW.format := 'online';
  END IF;
  RETURN NEW;
END $function$;

-- Named a1_ so it runs before the a_guard_* triggers (triggers run in name order).
DROP TRIGGER IF EXISTS a1_force_online_format ON public.sessions;
CREATE TRIGGER a1_force_online_format BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.a1_force_online_format();
DROP TRIGGER IF EXISTS a1_force_online_format ON public.group_sessions;
CREATE TRIGGER a1_force_online_format BEFORE INSERT OR UPDATE ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.a1_force_online_format();
DROP TRIGGER IF EXISTS a1_force_online_format ON public.tutor_profiles;
CREATE TRIGGER a1_force_online_format BEFORE INSERT OR UPDATE ON public.tutor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.a1_force_online_format();
