-- 12 Oct 2026 — reschedule requests, payment window, 2-hour booking minimum
--
-- 1. Rescheduling is a request the other side must accept (reschedule_requests). The session keeps
--    its time until then. All writes go through the reschedule-session Edge Function; users can
--    only read requests for their own sessions.
-- 2. Limits tracked on the session: reschedule_count (max 2 accepted moves, enforced in the
--    function), original_starts_at (new time must be within 30 days of it), tutor_rescheduled_at
--    (a student can always cancel a tutor-moved session for a full refund). Users can't change them.
-- 3. Payment window after a tutor accepts: 24 hours, or until 1 hour before the session if sooner.
-- 4. Bookings must start at least 2 hours from now.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS tutor_rescheduled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.reschedule_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requester_role text NOT NULL CHECK (requester_role IN ('student', 'tutor')),
  new_date date NOT NULL,
  new_time time NOT NULL,
  new_starts_at timestamptz NOT NULL,
  is_late boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
-- At most one open request per session.
CREATE UNIQUE INDEX IF NOT EXISTS reschedule_requests_one_pending
  ON public.reschedule_requests (session_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS reschedule_requests_session ON public.reschedule_requests (session_id);

ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reschedule_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reschedule_requests FROM authenticated;
GRANT SELECT ON public.reschedule_requests TO authenticated;
GRANT ALL ON public.reschedule_requests TO service_role;
DROP POLICY IF EXISTS reschedule_requests_select_participants ON public.reschedule_requests;
CREATE POLICY reschedule_requests_select_participants ON public.reschedule_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id
                 AND (s.student_id = auth.uid() OR s.tutor_id = auth.uid()))
         OR public.is_admin());

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

  -- UPDATE: money, identity and SCHEDULE fields are server-only (reschedule-session does schedule changes).
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

  -- The payment deadline is set only when the tutor accepts, and only to ~24h from now.
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
    -- The payment window ends 1 hour before the session if that is sooner than 24 hours,
    -- so a student can never pay for a session that has already started.
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

COMMENT ON TABLE public.reschedule_requests IS 'Reschedule requests: the other participant must accept. Written only by the reschedule-session Edge Function.';
