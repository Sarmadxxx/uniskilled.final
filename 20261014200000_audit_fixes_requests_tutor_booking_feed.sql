-- Audit fixes, 14 Oct 2026. No existing rows are changed; only permissions, guards and one
-- storage setting. Reproduced before the fix with tests/db/security_tests.sql-style attempts
-- (rolled back); see tests/db/security_tests.sql for the cases that now prove each fix.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Subject requests: any signed-in user could rewrite or take over anyone's request
--    (UPDATE policy was `USING (true)`). Now:
--      • the student who posted it may edit its text (not assign a tutor),
--      • a tutor may only accept an OPEN request, for themselves, without changing its text,
--      • admins as before.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS subject_requests_update_authenticated ON public.subject_requests;
DROP POLICY IF EXISTS subject_requests_update_owner_or_accepting_tutor ON public.subject_requests;
CREATE POLICY subject_requests_update_owner_or_accepting_tutor ON public.subject_requests
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR status = 'open' OR is_admin())
  WITH CHECK (student_id = auth.uid() OR accepted_tutor_id = auth.uid() OR is_admin());

CREATE OR REPLACE FUNCTION public.a_guard_subject_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.student_id IS DISTINCT FROM auth.uid()
       OR COALESCE(NEW.status, 'open') <> 'open'
       OR NEW.accepted_tutor_id IS NOT NULL OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  -- The student who posted it: may edit the request, never assign or accept a tutor.
  IF OLD.student_id = auth.uid() THEN
    IF NEW.accepted_tutor_id IS DISTINCT FROM OLD.accepted_tutor_id
       OR NEW.accepted_tutor_name IS DISTINCT FROM OLD.accepted_tutor_name
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'accepted') THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Anyone else: only a tutor accepting an open request for themselves, text untouched.
  IF OLD.status = 'open' AND NEW.status = 'accepted' AND NEW.accepted_tutor_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.tutor_profiles tp WHERE tp.user_id = auth.uid())
     AND NEW.subject   IS NOT DISTINCT FROM OLD.subject
     AND NEW.notes     IS NOT DISTINCT FROM OLD.notes
     AND NEW.level     IS NOT DISTINCT FROM OLD.level
     AND NEW.frequency IS NOT DISTINCT FROM OLD.frequency
     AND NEW.language  IS NOT DISTINCT FROM OLD.language
     AND NEW.student_name IS NOT DISTINCT FROM OLD.student_name THEN
    NEW.accepted_at := COALESCE(NEW.accepted_at, now());
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
END $function$;

DROP TRIGGER IF EXISTS a_guard_subject_requests ON public.subject_requests;
CREATE TRIGGER a_guard_subject_requests BEFORE INSERT OR UPDATE ON public.subject_requests
  FOR EACH ROW EXECUTE FUNCTION public.a_guard_subject_requests();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. "Tutors only teach" (decided 10 Oct): enforced in the database, not just the page.
