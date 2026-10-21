-- Exported from the live database migration history (20261008212939 notifications_lockdown).

CREATE OR REPLACE FUNCTION public.can_notify(p_recipient uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
       p_recipient = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.sessions s WHERE (s.student_id = auth.uid() AND s.tutor_id = p_recipient) OR (s.tutor_id = auth.uid() AND s.student_id = p_recipient))
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE (c.participant_1 = auth.uid() AND c.participant_2 = p_recipient) OR (c.participant_2 = auth.uid() AND c.participant_1 = p_recipient))
    OR EXISTS (SELECT 1 FROM public.subject_requests r WHERE r.student_id = p_recipient AND EXISTS (SELECT 1 FROM public.tutor_profiles tp WHERE tp.user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.author_id = p_recipient AND (
          EXISTS (SELECT 1 FROM public.feed_likes fl WHERE fl.post_id = fp.id AND fl.user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.feed_replies fr WHERE fr.post_id = fp.id AND fr.author_id = auth.uid())))
  );
$$;
REVOKE ALL ON FUNCTION public.can_notify(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_notify(uuid) TO authenticated;

ALTER POLICY notifications_insert_authenticated ON public.notifications
  TO authenticated
  WITH CHECK (
    public.can_notify(user_id)
    AND (link IS NULL OR link = '' OR link ~ '^[A-Za-z0-9_-]+\.html([?#][A-Za-z0-9_=&%.-]*)?$')
    AND length(coalesce(title, '')) <= 200
    AND length(coalesce(body, '')) <= 1000
  );

CREATE OR REPLACE FUNCTION public.sanitize_notification_text()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.title := translate(NEW.title, '<>', '‹›');
  NEW.body  := translate(NEW.body,  '<>', '‹›');
  IF NEW.link IS NOT NULL AND NEW.link !~ '^[A-Za-z0-9_-]+\.html([?#][A-Za-z0-9_=&%.-]*)?$' THEN
    NEW.link := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_sanitize_notification BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_notification_text();

CREATE OR REPLACE FUNCTION public.a_guard_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.link IS DISTINCT FROM OLD.link THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER a_guard_notifications BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.a_guard_notifications();
