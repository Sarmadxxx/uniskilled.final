-- Exported from the live database migration history (20261020164436 launch_features_core).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS tutor_nudged_at timestamptz;

ALTER TABLE public.subject_requests
  ADD COLUMN IF NOT EXISTS university text,
  ADD COLUMN IF NOT EXISTS admin_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_notified_at timestamptz;

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
       OR NEW.reminder_24h_sent_at IS NOT NULL OR NEW.reminder_1h_sent_at IS NOT NULL
       OR NEW.tutor_nudged_at IS NOT NULL
       OR NEW.student_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    IF NEW.tutor_id = NEW.student_id THEN
      RAISE EXCEPTION 'You can''t book a session with yourself.' USING ERRCODE = '42501';
    END IF;
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
    IF NEW.exam_date IS NOT NULL AND (NEW.exam_date < current_date OR NEW.exam_date > current_date + 400) THEN
      RAISE EXCEPTION 'Please check the exam date.' USING ERRCODE = '42501';
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
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.exam_date IS DISTINCT FROM OLD.exam_date
     OR NEW.reminder_24h_sent_at IS DISTINCT FROM OLD.reminder_24h_sent_at
     OR NEW.reminder_1h_sent_at IS DISTINCT FROM OLD.reminder_1h_sent_at
     OR NEW.tutor_nudged_at IS DISTINCT FROM OLD.tutor_nudged_at THEN
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
