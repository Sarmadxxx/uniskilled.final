-- Tutor certificate files are no longer public (decided by Sarmad, 29 Oct 2026).
--
-- Who can open a tutor's certificate files:
--   • the tutor themself and admins — always
--   • signed-in students — when the tutor's setting is "students" (the default)
--   • only students the tutor approved — when the setting is "on_request"
-- Certificate names and grades on the profile stay visible as before; only the files are protected.
--
-- Files live in a new PRIVATE bucket, tutor-certificates. Pages open them with a short-lived
-- signed link, which storage only issues when the rule above allows it. The old public bucket
-- "certificates" keeps avatars, covers and feed attachments, which are meant to be public.

-- ── Private bucket ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tutor-certificates', 'tutor-certificates', false, 10485760,
        ARRAY['application/pdf','image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Tutor's choice ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tutor_profiles
  ADD COLUMN IF NOT EXISTS certificate_visibility text NOT NULL DEFAULT 'students'
  CHECK (certificate_visibility IN ('students', 'on_request'));
-- SELECT on tutor_profiles is granted column by column, so the new column is granted explicitly.
GRANT SELECT (certificate_visibility) ON public.tutor_profiles TO anon, authenticated;
GRANT UPDATE (certificate_visibility) ON public.tutor_profiles TO authenticated;

-- ── Access requests ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_access_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  student_name text,               -- filled in by the database so the tutor sees who asked
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  UNIQUE (tutor_id, student_id),
  CHECK (tutor_id <> student_id)
);
CREATE INDEX IF NOT EXISTS car_tutor_idx ON public.certificate_access_requests (tutor_id, status);

-- Is the signed-in person a student? (role student, not suspended)
CREATE OR REPLACE FUNCTION public.is_student(p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u
                 WHERE u.id = p_user AND u.suspended_at IS NULL
                   AND (u.role = 'student' OR (u.role IS NULL AND 'student'::public.user_role = ANY (u.roles))));
$$;

-- May the signed-in person open this tutor's certificate files?
CREATE OR REPLACE FUNCTION public.can_view_tutor_certificates(p_tutor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
       (SELECT auth.uid()) = p_tutor
    OR public.is_admin()
    OR (public.is_student((SELECT auth.uid())) AND (
          EXISTS (SELECT 1 FROM public.tutor_profiles tp WHERE tp.user_id = p_tutor AND tp.certificate_visibility = 'students')
       OR EXISTS (SELECT 1 FROM public.certificate_access_requests r
                  WHERE r.tutor_id = p_tutor AND r.student_id = (SELECT auth.uid()) AND r.status = 'approved'))));
$$;

REVOKE ALL ON FUNCTION public.is_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_tutor_certificates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_tutor_certificates(uuid) TO anon, authenticated;

-- Requests: a student asks; only the tutor decides; nobody can approve themselves.
CREATE OR REPLACE FUNCTION public.certificate_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_student(NEW.student_id) THEN RAISE EXCEPTION 'Only students can ask to see certificates.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tutor_profiles WHERE user_id = NEW.tutor_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
    NEW.status := 'pending'; NEW.decided_at := NULL;
    SELECT full_name INTO v_name FROM public.users WHERE id = NEW.student_id;
    NEW.student_name := v_name;
    INSERT INTO public.notifications (user_id, type, title, body, link, read)
    VALUES (NEW.tutor_id, 'certificate_access_request', 'Certificate request',
            coalesce(v_name, 'A student') || ' asked to see your certificates.',
            'tutor-profile.html?id=' || NEW.tutor_id || '#certificates', false);
    RETURN NEW;
  END IF;
  -- UPDATE: the tutor answers; a student may only re-ask after a decline (back to pending)
  IF (SELECT auth.uid()) = NEW.tutor_id OR public.is_admin() OR auth.role() = 'service_role' THEN
    IF NEW.tutor_id <> OLD.tutor_id OR NEW.student_id <> OLD.student_id OR NEW.student_name IS DISTINCT FROM OLD.student_name THEN RAISE EXCEPTION 'Not allowed'; END IF;
    IF NEW.status <> OLD.status THEN
      NEW.decided_at := CASE WHEN NEW.status = 'pending' THEN NULL ELSE now() END;
      IF NEW.status IN ('approved', 'declined') THEN
        SELECT full_name INTO v_name FROM public.users WHERE id = NEW.tutor_id;
        INSERT INTO public.notifications (user_id, type, title, body, link, read)
        VALUES (NEW.student_id,
                CASE NEW.status WHEN 'approved' THEN 'certificate_access_approved' ELSE 'certificate_access_declined' END,
                CASE NEW.status WHEN 'approved' THEN 'Certificates shared with you' ELSE 'Certificate request declined' END,
                coalesce(v_name, 'The tutor') || CASE NEW.status WHEN 'approved' THEN ' shared their certificates with you.' ELSE ' declined your request to see their certificates.' END,
                'tutor-profile.html?id=' || NEW.tutor_id || '#certificates', false);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (SELECT auth.uid()) = OLD.student_id AND OLD.status = 'declined' AND NEW.status = 'pending'
     AND NEW.tutor_id = OLD.tutor_id AND NEW.student_id = OLD.student_id AND NEW.student_name IS NOT DISTINCT FROM OLD.student_name THEN
    NEW.decided_at := NULL; NEW.created_at := now();
    SELECT full_name INTO v_name FROM public.users WHERE id = NEW.student_id;
    INSERT INTO public.notifications (user_id, type, title, body, link, read)
    VALUES (NEW.tutor_id, 'certificate_access_request', 'Certificate request',
            coalesce(v_name, 'A student') || ' asked to see your certificates.',
            'tutor-profile.html?id=' || NEW.tutor_id || '#certificates', false);
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Not allowed';
END $$;

DROP TRIGGER IF EXISTS certificate_request_guard ON public.certificate_access_requests;
CREATE TRIGGER certificate_request_guard BEFORE INSERT OR UPDATE ON public.certificate_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.certificate_request_guard();

ALTER TABLE public.certificate_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY car_select ON public.certificate_access_requests FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR tutor_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY car_insert ON public.certificate_access_requests FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));
CREATE POLICY car_update ON public.certificate_access_requests FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) OR tutor_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY car_delete ON public.certificate_access_requests FOR DELETE TO authenticated
  USING (student_id = (SELECT auth.uid()) OR tutor_id = (SELECT auth.uid()));

REVOKE ALL ON public.certificate_access_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificate_access_requests TO authenticated;
GRANT ALL ON public.certificate_access_requests TO service_role;

-- ── Storage rules for the private bucket ───────────────────────────────────────────────────────
-- Files are stored as <tutor id>/<file>. Uploads go through the upload-certificate server function.
CREATE POLICY "Tutor certificates: allowed viewers read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tutor-certificates'
         AND public.can_view_tutor_certificates(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Tutor certificates: owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tutor-certificates' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);
