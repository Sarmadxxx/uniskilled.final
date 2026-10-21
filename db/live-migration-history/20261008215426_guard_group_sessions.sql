-- Exported from the live database migration history (20261008215426 guard_group_sessions).

CREATE OR REPLACE FUNCTION public.a_guard_group_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_students boolean;
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'open' OR NEW.completed_at IS NOT NULL OR COALESCE(NEW.min_check_done, false)
       OR NEW.tutor_id IS DISTINCT FROM auth.uid()
       OR NEW.price_per_student IS NULL OR NEW.price_per_student <= 0
       OR COALESCE(NEW.max_students, 0) NOT BETWEEN 2 AND 4 THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.group_session_participants p
                 WHERE p.group_session_id = OLD.id AND p.status IN ('confirmed', 'awaiting_payment'))
    INTO has_students;

  IF TG_OP = 'DELETE' THEN
    IF has_students THEN
      RAISE EXCEPTION 'This group session has students — it can''t be deleted.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: status / completion / money fields belong to the system jobs only
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.min_check_done IS DISTINCT FROM OLD.min_check_done OR NEW.tutor_id IS DISTINCT FROM OLD.tutor_id
     OR NEW.price_per_student IS DISTINCT FROM OLD.price_per_student OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF has_students AND (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
     OR COALESCE(NEW.max_students, 0) < COALESCE(OLD.max_students, 0)) THEN
    RAISE EXCEPTION 'Students have already joined — the time can''t be changed.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.a_guard_group_sessions() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER a_guard_group_sessions BEFORE INSERT OR UPDATE OR DELETE ON public.group_sessions
  FOR EACH ROW EXECUTE FUNCTION public.a_guard_group_sessions();