--    A tutor account (one with a tutor profile) can't create a booking or join a group session.
--    a_guard_sessions is unchanged apart from the marked block.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.a_guard_sessions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tcur text; minp numeric;
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending'
       OR COALESCE(NEW.payment_status,'unpaid') <> 'unpaid'
       OR NEW.payment_id IS NOT NULL OR NEW.stripe_payment_intent_id IS NOT NULL
       OR NEW.paypal_order_id IS NOT NULL OR NEW.daily_room_url IS NOT NULL
       OR NEW.completed_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL OR NEW.refund_outcome IS NOT NULL
       OR NEW.payment_due_at IS NOT NULL
       OR NEW.pending_discount_amount IS NOT NULL OR NEW.pending_discount_source IS NOT NULL
       OR NEW.late_reschedule_at IS NOT NULL
       OR COALESCE(NEW.reschedule_count, 0) <> 0 OR NEW.original_starts_at IS NOT NULL
       OR NEW.tutor_rescheduled_at IS NOT NULL
       OR NEW.student_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    IF NEW.tutor_id = NEW.student_id THEN
      RAISE EXCEPTION 'You can''t book a session with yourself.' USING ERRCODE = '42501';
    END IF;
    -- [audit 2026-10-14] tutors only teach
    IF EXISTS (SELECT 1 FROM tutor_profiles WHERE user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Tutor accounts can''t book sessions — only students can.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tutor_profiles WHERE user_id = NEW.tutor_id AND COALESCE(is_active, true)) THEN
      RAISE EXCEPTION 'This tutor isn''t available for booking.' USING ERRCODE = '42501';
    END IF;
    IF NEW.starts_at IS NULL OR NEW.starts_at < now() + interval '2 hours' THEN
      RAISE EXCEPTION 'Please choose a time at least 2 hours from now.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(NEW.duration_minutes, 0) NOT BETWEEN 15 AND 480 THEN
      RAISE EXCEPTION 'Session length must be between 15 minutes and 8 hours.' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(currency,'EUR') INTO tcur FROM tutor_profiles WHERE user_id = NEW.tutor_id;
    tcur := COALESCE(tcur,'EUR');
    IF COALESCE(NEW.currency,'EUR') IS DISTINCT FROM tcur THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    minp := CASE WHEN tcur = 'USD' THEN 17 ELSE 15 END;
    IF NEW.price IS NULL OR NEW.price < minp THEN
      RAISE EXCEPTION 'Minimum booking value is %', minp USING ERRCODE = '42501';
    END IF;
    IF NEW.price > 5000 THEN
      RAISE EXCEPTION 'That price looks too high — please check it.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.price IS DISTINCT FROM OLD.price
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.tutor_id IS DISTINCT FROM OLD.tutor_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.paypal_order_id IS DISTINCT FROM OLD.paypal_order_id
     OR NEW.daily_room_url IS DISTINCT FROM OLD.daily_room_url
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
     OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
     OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
     OR NEW.refund_outcome IS DISTINCT FROM OLD.refund_outcome
     OR NEW.pending_discount_amount IS DISTINCT FROM OLD.pending_discount_amount
     OR NEW.pending_discount_source IS DISTINCT FROM OLD.pending_discount_source
     OR NEW.late_reschedule_at IS DISTINCT FROM OLD.late_reschedule_at
     OR NEW.reschedule_count IS DISTINCT FROM OLD.reschedule_count
     OR NEW.original_starts_at IS DISTINCT FROM OLD.original_starts_at
     OR NEW.tutor_rescheduled_at IS DISTINCT FROM OLD.tutor_rescheduled_at
     OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
     OR NEW.timezone IS DISTINCT FROM OLD.timezone
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.format IS DISTINCT FROM OLD.format
     OR NEW.tutor_name IS DISTINCT FROM OLD.tutor_name
     OR NEW.student_name IS DISTINCT FROM OLD.student_name
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT
     (OLD.status = 'pending' AND NEW.status IN ('awaiting_payment','declined') AND OLD.tutor_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF NEW.payment_due_at IS DISTINCT FROM OLD.payment_due_at THEN
    IF NOT (OLD.status = 'pending' AND NEW.status = 'awaiting_payment'
            AND NEW.payment_due_at > now() AND NEW.payment_due_at <= now() + interval '25 hours') THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'awaiting_payment' THEN
    IF NEW.payment_due_at IS NULL THEN
      NEW.payment_due_at := now() + interval '24 hours';
    END IF;
    IF NEW.starts_at IS NOT NULL AND NEW.starts_at <= now() THEN
      RAISE EXCEPTION 'This session''s time has already passed — ask the student to book a new time.' USING ERRCODE = '42501';
    END IF;
    IF NEW.starts_at IS NOT NULL THEN
      IF NEW.starts_at - interval '1 hour' < now() + interval '10 minutes' THEN
        RAISE EXCEPTION 'This session starts too soon for the student to pay in time — ask them to book a later time.' USING ERRCODE = '42501';
      END IF;
      NEW.payment_due_at := LEAST(NEW.payment_due_at, NEW.starts_at - interval '1 hour');
    END IF;
    IF EXISTS (SELECT 1 FROM sessions o
               WHERE o.tutor_id = NEW.tutor_id AND o.id <> NEW.id
                 AND o.status IN ('awaiting_payment', 'confirmed')
                 AND o.starts_at < NEW.ends_at AND o.ends_at > NEW.starts_at) THEN
      RAISE EXCEPTION 'You already have a session booked at that time.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.a_guard_gsp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'awaiting_payment' OR NEW.paypal_order_id IS NOT NULL
       OR NEW.student_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    -- [audit 2026-10-14] tutors only teach
    IF EXISTS (SELECT 1 FROM tutor_profiles WHERE user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Tutor accounts can''t join group sessions — only students can.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.paypal_order_id IS DISTINCT FROM OLD.paypal_order_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.group_session_id IS DISTINCT FROM OLD.group_session_id THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Feed likes: like_count is now kept in step with feed_likes by the database.
--    Before: only a post's author could update like_count (so other people's likes were
--    lost on reload), and the author could set it to any number.
--    Signed-in users can no longer edit like_count / reply_count / has_tutor_answer directly;
--    a "tutor" author_role is only kept for accounts that really have a tutor profile.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_feed_like_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pid uuid := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE public.feed_posts SET like_count = (SELECT count(*) FROM public.feed_likes WHERE post_id = pid)
   WHERE id = pid;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS z_sync_feed_like_count ON public.feed_likes;
CREATE TRIGGER z_sync_feed_like_count AFTER INSERT OR DELETE ON public.feed_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_feed_like_count();

-- Whether a user has a tutor profile (public information: tutor profiles are listed publicly).
CREATE OR REPLACE FUNCTION public._has_tutor_profile(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.tutor_profiles WHERE user_id = p_user);
$function$;
REVOKE EXECUTE ON FUNCTION public._has_tutor_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._has_tutor_profile(uuid) TO authenticated, service_role;

-- SECURITY INVOKER on purpose: current_user is the API role for browser requests, but the
-- function owner inside sync_feed_like_count / service-role code, which may set the counters.
CREATE OR REPLACE FUNCTION public.a_guard_feed_posts()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR COALESCE(public.is_admin(), false) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.like_count := 0;
    NEW.reply_count := 0;
    NEW.has_tutor_answer := false;
  ELSE
    IF NEW.author_id IS DISTINCT FROM OLD.author_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    NEW.like_count := OLD.like_count;
    NEW.reply_count := OLD.reply_count;
    NEW.has_tutor_answer := OLD.has_tutor_answer;
  END IF;
  IF NEW.author_role = 'tutor' AND NOT public._has_tutor_profile(NEW.author_id) THEN
    NEW.author_role := 'student';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS a_guard_feed_posts ON public.feed_posts;
CREATE TRIGGER a_guard_feed_posts BEFORE INSERT OR UPDATE ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.a_guard_feed_posts();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tutor photo / cover uploads go through upload-certificate into the `certificates`
--    bucket. The function accepts WebP and GIF but the bucket only allowed JPEG/PNG/PDF,
--    so those uploads failed with "Photo upload failed". Align the bucket with the function.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg','image/png','application/pdf','image/webp','image/gif']
 WHERE id = 'certificates';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Security advisor clean-up (no behaviour change).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.a_guard_messages() SET search_path TO 'public';
-- Trigger-only functions: triggers keep firing; they just can't be called via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.b_check_message_extras() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_reaction_conversation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.a_guard_subject_requests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_feed_like_count() FROM PUBLIC, anon, authenticated;
-- a_guard_feed_posts runs as the caller (SECURITY INVOKER), so it keeps its default EXECUTE grant.
