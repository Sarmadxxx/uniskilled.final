-- Audit 2026-10-24 — group session seats
--
-- Problems found (all latent: there are no group sessions yet, so no data is affected):
--   1. Any signed-in user could read every group seat (student names, student ids, payment status)
--      because the SELECT policy was `true`. Student profiles are meant to be private.
--   2. The database did not stop a student from joining a group that was already full
--      (max_students), cancelled, completed or already started. Card checkout and the webhook
--      would then take and confirm the payment — e.g. a 5th student charged for a 4-seat group,
--      or a student charged for a cancelled group that will never be refunded automatically.
--   3. The browser chose the seat's payment deadline (payment_due_at), so a student could hold
--      a seat forever by sending a far-future date.
--
-- What this changes (no data is changed, nothing is deleted):
--   * Seats are readable only by the student who owns them, the group's tutor, and admins.
--     Seat counts for everyone else keep coming from the group_session_seats view.
--   * Joining (INSERT by a normal user) now requires: the group is 'open', starts at least
--     1 hour from now, and still has a free seat (seats awaiting payment or confirmed count as
--     taken). The group row is locked while checking, so two students can't take the last seat.
--   * The seat's payment deadline is set by the database: 24 hours, but never later than
--     1 hour before the session (the same rule as one-to-one bookings).
--   * Normal users can no longer change payment_due_at afterwards.
--   Admins and server functions are unaffected (same as every other guard).
--
-- Rollback: re-run the previous definitions (policy gsp_select_authenticated USING (true) and the
-- a_guard_gsp body recorded in the comment at the end of this file).

BEGIN;

-- 1. Who can read group seats
DROP POLICY IF EXISTS gsp_select_authenticated ON public.group_session_participants;
CREATE POLICY gsp_select_own_tutor_or_admin ON public.group_session_participants
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_sessions gs
               WHERE gs.id = group_session_participants.group_session_id
                 AND gs.tutor_id = (SELECT auth.uid()))
    OR (SELECT public.is_admin())
  );

-- 2 + 3. Joining rules and payment deadline
CREATE OR REPLACE FUNCTION public.a_guard_gsp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  gs public.group_sessions%ROWTYPE;
  v_start timestamptz;
  v_taken integer;
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

    -- [audit 2026-10-24] the group must be open, in the future and not full.
    -- FOR UPDATE serialises concurrent joins of the same group, so the last seat can't be sold twice.
    SELECT * INTO gs FROM public.group_sessions WHERE id = NEW.group_session_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This group session no longer exists.' USING ERRCODE = '42501';
    END IF;
    IF gs.tutor_id = auth.uid() THEN
      RAISE EXCEPTION 'You can''t join your own group session.' USING ERRCODE = '42501';
    END IF;
    IF gs.status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'This group session is no longer taking students.' USING ERRCODE = '42501';
    END IF;
    v_start := COALESCE(gs.starts_at, (gs.scheduled_date + gs.scheduled_time) AT TIME ZONE COALESCE(gs.timezone, 'Europe/Berlin'));
    IF v_start < now() + interval '1 hour' THEN
      RAISE EXCEPTION 'This group session starts too soon to join.' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_taken FROM public.group_session_participants p
     WHERE p.group_session_id = gs.id AND p.status IN ('awaiting_payment', 'confirmed');
    IF v_taken >= COALESCE(gs.max_students, 4) THEN
      RAISE EXCEPTION 'This group session is full.' USING ERRCODE = '42501';
    END IF;

    -- The payment deadline is decided here, never by the browser.
    NEW.payment_due_at := LEAST(now() + interval '24 hours', v_start - interval '1 hour');
    NEW.joined_at := now();
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.paypal_order_id IS DISTINCT FROM OLD.paypal_order_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.group_session_id IS DISTINCT FROM OLD.group_session_id
       OR NEW.payment_due_at IS DISTINCT FROM OLD.payment_due_at OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

COMMIT;

-- Previous a_guard_gsp body (for rollback): identical to the above without the block marked
-- [audit 2026-10-24], without the two NEW.* assignments, and without the payment_due_at /
-- joined_at comparisons in the UPDATE branch.
