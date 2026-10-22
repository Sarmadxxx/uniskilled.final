-- Exported from the live database migration history (20261008212957 messages_reviews_lockdown).

-- Messages: receiver may only mark read; nobody rewrites history; sends only within your own conversation.
ALTER POLICY messages_update_participant ON public.messages
  TO authenticated
  USING (receiver_id = auth.uid()) WITH CHECK (receiver_id = auth.uid());

CREATE OR REPLACE FUNCTION public.a_guard_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_name IS DISTINCT FROM OLD.sender_name OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER a_guard_messages BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.a_guard_messages();

ALTER POLICY messages_insert_as_sender ON public.messages
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
                AND ((c.participant_1 = auth.uid() AND c.participant_2 = receiver_id)
                  OR (c.participant_2 = auth.uid() AND c.participant_1 = receiver_id)))
  );

-- Reviews: only after a completed session with that tutor, one per completed session.
CREATE OR REPLACE FUNCTION public.can_review(p_tutor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT (SELECT count(*) FROM public.sessions s WHERE s.student_id = auth.uid() AND s.tutor_id = p_tutor AND s.status = 'completed')
       > (SELECT count(*) FROM public.reviews r WHERE r.student_id = auth.uid() AND r.tutor_id = p_tutor);
$$;
REVOKE ALL ON FUNCTION public.can_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review(uuid) TO authenticated;

-- Both existing insert policies get the same strict check (permissive policies OR together).
ALTER POLICY reviews_insert ON public.reviews
  TO authenticated
  WITH CHECK (student_id = auth.uid() AND tutor_id <> auth.uid() AND public.can_review(tutor_id));
ALTER POLICY reviews_insert_as_student ON public.reviews
  TO authenticated
  WITH CHECK (student_id = auth.uid() AND tutor_id <> auth.uid() AND public.can_review(tutor_id));

ALTER TABLE public.reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION public.a_guard_reviews()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF NEW.tutor_id IS DISTINCT FROM OLD.tutor_id OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER a_guard_reviews BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.a_guard_reviews();
