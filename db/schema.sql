


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."attachment_type" AS ENUM (
    'image',
    'file',
    'pdf'
);


ALTER TYPE "public"."attachment_type" OWNER TO "postgres";


CREATE TYPE "public"."audit_target_type" AS ENUM (
    'user',
    'session',
    'order',
    'job',
    'dispute',
    'payment',
    'credential',
    'review',
    'message',
    'platform_settings',
    'verification'
);


ALTER TYPE "public"."audit_target_type" OWNER TO "postgres";


CREATE TYPE "public"."cancellation_by" AS ENUM (
    'student',
    'tutor',
    'business',
    'admin',
    'system'
);


ALTER TYPE "public"."cancellation_by" OWNER TO "postgres";


CREATE TYPE "public"."credential_type" AS ENUM (
    'developer',
    'tutor',
    'designer',
    'data_analyst',
    'marketer',
    'writer',
    'other'
);


ALTER TYPE "public"."credential_type" OWNER TO "postgres";


CREATE TYPE "public"."dispute_resolution" AS ENUM (
    'released',
    'refunded',
    'partial',
    'suspended'
);


ALTER TYPE "public"."dispute_resolution" OWNER TO "postgres";


CREATE TYPE "public"."dispute_status" AS ENUM (
    'open',
    'under_review',
    'resolved'
);


ALTER TYPE "public"."dispute_status" OWNER TO "postgres";


CREATE TYPE "public"."job_status" AS ENUM (
    'draft',
    'live',
    'closed',
    'flagged'
);


ALTER TYPE "public"."job_status" OWNER TO "postgres";


CREATE TYPE "public"."job_type" AS ENUM (
    'freelance',
    'internship',
    'part_time',
    'full_time'
);


ALTER TYPE "public"."job_type" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'active',
    'delivered',
    'approved',
    'disputed',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."session_status" AS ENUM (
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'disputed',
    'no_show'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";


CREATE TYPE "public"."setting_type" AS ENUM (
    'bool',
    'int',
    'decimal',
    'string'
);


ALTER TYPE "public"."setting_type" OWNER TO "postgres";


CREATE TYPE "public"."subscription_plan" AS ENUM (
    'free',
    'growth',
    'pro',
    'enterprise'
);


ALTER TYPE "public"."subscription_plan" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'tutor',
    'business',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."verification_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."verification_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_has_tutor_profile"("p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.tutor_profiles WHERE user_id = p_user);
$$;


ALTER FUNCTION "public"."_has_tutor_profile"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_is_plain_end_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT COALESCE(public.is_admin(), false);
$$;


ALTER FUNCTION "public"."_is_plain_end_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a0_compute_session_times"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.valid_timezone(NEW.timezone) THEN NEW.timezone := 'Europe/Berlin'; END IF;
  IF NEW.scheduled_date IS NOT NULL AND NEW.scheduled_time IS NOT NULL THEN
    NEW.starts_at := (NEW.scheduled_date + NEW.scheduled_time) AT TIME ZONE NEW.timezone;
    NEW.ends_at := NEW.starts_at + make_interval(mins => COALESCE(NEW.duration_minutes, 60));
  ELSE
    NEW.starts_at := NULL; NEW.ends_at := NULL;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a0_compute_session_times"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a1_force_online_format"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'tutor_profiles' THEN
    NEW.format := 'online';
    NEW.teaching_format := 'online';
  ELSE
    NEW.format := 'online';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a1_force_online_format"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_block_contact_info"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE k text;
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  k := public.contact_info_kind(NEW.content);
  IF k IS NOT NULL THEN
    RAISE EXCEPTION 'Messages can''t contain % — keep contact on UniSkilled so your booking stays protected.', k USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a_block_contact_info"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_feed_posts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
END $$;


ALTER FUNCTION "public"."a_guard_feed_posts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_group_sessions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."a_guard_group_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_gsp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
END $$;


ALTER FUNCTION "public"."a_guard_gsp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_messages"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_name IS DISTINCT FROM OLD.sender_name OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reply_to IS DISTINCT FROM OLD.reply_to OR NEW.attachment_path IS DISTINCT FROM OLD.attachment_path
     OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name OR NEW.attachment_type IS DISTINCT FROM OLD.attachment_type
     OR NEW.attachment_size IS DISTINCT FROM OLD.attachment_size THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a_guard_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.link IS DISTINCT FROM OLD.link THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a_guard_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_referrals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public._is_plain_end_user() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;


ALTER FUNCTION "public"."a_guard_referrals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_reviews"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF NEW.tutor_id IS DISTINCT FROM OLD.tutor_id OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  -- Only the review's tutor may set the public reply (tutors can't edit review rows directly,
  -- so this only happens through reply_to_review).
  IF (NEW.tutor_reply IS DISTINCT FROM OLD.tutor_reply OR NEW.tutor_reply_at IS DISTINCT FROM OLD.tutor_reply_at)
     AND auth.uid() IS DISTINCT FROM OLD.tutor_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  -- The tutor may change only the reply, nothing the student wrote.
  IF auth.uid() = OLD.tutor_id AND (NEW.rating IS DISTINCT FROM OLD.rating OR NEW.comment IS DISTINCT FROM OLD.comment OR NEW.tags IS DISTINCT FROM OLD.tags) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a_guard_reviews"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_sessions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
END $$;


ALTER FUNCTION "public"."a_guard_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_subject_requests"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
END $$;


ALTER FUNCTION "public"."a_guard_subject_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_tutor_profiles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_account_id IS NOT NULL OR NEW.stripe_account_status = 'active'
       OR NEW.university_verified_at IS NOT NULL OR NEW.verified_university IS NOT NULL
       OR NEW.grade_verified_at IS NOT NULL
       OR NEW.certified_at IS NOT NULL OR NEW.top_rated_at IS NOT NULL
       OR COALESCE(NEW.rating_avg,0) <> 0 OR COALESCE(NEW.review_count,0) <> 0
       OR COALESCE(NEW.sessions_count,0) <> 0 OR COALESCE(NEW.total_earnings,0) <> 0
       OR COALESCE(NEW.no_show_count,0) <> 0 THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
       OR NEW.stripe_account_status IS DISTINCT FROM OLD.stripe_account_status
       OR NEW.university_verified_at IS DISTINCT FROM OLD.university_verified_at
       OR NEW.verified_university IS DISTINCT FROM OLD.verified_university
       OR NEW.grade_verified_at IS DISTINCT FROM OLD.grade_verified_at
       OR NEW.certified_at IS DISTINCT FROM OLD.certified_at
       OR NEW.top_rated_at IS DISTINCT FROM OLD.top_rated_at
       OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
       OR NEW.review_count IS DISTINCT FROM OLD.review_count
       OR NEW.sessions_count IS DISTINCT FROM OLD.sessions_count
       OR NEW.response_rate IS DISTINCT FROM OLD.response_rate
       OR NEW.completion_rate IS DISTINCT FROM OLD.completion_rate
       OR NEW.no_show_count IS DISTINCT FROM OLD.no_show_count
       OR NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a_guard_tutor_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."a_guard_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public._is_plain_end_user() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF 'admin' = ANY (NEW.roles::text[]) OR NEW.role = 'admin'
       OR COALESCE(NEW.credit_balance,0) <> 0 OR NEW.suspended_at IS NOT NULL
       OR COALESCE(NEW.warning_count,0) <> 0 THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF COALESCE(NEW.email::text, '') = '' AND COALESCE(OLD.email::text, '') <> '' THEN
      NEW.email := OLD.email;
    END IF;
    IF ('admin' = ANY (NEW.roles::text[]) AND NOT ('admin' = ANY (COALESCE(OLD.roles::text[], '{}'))))
       OR (NEW.role = 'admin' AND OLD.role IS DISTINCT FROM 'admin')
       OR NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
       OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
       OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
       OR NEW.warning_count IS DISTINCT FROM OLD.warning_count
       OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
       OR NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
       OR NEW.university_email_verified IS DISTINCT FROM OLD.university_email_verified THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."a_guard_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_credit_balance"("p_user_id" "uuid", "p_amount" numeric) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE public.users
  SET credit_balance = credit_balance + p_amount
  WHERE id = p_user_id
  RETURNING credit_balance INTO new_balance;
  RETURN new_balance;
END;
$$;


ALTER FUNCTION "public"."add_credit_balance"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "full_name" character varying(255),
    "avatar_url" character varying(500),
    "cover_url" character varying(500),
    "roles" "public"."user_role"[] DEFAULT ARRAY['student'::"public"."user_role"] NOT NULL,
    "timezone" character varying(100) DEFAULT 'UTC'::character varying,
    "language" character varying(10) DEFAULT 'en'::character varying,
    "bio" "text",
    "phone" character varying(50),
    "country" character varying(100),
    "city" character varying(100),
    "website_url" character varying(500),
    "linkedin_url" character varying(500),
    "github_url" character varying(500),
    "email_verified" boolean DEFAULT false,
    "email_verified_at" timestamp with time zone,
    "university_email" character varying(255),
    "university_email_verified" boolean DEFAULT false,
    "privacy_policy_accepted_at" timestamp with time zone,
    "terms_accepted_at" timestamp with time zone,
    "cookie_consent" boolean DEFAULT false,
    "cookie_consent_at" timestamp with time zone,
    "suspended_at" timestamp with time zone,
    "suspended_reason" "text",
    "suspended_by" "uuid",
    "warning_count" integer DEFAULT 0,
    "stripe_customer_id" character varying(255),
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gender" character varying,
    "role" "text",
    "referral_code" character varying(12),
    "credit_balance" numeric(10,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_users"() RETURNS SETOF "public"."users"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.users ORDER BY created_at DESC;
END $$;


ALTER FUNCTION "public"."admin_list_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."b_check_message_extras"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public._is_plain_end_user() then return new; end if;
  if new.reply_to is not null and not exists (
       select 1 from public.messages r where r.id = new.reply_to and r.conversation_id = new.conversation_id) then
    raise exception 'Reply must be to a message in the same conversation' using errcode = '42501';
  end if;
  if new.attachment_path is not null and
     new.attachment_path not like (auth.uid()::text || '/' || new.conversation_id::text || '/%') then
    raise exception 'Invalid attachment' using errcode = '42501';
  end if;
  if new.attachment_path is null and coalesce(btrim(new.content), '') = '' then
    raise exception 'Message is empty' using errcode = '22023';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."b_check_message_extras"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_match_score"("user_skills" "text"[], "required_skills" "text"[]) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  matched INT;
  total INT;
BEGIN
  total := array_length(required_skills, 1);
  IF total IS NULL OR total = 0 THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO matched
  FROM unnest(user_skills) s
  WHERE s = ANY(required_skills);
  RETURN ROUND((matched::DECIMAL / total) * 100);
END;
$$;


ALTER FUNCTION "public"."calculate_match_score"("user_skills" "text"[], "required_skills" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_notify"("p_recipient" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."can_notify"("p_recipient" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_review"("p_tutor" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT (SELECT count(*) FROM public.sessions s WHERE s.student_id = auth.uid() AND s.tutor_id = p_tutor AND s.status = 'completed')
       > (SELECT count(*) FROM public.reviews r WHERE r.student_id = auth.uid() AND r.tutor_id = p_tutor);
$$;


ALTER FUNCTION "public"."can_review"("p_tutor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_heartbeat"("p_session_id" "uuid", "p_connected" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_row  public.classroom_attendance%rowtype;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select case when s.tutor_id = v_uid then 'tutor' when s.student_id = v_uid then 'student' end
    into v_role from public.sessions s
   where s.id = p_session_id and s.status in ('confirmed', 'completed');
  if v_role is null then raise exception 'Not part of this lesson' using errcode = '42501'; end if;
  select * into v_row from public.classroom_attendance
   where session_id = p_session_id and user_id = v_uid and left_at is null
     and last_seen_at > now() - interval '3 minutes'
   order by joined_at desc limit 1;
  if found then
    update public.classroom_attendance
       set connected_seconds = connected_seconds
             + case when p_connected then least(90, greatest(0, extract(epoch from (now() - v_row.last_seen_at))))::int else 0 end,
           last_seen_at = now()
     where id = v_row.id;
  else
    insert into public.classroom_attendance (session_id, user_id, role) values (p_session_id, v_uid, v_role);
  end if;
end $$;


ALTER FUNCTION "public"."classroom_heartbeat"("p_session_id" "uuid", "p_connected" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_leave"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then return; end if;
  update public.classroom_attendance set left_at = now(), last_seen_at = now()
   where session_id = p_session_id and user_id = auth.uid() and left_at is null;
end $$;


ALTER FUNCTION "public"."classroom_leave"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contact_info_kind"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT CASE
    WHEN p ~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}' THEN 'an email address'
    WHEN p ~ '(\+?[0-9][ .-]?){7,}' THEN 'a phone number'
    WHEN p ~* '\m(wa\.me|t\.me|instagram\.com|snapchat\.com|discord\.gg)/\S+' THEN 'a social media link'
    WHEN p ~* '\m(whatsapp|whats app|telegram|snap(chat)?|insta(gram)?|discord|tiktok|imessage|line id|wechat)\M.{0,15}[@#]?[a-z0-9_.]{3,}' THEN 'a social media handle'
  END;
$$;


ALTER FUNCTION "public"."contact_info_kind"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_credit_balance"("p_user_id" "uuid", "p_amount" numeric) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE public.users
  SET credit_balance = GREATEST(0, credit_balance - p_amount)
  WHERE id = p_user_id
  RETURNING credit_balance INTO new_balance;
  RETURN new_balance;
END;
$$;


ALTER FUNCTION "public"."deduct_credit_balance"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_referral_code"() RETURNS character varying
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no O/0/I/1 to avoid ambiguity
  result varchar := '';
  i integer;
  code_exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..7 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.users WHERE referral_code = result) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_referral_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_account"() RETURNS TABLE("id" "uuid", "email" "text", "phone" "text", "referral_code" "text", "credit_balance" numeric, "university_email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT u.id, u.email::text, u.phone::text, u.referral_code::text, u.credit_balance::numeric, u.university_email::text
  FROM public.users u WHERE u.id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_tutor_private"() RETURNS TABLE("meeting_link" "text", "paypal_email" "text", "payout_method" "text", "stripe_account_id" "text", "stripe_account_status" "text", "total_earnings" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tp.meeting_link, tp.paypal_email, tp.payout_method,
         tp.stripe_account_id, tp.stripe_account_status, tp.total_earnings
  from public.tutor_profiles tp
  where tp.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_tutor_private"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_meeting_link"("p_session_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tp.meeting_link
  from public.sessions s
  join public.tutor_profiles tp on tp.user_id = s.tutor_id
  where s.id = p_session_id
    and s.status = 'confirmed'
    and auth.uid() is not null
    and auth.uid() in (s.student_id, s.tutor_id);
$$;


ALTER FUNCTION "public"."get_session_meeting_link"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_setting"("setting_key" character varying) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT value FROM public.platform_settings WHERE key = setting_key;
$$;


ALTER FUNCTION "public"."get_setting"("setting_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_setting_bool"("setting_key" character varying) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT (value = 'true') FROM public.platform_settings WHERE key = setting_key;
$$;


ALTER FUNCTION "public"."get_setting_bool"("setting_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_setting_int"("setting_key" character varying) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT value::INT FROM public.platform_settings WHERE key = setting_key;
$$;


ALTER FUNCTION "public"."get_setting_int"("setting_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  p jsonb := CASE WHEN jsonb_typeof(m->'profile') = 'object' THEN m->'profile' ELSE '{}'::jsonb END;
  r text  := lower(coalesce(m->>'role', 'student'));
  arr_subjects jsonb := CASE WHEN jsonb_typeof(p->'subjects') = 'array' THEN p->'subjects' ELSE '[]'::jsonb END;
  arr_avail    jsonb := CASE WHEN jsonb_typeof(p->'availability') = 'array' THEN p->'availability' ELSE '[]'::jsonb END;
  arr_times    jsonb := CASE WHEN jsonb_typeof(p->'preferred_times') = 'array' THEN p->'preferred_times' ELSE '[]'::jsonb END;
  arr_certs    jsonb := CASE WHEN jsonb_typeof(p->'certificates') = 'array' THEN p->'certificates' ELSE '[]'::jsonb END;
  arr_courses  jsonb := CASE WHEN jsonb_typeof(p->'courses') = 'array' THEN p->'courses' ELSE '[]'::jsonb END;
BEGIN
  IF r NOT IN ('student', 'tutor', 'business') THEN r := 'student'; END IF;

  INSERT INTO public.users (id, email, full_name, avatar_url, roles, role, gender, country, language, university_email)
  VALUES (
    NEW.id, NEW.email,
    left(m->>'full_name', 120),
    left(m->>'avatar_url', 500),
    ARRAY[r::public.user_role], r,
    left(p->>'gender', 40), left(p->>'country', 80),
    coalesce(left(p->>'language', 40), 'en'),
    CASE WHEN p <> '{}'::jsonb AND r IN ('student', 'tutor') THEN NEW.email END
  )
  ON CONFLICT (id) DO NOTHING;

  IF p = '{}'::jsonb THEN RETURN NEW; END IF;

  BEGIN
    IF r = 'student' THEN
      INSERT INTO public.student_profiles (user_id, university, degree, major, year_of_study, gender, country, language, subjects, availability, preferred_time)
      VALUES (
        NEW.id, left(p->>'university', 150), left(p->>'degree', 150), left(p->>'degree', 150),
        CASE WHEN (p->>'year_of_study') ~ '^[0-9]{1,2}$' THEN (p->>'year_of_study')::int END,
        left(p->>'gender', 40), left(p->>'country', 80), left(p->>'language', 40),
        CASE WHEN jsonb_array_length(arr_subjects) > 0 THEN (SELECT jsonb_agg(left(x, 80)) FROM (SELECT x FROM jsonb_array_elements_text(arr_subjects) x LIMIT 30) s) END,
        CASE WHEN jsonb_array_length(arr_avail) > 0 THEN (SELECT jsonb_agg(left(x, 20)) FROM (SELECT x FROM jsonb_array_elements_text(arr_avail) x LIMIT 14) s)::text END,
        left(arr_times->>0, 40)
      )
      ON CONFLICT (user_id) DO NOTHING;

    ELSIF r = 'tutor' THEN
      INSERT INTO public.tutor_profiles (user_id, location, gender, country, language, subjects, hourly_rate, currency, teaching_format, bio, certificates, availability, preferred_time, preferred_times)
      VALUES (
        NEW.id, left(p->>'university', 150),
        left(p->>'gender', 40), left(p->>'country', 80), left(p->>'language', 40),
        ARRAY(SELECT left(x, 80) FROM jsonb_array_elements_text(arr_subjects) x LIMIT 30),
        CASE WHEN (p->>'hourly_rate') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' THEN (p->>'hourly_rate')::numeric END,
        CASE WHEN upper(p->>'currency') IN ('EUR', 'USD') THEN upper(p->>'currency') ELSE 'EUR' END,
        left(p->>'teaching_format', 40),
        left(p->>'bio', 2000),
        CASE WHEN jsonb_array_length(arr_certs) > 0 THEN (
          SELECT jsonb_agg(jsonb_build_object(
                   'subject', left(c->>'subject', 100), 'grade', left(c->>'grade', 40),
                   'fileName', left(c->>'fileName', 200), 'fileUrl', NULL))
          FROM (SELECT c FROM jsonb_array_elements(arr_certs) c WHERE jsonb_typeof(c) = 'object' LIMIT 20) s) END,
        CASE WHEN jsonb_array_length(arr_avail) > 0 THEN (SELECT jsonb_agg(left(x, 20)) FROM (SELECT x FROM jsonb_array_elements_text(arr_avail) x LIMIT 14) s) END,
        left(arr_times->>0, 40),
        ARRAY(SELECT left(x, 40) FROM jsonb_array_elements_text(arr_times) x LIMIT 10)
      )
      ON CONFLICT (user_id) DO NOTHING;

      INSERT INTO public.tutor_courses (tutor_id, course_code, course_name)
      SELECT NEW.id, left(c->>'course_code', 40), left(c->>'course_name', 150)
      FROM (SELECT c FROM jsonb_array_elements(arr_courses) c WHERE jsonb_typeof(c) = 'object' LIMIT 30) s
      WHERE coalesce(trim(c->>'course_code'), '') <> '';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: profile creation skipped for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("check_role" "public"."user_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND check_role = ANY(roles)
    AND suspended_at IS NULL
  );
$$;


ALTER FUNCTION "public"."has_role"("check_role" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_job_applicants"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.jobs SET applicant_count = applicant_count + 1
  WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_job_applicants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_student_earnings"("student_user_id" "uuid", "amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.student_profiles
  SET total_earnings = total_earnings + amount
  WHERE user_id = student_user_id;
END;
$$;


ALTER FUNCTION "public"."increment_student_earnings"("student_user_id" "uuid", "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_tutor_earnings"("tutor_user_id" "uuid", "amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.tutor_profiles
  SET total_earnings = total_earnings + amount
  WHERE user_id = tutor_user_id;
END;
$$;


ALTER FUNCTION "public"."increment_tutor_earnings"("tutor_user_id" "uuid", "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND 'admin'::user_role = ANY(roles)
    AND suspended_at IS NULL
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."local_to_utc"("p_date" "date", "p_time" time without time zone, "p_tz" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT (p_date + p_time) AT TIME ZONE CASE WHEN public.valid_timezone(p_tz) THEN p_tz ELSE 'Europe/Berlin' END;
$$;


ALTER FUNCTION "public"."local_to_utc"("p_date" "date", "p_time" time without time zone, "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reply_to_review"("p_review_id" "uuid", "p_reply" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_reply text := nullif(left(btrim(coalesce(p_reply, '')), 1000), '');
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  update public.reviews
     set tutor_reply = v_reply, tutor_reply_at = case when v_reply is null then null else now() end
   where id = p_review_id and tutor_id = auth.uid();
  if not found then raise exception 'You can only reply to reviews of your own lessons.' using errcode = '42501'; end if;
end $$;


ALTER FUNCTION "public"."reply_to_review"("p_review_id" "uuid", "p_reply" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_notification_text"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
BEGIN
  NEW.title := translate(NEW.title, '<>', '‹›');
  NEW.body  := translate(NEW.body,  '<>', '‹›');
  IF NEW.link IS NOT NULL AND NEW.link !~ '^[A-Za-z0-9_-]+\.html([?#][A-Za-z0-9_=&%.-]*)?$' THEN
    NEW.link := NULL;
  END IF;
  RETURN NEW;
END $_$;


ALTER FUNCTION "public"."sanitize_notification_text"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_session_reminders"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  sess RECORD;
BEGIN
  FOR sess IN
    SELECT s.id, s.subject, s.scheduled_at_utc, s.duration_minutes, s.video_link,
           u.email, u.full_name
    FROM public.sessions s
    JOIN public.users u ON u.id = s.student_id
    WHERE s.status = 'confirmed'
    AND s.scheduled_at_utc BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
    AND s.reminder_sent_at IS NULL
  LOOP
    UPDATE public.sessions SET reminder_sent_at = NOW() WHERE id = sess.id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT sess.student_id, 'session_reminder', 'Session reminder',
           'Your ' || sess.subject || ' session is tomorrow',
           jsonb_build_object('session_id', sess.id)
    FROM public.sessions WHERE id = sess.id;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."send_session_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_meeting_link"("p_link" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare v text := nullif(trim(coalesce(p_link, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if v is not null and (v !~* '^https://[^\s/$.?#][^\s]*$' or length(v) > 500) then
    raise exception 'Enter a full link starting with https://' using errcode = '22023';
  end if;
  insert into public.tutor_profiles (user_id, meeting_link) values (auth.uid(), v)
  on conflict (user_id) do update set meeting_link = excluded.meeting_link;
  return v;
end $_$;


ALTER FUNCTION "public"."set_my_meeting_link"("p_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_reaction_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' and (new.message_id <> old.message_id or new.user_id <> old.user_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select m.conversation_id into new.conversation_id from public.messages m where m.id = new.message_id;
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."set_reaction_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_referral_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_referral_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_review_edit_deadline"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.edit_deadline = NEW.created_at + INTERVAL '14 days';
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_review_edit_deadline"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_session_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_session_completed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_lesson_review"("p_session_id" "uuid", "p_rating" integer, "p_comment" "text", "p_tags" "text"[], "p_private_note" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  s public.sessions%rowtype;
  v_end timestamptz;
  v_connected integer;
  v_existing public.reviews%rowtype;
  v_id uuid;
  v_comment text := nullif(left(btrim(coalesce(p_comment, '')), 1000), '');
  v_note text := nullif(left(btrim(coalesce(p_private_note, '')), 2000), '');
  v_tags text[];
  v_allowed text[] := array['Clear explanations','Patient','Well prepared','Helpful materials','Encouraging','On time','Great for exams','Knows the subject'];
begin
  if v_uid is null then raise exception 'Please sign in to rate your lesson.' using errcode = '42501'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Please choose 1 to 5 stars.' using errcode = '22023'; end if;

  select * into s from public.sessions where id = p_session_id;
  if not found or s.student_id is distinct from v_uid then
    raise exception 'Only the student of this lesson can rate it.' using errcode = '42501';
  end if;
  if s.status not in ('confirmed', 'completed') then
    raise exception 'This lesson can''t be rated because it didn''t take place.' using errcode = '22023';
  end if;

  -- The lesson must have happened: marked completed, or its time is over,
  -- or the two of you were connected in the classroom for at least 5 minutes.
  v_end := coalesce(s.ends_at, s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60)));
  select coalesce(sum(connected_seconds), 0) into v_connected
    from public.classroom_attendance where session_id = s.id and user_id = v_uid;
  if not (s.status = 'completed' or now() >= v_end or v_connected >= 300) then
    raise exception 'You can rate this lesson once it has taken place.' using errcode = '22023';
  end if;

  select array_agg(distinct t) into v_tags from unnest(coalesce(p_tags, '{}')) t where t = any(v_allowed);
  v_tags := coalesce(v_tags[1:5], '{}');

  select * into v_existing from public.reviews where session_id = s.id;
  if found then
    if v_existing.created_at < now() - interval '14 days' then
      raise exception 'Reviews can be changed for 14 days after they are written.' using errcode = '22023';
    end if;
    update public.reviews set rating = p_rating, comment = v_comment, tags = v_tags, updated_at = now()
     where id = v_existing.id returning id into v_id;
  else
    insert into public.reviews (tutor_id, student_id, student_name, rating, comment, tags, session_id)
    values (s.tutor_id, v_uid, coalesce(s.student_name, 'Student'), p_rating, v_comment, v_tags, s.id)
    returning id into v_id;
    insert into public.notifications (user_id, type, title, body, link, read)
    values (s.tutor_id, 'new_review', '⭐ New ' || p_rating || '-star review',
            coalesce(s.student_name, 'A student') || ' rated your ' || coalesce(s.subject, '') || ' lesson.',
            'tutor-dashboard.html?tab=reviews', false);
  end if;

  if v_note is not null then
    insert into public.lesson_feedback (session_id, user_id, note) values (s.id, v_uid, v_note);
  end if;
  return v_id;
end $$;


ALTER FUNCTION "public"."submit_lesson_review"("p_session_id" "uuid", "p_rating" integer, "p_comment" "text", "p_tags" "text"[], "p_private_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_feed_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE pid uuid := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE public.feed_posts SET like_count = (SELECT count(*) FROM public.feed_likes WHERE post_id = pid)
   WHERE id = pid;
  RETURN NULL;
END $$;


ALTER FUNCTION "public"."sync_feed_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 200),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_conversation_on_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tutor_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  tutor_user_id UUID;
BEGIN
  -- Find the tutor's user_id from the session
  SELECT s.tutor_id INTO tutor_user_id
  FROM public.sessions s
  JOIN public.tutor_profiles tp ON tp.id = s.tutor_id
  WHERE s.id = NEW.session_id;

  IF tutor_user_id IS NOT NULL THEN
    UPDATE public.tutor_profiles
    SET
      rating_avg = (
        SELECT ROUND(AVG(r.rating)::numeric, 2)
        FROM public.reviews r
        JOIN public.sessions s ON s.id = r.session_id
        JOIN public.tutor_profiles tp ON tp.id = s.tutor_id
        WHERE tp.user_id = tutor_user_id
        AND r.hidden_by_admin = false
      ),
      review_count = (
        SELECT COUNT(*)
        FROM public.reviews r
        JOIN public.sessions s ON s.id = r.session_id
        JOIN public.tutor_profiles tp ON tp.id = s.tutor_id
        WHERE tp.user_id = tutor_user_id
        AND r.hidden_by_admin = false
      )
    WHERE user_id = tutor_user_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_tutor_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_timezone"("tz" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF tz IS NULL OR length(tz) > 64 THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz);
END $$;


ALTER FUNCTION "public"."valid_timezone"("tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_cron_secret"("p_secret" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(length(p_secret) > 0 AND p_secret = (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'), false);
$$;


ALTER FUNCTION "public"."verify_cron_secret"("p_secret" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Waitlist" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text" NOT NULL,
    "type" "text"
);


ALTER TABLE "public"."Waitlist" OWNER TO "postgres";


ALTER TABLE "public"."Waitlist" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Waitlist_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "body" "text" NOT NULL,
    "audience" character varying(50) DEFAULT 'all'::character varying,
    "sent_by" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "recipient_count" integer DEFAULT 0
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" character varying(255) NOT NULL,
    "target_type" "public"."audit_target_type" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "target_email" character varying(255),
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" character varying(50),
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_name" character varying(255),
    "industry" character varying(100),
    "company_size" character varying(50),
    "founded_year" integer,
    "city" character varying(100),
    "country" character varying(100),
    "website_url" character varying(500),
    "linkedin_url" character varying(500),
    "description" "text",
    "tech_stack" "text"[] DEFAULT ARRAY[]::"text"[],
    "logo_url" character varying(500),
    "cover_url" character varying(500),
    "plan" "public"."subscription_plan" DEFAULT 'free'::"public"."subscription_plan",
    "plan_started_at" timestamp with time zone,
    "plan_expires_at" timestamp with time zone,
    "stripe_subscription_id" character varying(255),
    "total_hires" integer DEFAULT 0,
    "total_spent" numeric(10,2) DEFAULT 0,
    "rating_avg" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0,
    "on_time_payment_rate" numeric(5,2) DEFAULT 100,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "employer_score" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."business_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connected_seconds" integer DEFAULT 0 NOT NULL,
    "left_at" timestamp with time zone,
    CONSTRAINT "classroom_attendance_role_check" CHECK (("role" = ANY (ARRAY['tutor'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."classroom_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_1" "uuid",
    "participant_2" "uuid",
    "participant_1_name" "text",
    "participant_2_name" "text",
    "last_message" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."course_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credential_endorsements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "credential_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "business_name" character varying(255),
    "quote" "text",
    "endorsed_skills" "text"[] DEFAULT ARRAY[]::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."credential_endorsements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credentials" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "credential_type" "public"."credential_type" DEFAULT 'other'::"public"."credential_type",
    "description" "text",
    "sessions_count" integer DEFAULT 0,
    "orders_count" integer DEFAULT 0,
    "rating_avg" numeric(3,2) DEFAULT 0,
    "uniskilled_score" integer DEFAULT 0,
    "skills" "text"[] DEFAULT ARRAY[]::"text"[],
    "endorsements" "jsonb" DEFAULT '[]'::"jsonb",
    "public_url" character varying(500),
    "public_slug" character varying(100),
    "qr_code_url" character varying(500),
    "is_active" boolean DEFAULT true,
    "revoked_at" timestamp with time zone,
    "revoke_reason" "text",
    "revoked_by" "uuid",
    "manually_created" boolean DEFAULT false,
    "created_by_admin" "uuid",
    "issued_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "type" "text" NOT NULL,
    "reference_referral_id" "uuid",
    "reference_session_id" "uuid",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_transactions_type_check" CHECK (("type" = ANY (ARRAY['referral_reward'::"text", 'referral_discount_redeemed'::"text", 'referral_welcome_credit'::"text", 'credit_redeemed'::"text", 'credit_restored'::"text", 'admin_adjustment'::"text", 'credit_expired'::"text"])))
);


ALTER TABLE "public"."credit_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disputes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "opened_by" "uuid" NOT NULL,
    "against" "uuid" NOT NULL,
    "session_id" "uuid",
    "order_id" "uuid",
    "reason" "text" NOT NULL,
    "evidence_urls" "text"[] DEFAULT ARRAY[]::"text"[],
    "status" "public"."dispute_status" DEFAULT 'open'::"public"."dispute_status",
    "priority" character varying(20) DEFAULT 'medium'::character varying,
    "admin_id" "uuid",
    "admin_notes" "text",
    "resolution" "public"."dispute_resolution",
    "resolution_notes" "text",
    "refund_amount" numeric(8,2),
    "release_amount" numeric(8,2),
    "resolved_at" timestamp with time zone,
    "deadline" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "dispute_has_context" CHECK (((("session_id" IS NOT NULL) AND ("order_id" IS NULL)) OR (("order_id" IS NOT NULL) AND ("session_id" IS NULL))))
);


ALTER TABLE "public"."disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."error_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sentry_issue_id" "text" NOT NULL,
    "short_id" "text",
    "title" "text",
    "culprit" "text",
    "level" "text",
    "permalink" "text",
    "project" "text",
    "event_count" integer DEFAULT 0,
    "user_count" integer DEFAULT 0,
    "first_seen" timestamp with time zone,
    "last_seen" timestamp with time zone,
    "sentry_status" "text" DEFAULT 'unresolved'::"text",
    "event_summary" "jsonb",
    "review_status" "text" DEFAULT 'new'::"text" NOT NULL,
    "diagnosis" "text",
    "proposed_fix" "text",
    "files_changed" "text"[],
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "error_reviews_review_status_check" CHECK (("review_status" = ANY (ARRAY['new'::"text", 'diagnosing'::"text", 'fix_ready'::"text", 'needs_info'::"text", 'uploaded'::"text", 'fixed'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."error_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_likes" (
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feed_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "author_role" "text" DEFAULT 'student'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "course_code" "text",
    "subject" "text",
    "reply_count" integer DEFAULT 0 NOT NULL,
    "like_count" integer DEFAULT 0 NOT NULL,
    "has_tutor_answer" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "post_type" "text" DEFAULT 'question'::"text" NOT NULL,
    "attachment_url" "text",
    "attachment_name" "text",
    CONSTRAINT "feed_posts_post_type_check" CHECK (("post_type" = ANY (ARRAY['question'::"text", 'share'::"text"])))
);


ALTER TABLE "public"."feed_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "is_tutor_answer" boolean DEFAULT false NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feed_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_session_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_session_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "student_name" "text",
    "status" "text" DEFAULT 'awaiting_payment'::"text" NOT NULL,
    "payment_due_at" timestamp with time zone,
    "paypal_order_id" "text",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_session_participants_status_check" CHECK (("status" = ANY (ARRAY['awaiting_payment'::"text", 'confirmed'::"text", 'payment_expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."group_session_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "tutor_name" "text",
    "subject" "text" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "scheduled_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "format" "text" DEFAULT 'online'::"text",
    "notes" "text",
    "max_students" integer DEFAULT 4 NOT NULL,
    "price_per_student" numeric NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "min_check_done" boolean DEFAULT false,
    "timezone" "text" DEFAULT 'Europe/Berlin'::"text" NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    CONSTRAINT "group_sessions_max_students_check" CHECK ((("max_students" >= 2) AND ("max_students" <= 4))),
    CONSTRAINT "group_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."group_sessions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."group_session_seats" AS
 SELECT "gs"."id" AS "group_session_id",
    ("count"("p"."id") FILTER (WHERE ("p"."status" = 'confirmed'::"text")))::integer AS "confirmed_count",
    ("count"("p"."id") FILTER (WHERE ("p"."status" = 'awaiting_payment'::"text")))::integer AS "pending_count"
   FROM ("public"."group_sessions" "gs"
     LEFT JOIN "public"."group_session_participants" "p" ON (("p"."group_session_id" = "gs"."id")))
  GROUP BY "gs"."id";


ALTER VIEW "public"."group_session_seats" OWNER TO "postgres";


COMMENT ON VIEW "public"."group_session_seats" IS 'Seat counts per group session (no participant names). Lets visitors see spots left.';



CREATE TABLE IF NOT EXISTS "public"."job_applications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "cover_letter" "text",
    "cv_url" character varying(500),
    "portfolio_url" character varying(500),
    "match_score" integer DEFAULT 0,
    "status" character varying(50) DEFAULT 'applied'::character varying,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."job_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "category" character varying(100),
    "type" "public"."job_type" DEFAULT 'freelance'::"public"."job_type",
    "skills_required" "text"[] DEFAULT ARRAY[]::"text"[],
    "budget_min" numeric(8,2),
    "budget_max" numeric(8,2),
    "currency" character varying(3) DEFAULT 'EUR'::character varying,
    "remote" boolean DEFAULT true,
    "location" character varying(255),
    "status" "public"."job_status" DEFAULT 'draft'::"public"."job_status",
    "applicant_count" integer DEFAULT 0,
    "view_count" integer DEFAULT 0,
    "expires_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lesson_feedback_note_check" CHECK (("char_length"("note") <= 2000))
);


ALTER TABLE "public"."lesson_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "conversation_id" "uuid",
    "emoji" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_reactions_emoji_check" CHECK ((("emoji" IS NULL) OR ("emoji" = ANY (ARRAY['👍'::"text", '❤️'::"text", '😂'::"text", '😮'::"text", '😢'::"text", '🙏'::"text"]))))
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "sender_id" "uuid",
    "receiver_id" "uuid",
    "sender_name" "text",
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reply_to" "uuid",
    "attachment_path" "text",
    "attachment_name" "text",
    "attachment_type" "text",
    "attachment_size" integer,
    CONSTRAINT "messages_attachment_complete" CHECK ((("attachment_path" IS NULL) = ("attachment_type" IS NULL))),
    CONSTRAINT "messages_attachment_name_len" CHECK ((("attachment_name" IS NULL) OR ("char_length"("attachment_name") <= 200))),
    CONSTRAINT "messages_attachment_size_chk" CHECK ((("attachment_size" IS NULL) OR (("attachment_size" > 0) AND ("attachment_size" <= 10485760)))),
    CONSTRAINT "messages_attachment_type_chk" CHECK ((("attachment_type" IS NULL) OR ("attachment_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text", 'application/pdf'::"text", 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::"text"]))))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text",
    "title" "text",
    "body" "text",
    "link" "text",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "title" character varying(255) NOT NULL,
    "description" "text",
    "requirements" "text",
    "amount" numeric(8,2) NOT NULL,
    "currency" character varying(3) DEFAULT 'EUR'::character varying,
    "platform_fee_pct" integer DEFAULT 15,
    "platform_fee_amount" numeric(8,2),
    "student_payout" numeric(8,2),
    "business_order_fee_pct" integer DEFAULT 0,
    "business_order_fee_amount" numeric(8,2),
    "stripe_payment_intent_id" character varying(255),
    "stripe_transfer_id" character varying(255),
    "stripe_refund_id" character varying(255),
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status",
    "delivery_deadline" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "delivery_notes" "text",
    "approved_at" timestamp with time zone,
    "auto_release_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" character varying(100) NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" character varying(3) DEFAULT 'EUR'::character varying,
    "platform_fee" numeric(8,2),
    "payer_id" "uuid",
    "payee_id" "uuid",
    "session_id" "uuid",
    "order_id" "uuid",
    "stripe_payment_intent_id" character varying(255),
    "stripe_transfer_id" character varying(255),
    "stripe_refund_id" character varying(255),
    "stripe_event_id" character varying(255),
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "flagged" boolean DEFAULT false,
    "flag_reason" character varying(255),
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tutor_payout" numeric(10,2),
    "paid_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "paypal_batch_id" "text",
    "paypal_order_id" "text",
    "group_session_id" "uuid",
    "paypal_capture_id" "text",
    "discount_amount" numeric(10,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(8,2) NOT NULL,
    "currency" character varying(3) DEFAULT 'EUR'::character varying,
    "stripe_connected_id" character varying(255),
    "stripe_payout_id" character varying(255),
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "processed_at" timestamp with time zone,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payout_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" character varying(100) NOT NULL,
    "value" "text" NOT NULL,
    "type" "public"."setting_type" DEFAULT 'string'::"public"."setting_type" NOT NULL,
    "description" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."platform_settings_map" AS
 SELECT "jsonb_object_agg"("key", "value") AS "settings"
   FROM "public"."platform_settings";


ALTER VIEW "public"."platform_settings_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "role" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'business'::"text", 'tutor'::"text", 'university'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid",
    "student_id" "uuid",
    "tutor_name" "text",
    "student_name" "text",
    "subject" "text",
    "scheduled_date" "date",
    "scheduled_time" time without time zone,
    "duration_minutes" integer DEFAULT 60,
    "format" "text" DEFAULT 'online'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "price" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "daily_room_url" "text",
    "payment_id" "uuid",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "stripe_payment_intent_id" "text",
    "completed_at" timestamp with time zone,
    "payment_due_at" timestamp with time zone,
    "paypal_order_id" "text",
    "currency" "text" DEFAULT 'EUR'::"text",
    "cancelled_by" "text",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "refund_outcome" "text",
    "pending_discount_amount" numeric(10,2),
    "pending_discount_source" "text",
    "timezone" "text" DEFAULT 'Europe/Berlin'::"text" NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "late_reschedule_at" timestamp with time zone,
    "reschedule_count" integer DEFAULT 0 NOT NULL,
    "original_starts_at" timestamp with time zone,
    "tutor_rescheduled_at" timestamp with time zone,
    "exam_date" "date",
    "reminder_24h_sent_at" timestamp with time zone,
    "reminder_1h_sent_at" timestamp with time zone,
    "tutor_nudged_at" timestamp with time zone,
    CONSTRAINT "sessions_cancelled_by_check" CHECK (("cancelled_by" = ANY (ARRAY['student'::"text", 'tutor'::"text"]))),
    CONSTRAINT "sessions_pending_discount_source_check" CHECK (("pending_discount_source" = ANY (ARRAY['referral_welcome'::"text", 'credit_balance'::"text"]))),
    CONSTRAINT "sessions_refund_outcome_check" CHECK (("refund_outcome" = ANY (ARRAY['full_refund'::"text", 'no_refund_reschedule_offered'::"text", 'no_refund'::"text"])))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tutor_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bio" "text",
    "subjects" "text"[] DEFAULT ARRAY[]::"text"[],
    "teaching_levels" "text"[] DEFAULT ARRAY[]::"text"[],
    "hourly_rate" numeric(8,2),
    "currency" character varying(3) DEFAULT 'EUR'::character varying,
    "languages" "text"[] DEFAULT ARRAY[]::"text"[],
    "format" character varying(50) DEFAULT 'online'::character varying,
    "location" character varying(255),
    "teaching_style" "text",
    "materials_url" "text"[] DEFAULT ARRAY[]::"text"[],
    "video_link" character varying(500),
    "rating_avg" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0,
    "sessions_count" integer DEFAULT 0,
    "response_rate" numeric(5,2) DEFAULT 0,
    "completion_rate" numeric(5,2) DEFAULT 0,
    "no_show_count" integer DEFAULT 0,
    "total_earnings" numeric(10,2) DEFAULT 0,
    "university_verified_at" timestamp with time zone,
    "grade_verified_at" timestamp with time zone,
    "certified_at" timestamp with time zone,
    "top_rated_at" timestamp with time zone,
    "next_available" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "session_length" character varying,
    "availability" "jsonb",
    "preferred_time" character varying,
    "teaching_format" character varying DEFAULT 'online'::character varying,
    "country" character varying,
    "language" character varying,
    "gender" character varying,
    "certificates" "jsonb",
    "degree_level" character varying,
    "major" character varying,
    "overall_grade" character varying,
    "max_students" integer,
    "avatar_url" "text",
    "study_year" character varying,
    "cover_url" "text",
    "meeting_link" "text",
    "stripe_account_id" "text",
    "stripe_account_status" "text" DEFAULT 'not_connected'::"text",
    "paypal_email" "text",
    "payout_method" "text" DEFAULT 'stripe'::"text",
    "preferred_times" "text"[] DEFAULT '{}'::"text"[],
    "verified_university" "text",
    CONSTRAINT "tutor_profiles_payout_method_check" CHECK (("payout_method" = ANY (ARRAY['stripe'::"text", 'paypal'::"text"])))
);


ALTER TABLE "public"."tutor_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."tutor_profiles" IS 'SELECT for authenticated is column-level: new public columns must be granted explicitly. Private: meeting_link, paypal_email, payout_method, stripe_account_id, stripe_account_status, total_earnings.';



CREATE OR REPLACE VIEW "public"."public_tutor_subject_stats" AS
 SELECT "s"."tutor_id",
    COALESCE("max"(NULLIF(TRIM(BOTH FROM "s"."subject"), ''::"text")), 'Other'::"text") AS "subject",
    ("count"(*))::integer AS "completed_sessions"
   FROM ("public"."sessions" "s"
     JOIN "public"."tutor_profiles" "tp" ON (("tp"."user_id" = "s"."tutor_id")))
  WHERE ("s"."status" = 'completed'::"text")
  GROUP BY "s"."tutor_id", ("lower"(COALESCE(NULLIF(TRIM(BOTH FROM "s"."subject"), ''::"text"), 'Other'::"text")));


ALTER VIEW "public"."public_tutor_subject_stats" OWNER TO "postgres";


COMMENT ON VIEW "public"."public_tutor_subject_stats" IS 'Completed-session counts per tutor and subject (no student data). Powers the Track Record card.';



CREATE OR REPLACE VIEW "public"."public_tutors" AS
 SELECT "u"."id",
    "u"."full_name",
    "u"."avatar_url",
    "u"."cover_url",
    "u"."bio",
    "u"."country",
    "u"."city",
    "u"."language",
    "u"."created_at",
    (( SELECT "count"(*) AS "count"
           FROM "public"."sessions" "s"
          WHERE (("s"."tutor_id" = "u"."id") AND ("s"."status" = 'completed'::"text"))))::integer AS "completed_sessions",
    "u"."website_url",
    "u"."linkedin_url",
    "u"."github_url"
   FROM ("public"."users" "u"
     JOIN "public"."tutor_profiles" "tp" ON (("tp"."user_id" = "u"."id")))
  WHERE ("u"."suspended_at" IS NULL);


ALTER VIEW "public"."public_tutors" OWNER TO "postgres";


COMMENT ON VIEW "public"."public_tutors" IS 'Public tutor card data (tutors only, public columns only). Used by Find Tutors, tutor profiles and certificates.';



CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "invitee_id" "uuid" NOT NULL,
    "referral_code" character varying(12) NOT NULL,
    "invitee_role" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "qualifying_session_id" "uuid",
    "referrer_reward_amount" numeric(10,2),
    "invitee_discount_amount" numeric(10,2) DEFAULT 10.00 NOT NULL,
    "invitee_discount_applied" boolean DEFAULT false NOT NULL,
    "invitee_discount_applied_session_id" "uuid",
    "qualified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "referrals_invitee_role_check" CHECK (("invitee_role" = ANY (ARRAY['student'::"text", 'tutor'::"text"]))),
    CONSTRAINT "referrals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'qualified'::"text", 'expired'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reschedule_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requester_role" "text" NOT NULL,
    "new_date" "date" NOT NULL,
    "new_time" time without time zone NOT NULL,
    "new_starts_at" timestamp with time zone NOT NULL,
    "is_late" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "reschedule_requests_requester_role_check" CHECK (("requester_role" = ANY (ARRAY['student'::"text", 'tutor'::"text"]))),
    CONSTRAINT "reschedule_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'withdrawn'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."reschedule_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."reschedule_requests" IS 'Reschedule requests: the other participant must accept. Written only by the reschedule-session Edge Function.';



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid",
    "student_id" "uuid",
    "student_name" "text",
    "rating" integer,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "session_id" "uuid",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone,
    "tutor_reply" "text",
    "tutor_reply_at" timestamp with time zone,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_rating_range" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_tutor_reply_check" CHECK (("char_length"("tutor_reply") <= 1000))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_students" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."saved_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_tutors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."saved_tutors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_health_snapshots" (
    "id" bigint NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kpis" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "daily" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "top_issues" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "captured_by" "text"
);


ALTER TABLE "public"."site_health_snapshots" OWNER TO "postgres";


ALTER TABLE "public"."site_health_snapshots" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."site_health_snapshots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."student_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "university" character varying(255),
    "degree" character varying(255),
    "major" character varying(255),
    "year_of_study" integer,
    "graduation_year" integer,
    "skills" "text"[] DEFAULT ARRAY[]::"text"[],
    "hourly_rate" numeric(8,2),
    "currency" character varying(3) DEFAULT 'EUR'::character varying,
    "availability" "text",
    "cv_url" character varying(500),
    "portfolio_url" character varying(500),
    "portfolio_files" "text"[] DEFAULT ARRAY[]::"text"[],
    "is_available" boolean DEFAULT true,
    "total_orders" integer DEFAULT 0,
    "total_earnings" numeric(10,2) DEFAULT 0,
    "rating_avg" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gender" character varying,
    "country" character varying,
    "language" character varying,
    "bio" "text",
    "subjects" "jsonb",
    "preferred_time" character varying
);


ALTER TABLE "public"."student_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subject_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "student_name" "text",
    "subject" "text" NOT NULL,
    "notes" "text",
    "level" "text",
    "frequency" "text",
    "language" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "accepted_tutor_id" "uuid",
    "accepted_tutor_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "university" "text",
    "admin_notified_at" timestamp with time zone,
    "match_notified_at" timestamp with time zone
);


ALTER TABLE "public"."subject_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tutor_availability" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time_utc" time without time zone NOT NULL,
    "end_time_utc" time without time zone NOT NULL,
    "is_recurring" boolean DEFAULT true,
    "effective_from" "date" DEFAULT CURRENT_DATE,
    "effective_until" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tutor_availability_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."tutor_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tutor_blocked_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "blocked_date" "date" NOT NULL,
    "all_day" boolean DEFAULT true NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tutor_blocked_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tutor_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "course_code" "text",
    "course_name" "text",
    "professor_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "university" "text",
    "semester" "text",
    "grade" "text",
    CONSTRAINT "tutor_courses_lengths" CHECK (((COALESCE("length"("course_code"), 0) <= 40) AND (COALESCE("length"("course_name"), 0) <= 120) AND (COALESCE("length"("professor_name"), 0) <= 80) AND (COALESCE("length"("university"), 0) <= 120) AND (COALESCE("length"("semester"), 0) <= 30) AND (COALESCE("length"("grade"), 0) <= 20))),
    CONSTRAINT "tutor_courses_name_or_code" CHECK ((COALESCE(NULLIF(TRIM(BOTH FROM "course_code"), ''::"text"), NULLIF(TRIM(BOTH FROM "course_name"), ''::"text")) IS NOT NULL))
);


ALTER TABLE "public"."tutor_courses" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tutor_listing" AS
 SELECT "tp"."id",
    "tp"."user_id",
    "u"."full_name",
    "u"."avatar_url",
    "u"."city",
    "u"."country",
    "u"."timezone",
    "tp"."bio",
    "tp"."subjects",
    "tp"."teaching_levels",
    "tp"."hourly_rate",
    "tp"."currency",
    "tp"."languages",
    "tp"."format",
    "tp"."rating_avg",
    "tp"."review_count",
    "tp"."sessions_count",
    "tp"."response_rate",
    "tp"."next_available",
    ("tp"."university_verified_at" IS NOT NULL) AS "university_verified",
    ("tp"."grade_verified_at" IS NOT NULL) AS "grade_verified",
    ("tp"."certified_at" IS NOT NULL) AS "uniskilled_certified",
    ("tp"."top_rated_at" IS NOT NULL) AS "top_rated"
   FROM ("public"."tutor_profiles" "tp"
     JOIN "public"."users" "u" ON (("u"."id" = "tp"."user_id")))
  WHERE (("tp"."is_active" = true) AND ("u"."suspended_at" IS NULL));


ALTER VIEW "public"."tutor_listing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tutor_university_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "university" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_at" timestamp with time zone
);


ALTER TABLE "public"."tutor_university_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tutor_verifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "document_type" character varying(100),
    "document_url" character varying(500) NOT NULL,
    "status" "public"."verification_status" DEFAULT 'pending'::"public"."verification_status",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tutor_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."university_domain_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "university" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "university_domain_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."university_domain_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."university_domains" (
    "domain" "text" NOT NULL,
    "name" "text" NOT NULL,
    "country" "text",
    "source" "text" DEFAULT 'hipo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "university_domains_domain_check" CHECK ((("domain" = "lower"("domain")) AND ("domain" ~ '^[a-z0-9.-]+\.[a-z]{2,}$'::"text")))
);


ALTER TABLE "public"."university_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "reported_by" "uuid" NOT NULL,
    "reported_user" "uuid" NOT NULL,
    "report_type" character varying(100) NOT NULL,
    "description" "text" NOT NULL,
    "evidence_urls" "text"[] DEFAULT ARRAY[]::"text"[],
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "admin_notes" "text",
    "credit_issued" boolean DEFAULT false,
    "credit_amount" numeric(8,2),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_warnings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "issued_by" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_warnings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."Waitlist"
    ADD CONSTRAINT "Waitlist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."Waitlist"
    ADD CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."classroom_attendance"
    ADD CONSTRAINT "classroom_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_1_participant_2_key" UNIQUE ("participant_1", "participant_2");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_follows"
    ADD CONSTRAINT "course_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_follows"
    ADD CONSTRAINT "course_follows_user_id_course_code_key" UNIQUE ("user_id", "course_code");



ALTER TABLE ONLY "public"."credential_endorsements"
    ADD CONSTRAINT "credential_endorsements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_public_slug_key" UNIQUE ("public_slug");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_public_url_key" UNIQUE ("public_url");



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."error_reviews"
    ADD CONSTRAINT "error_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."error_reviews"
    ADD CONSTRAINT "error_reviews_sentry_issue_id_key" UNIQUE ("sentry_issue_id");



ALTER TABLE ONLY "public"."feed_likes"
    ADD CONSTRAINT "feed_likes_pkey" PRIMARY KEY ("post_id", "user_id");



ALTER TABLE ONLY "public"."feed_posts"
    ADD CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_replies"
    ADD CONSTRAINT "feed_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_session_participants"
    ADD CONSTRAINT "group_session_participants_group_session_id_student_id_key" UNIQUE ("group_session_id", "student_id");



ALTER TABLE ONLY "public"."group_session_participants"
    ADD CONSTRAINT "group_session_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."group_sessions"
    ADD CONSTRAINT "group_sessions_min_price_check" CHECK ((("price_per_student" IS NULL) OR (("currency" = 'USD'::"text") AND ("price_per_student" >= (11)::numeric)) OR (("currency" IS DISTINCT FROM 'USD'::"text") AND ("price_per_student" >= (10)::numeric)))) NOT VALID;



ALTER TABLE ONLY "public"."group_sessions"
    ADD CONSTRAINT "group_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_job_id_student_id_key" UNIQUE ("job_id", "student_id");



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_feedback"
    ADD CONSTRAINT "lesson_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_invitee_id_key" UNIQUE ("invitee_id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reschedule_requests"
    ADD CONSTRAINT "reschedule_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_students"
    ADD CONSTRAINT "saved_students_business_id_student_id_key" UNIQUE ("business_id", "student_id");



ALTER TABLE ONLY "public"."saved_students"
    ADD CONSTRAINT "saved_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_tutors"
    ADD CONSTRAINT "saved_tutors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_tutors"
    ADD CONSTRAINT "saved_tutors_student_id_tutor_id_key" UNIQUE ("student_id", "tutor_id");



ALTER TABLE "public"."sessions"
    ADD CONSTRAINT "sessions_min_price_check" CHECK ((("price" IS NULL) OR (("currency" = 'USD'::"text") AND ("price" >= (17)::numeric)) OR (("currency" IS DISTINCT FROM 'USD'::"text") AND ("price" >= (15)::numeric)))) NOT VALID;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_health_snapshots"
    ADD CONSTRAINT "site_health_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."subject_requests"
    ADD CONSTRAINT "subject_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tutor_availability"
    ADD CONSTRAINT "tutor_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tutor_blocked_slots"
    ADD CONSTRAINT "tutor_blocked_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tutor_courses"
    ADD CONSTRAINT "tutor_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tutor_profiles"
    ADD CONSTRAINT "tutor_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tutor_profiles"
    ADD CONSTRAINT "tutor_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."tutor_university_verifications"
    ADD CONSTRAINT "tutor_university_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tutor_verifications"
    ADD CONSTRAINT "tutor_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."university_domain_requests"
    ADD CONSTRAINT "university_domain_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."university_domains"
    ADD CONSTRAINT "university_domains_pkey" PRIMARY KEY ("domain");



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_referral_code_key" UNIQUE ("referral_code");



CREATE INDEX "classroom_attendance_session_idx" ON "public"."classroom_attendance" USING "btree" ("session_id", "user_id", "joined_at" DESC);



CREATE INDEX "error_reviews_status_idx" ON "public"."error_reviews" USING "btree" ("review_status", "updated_at" DESC);



CREATE INDEX "idx_applications_job" ON "public"."job_applications" USING "btree" ("job_id");



CREATE INDEX "idx_applications_score" ON "public"."job_applications" USING "btree" ("match_score" DESC);



CREATE INDEX "idx_applications_student" ON "public"."job_applications" USING "btree" ("student_id");



CREATE INDEX "idx_audit_admin" ON "public"."audit_logs" USING "btree" ("admin_id");



CREATE INDEX "idx_audit_created" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_target" ON "public"."audit_logs" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_availability_day" ON "public"."tutor_availability" USING "btree" ("day_of_week");



CREATE INDEX "idx_availability_tutor" ON "public"."tutor_availability" USING "btree" ("tutor_id");



CREATE INDEX "idx_blocked_slots_tutor_date" ON "public"."tutor_blocked_slots" USING "btree" ("tutor_id", "blocked_date");



CREATE INDEX "idx_business_plan" ON "public"."business_profiles" USING "btree" ("plan");



CREATE INDEX "idx_business_user" ON "public"."business_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_business_verified" ON "public"."business_profiles" USING "btree" ("verified_at") WHERE ("verified_at" IS NOT NULL);



CREATE INDEX "idx_conversations_p2" ON "public"."conversations" USING "btree" ("participant_2");



CREATE INDEX "idx_course_follows_code" ON "public"."course_follows" USING "btree" ("lower"("course_code"));



CREATE INDEX "idx_course_follows_user" ON "public"."course_follows" USING "btree" ("user_id");



CREATE INDEX "idx_credentials_slug" ON "public"."credentials" USING "btree" ("public_slug");



CREATE INDEX "idx_credentials_user" ON "public"."credentials" USING "btree" ("user_id");



CREATE INDEX "idx_credit_tx_user" ON "public"."credit_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_disputes_opened_by" ON "public"."disputes" USING "btree" ("opened_by");



CREATE INDEX "idx_disputes_session" ON "public"."disputes" USING "btree" ("session_id");



CREATE INDEX "idx_disputes_status" ON "public"."disputes" USING "btree" ("status");



CREATE INDEX "idx_feed_posts_course" ON "public"."feed_posts" USING "btree" ("lower"("course_code"));



CREATE INDEX "idx_feed_posts_created" ON "public"."feed_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_feed_replies_post" ON "public"."feed_replies" USING "btree" ("post_id");



CREATE INDEX "idx_fk_announcements_sent_by_fkey" ON "public"."announcements" USING "btree" ("sent_by");



CREATE INDEX "idx_fk_business_profiles_verified_by_fkey" ON "public"."business_profiles" USING "btree" ("verified_by");



CREATE INDEX "idx_fk_classroom_attendance_user_id_fkey" ON "public"."classroom_attendance" USING "btree" ("user_id");



CREATE INDEX "idx_fk_credential_endorsements_business_id_fkey" ON "public"."credential_endorsements" USING "btree" ("business_id");



CREATE INDEX "idx_fk_credential_endorsements_credential_id_fkey" ON "public"."credential_endorsements" USING "btree" ("credential_id");



CREATE INDEX "idx_fk_credentials_created_by_admin_fkey" ON "public"."credentials" USING "btree" ("created_by_admin");



CREATE INDEX "idx_fk_credentials_revoked_by_fkey" ON "public"."credentials" USING "btree" ("revoked_by");



CREATE INDEX "idx_fk_credit_transactions_reference_referral_id_fkey" ON "public"."credit_transactions" USING "btree" ("reference_referral_id");



CREATE INDEX "idx_fk_credit_transactions_reference_session_id_fkey" ON "public"."credit_transactions" USING "btree" ("reference_session_id");



CREATE INDEX "idx_fk_disputes_admin_id_fkey" ON "public"."disputes" USING "btree" ("admin_id");



CREATE INDEX "idx_fk_disputes_against_fkey" ON "public"."disputes" USING "btree" ("against");



CREATE INDEX "idx_fk_disputes_order_id_fkey" ON "public"."disputes" USING "btree" ("order_id");



CREATE INDEX "idx_fk_feed_likes_user_id_fkey" ON "public"."feed_likes" USING "btree" ("user_id");



CREATE INDEX "idx_fk_feed_posts_author_id_fkey" ON "public"."feed_posts" USING "btree" ("author_id");



CREATE INDEX "idx_fk_feed_replies_author_id_fkey" ON "public"."feed_replies" USING "btree" ("author_id");



CREATE INDEX "idx_fk_group_session_participants_student_id_fkey" ON "public"."group_session_participants" USING "btree" ("student_id");



CREATE INDEX "idx_fk_group_sessions_tutor_id_fkey" ON "public"."group_sessions" USING "btree" ("tutor_id");



CREATE INDEX "idx_fk_lesson_feedback_session_id_fkey" ON "public"."lesson_feedback" USING "btree" ("session_id");



CREATE INDEX "idx_fk_lesson_feedback_user_id_fkey" ON "public"."lesson_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_fk_message_reactions_user_id_fkey" ON "public"."message_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_fk_messages_sender_id_fkey" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_fk_orders_job_id_fkey" ON "public"."orders" USING "btree" ("job_id");



CREATE INDEX "idx_fk_payments_order_id_fkey" ON "public"."payments" USING "btree" ("order_id");



CREATE INDEX "idx_fk_payments_reviewed_by_fkey" ON "public"."payments" USING "btree" ("reviewed_by");



CREATE INDEX "idx_fk_payout_requests_user_id_fkey" ON "public"."payout_requests" USING "btree" ("user_id");



CREATE INDEX "idx_fk_platform_settings_updated_by_fkey" ON "public"."platform_settings" USING "btree" ("updated_by");



CREATE INDEX "idx_fk_referrals_invitee_discount_applied_session_id_fkey" ON "public"."referrals" USING "btree" ("invitee_discount_applied_session_id");



CREATE INDEX "idx_fk_referrals_qualifying_session_id_fkey" ON "public"."referrals" USING "btree" ("qualifying_session_id");



CREATE INDEX "idx_fk_reviews_student_id_fkey" ON "public"."reviews" USING "btree" ("student_id");



CREATE INDEX "idx_fk_saved_students_student_id_fkey" ON "public"."saved_students" USING "btree" ("student_id");



CREATE INDEX "idx_fk_saved_tutors_tutor_id_fkey" ON "public"."saved_tutors" USING "btree" ("tutor_id");



CREATE INDEX "idx_fk_sessions_payment_id_fkey" ON "public"."sessions" USING "btree" ("payment_id");



CREATE INDEX "idx_fk_subject_requests_accepted_tutor_id_fkey" ON "public"."subject_requests" USING "btree" ("accepted_tutor_id");



CREATE INDEX "idx_fk_subject_requests_student_id_fkey" ON "public"."subject_requests" USING "btree" ("student_id");



CREATE INDEX "idx_fk_tutor_verifications_reviewed_by_fkey" ON "public"."tutor_verifications" USING "btree" ("reviewed_by");



CREATE INDEX "idx_fk_tutor_verifications_tutor_id_fkey" ON "public"."tutor_verifications" USING "btree" ("tutor_id");



CREATE INDEX "idx_fk_user_reports_reported_by_fkey" ON "public"."user_reports" USING "btree" ("reported_by");



CREATE INDEX "idx_fk_user_reports_reported_user_fkey" ON "public"."user_reports" USING "btree" ("reported_user");



CREATE INDEX "idx_fk_user_reports_reviewed_by_fkey" ON "public"."user_reports" USING "btree" ("reviewed_by");



CREATE INDEX "idx_fk_user_warnings_issued_by_fkey" ON "public"."user_warnings" USING "btree" ("issued_by");



CREATE INDEX "idx_fk_user_warnings_user_id_fkey" ON "public"."user_warnings" USING "btree" ("user_id");



CREATE INDEX "idx_fk_users_suspended_by_fkey" ON "public"."users" USING "btree" ("suspended_by");



CREATE INDEX "idx_gsp_group" ON "public"."group_session_participants" USING "btree" ("group_session_id");



CREATE INDEX "idx_jobs_business" ON "public"."jobs" USING "btree" ("business_id");



CREATE INDEX "idx_jobs_created" ON "public"."jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_jobs_skills" ON "public"."jobs" USING "gin" ("skills_required");



CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING "btree" ("status");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_messages_receiver_unread" ON "public"."messages" USING "btree" ("receiver_id") WHERE ("read" = false);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read" = false);



CREATE INDEX "idx_orders_business" ON "public"."orders" USING "btree" ("business_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_stripe" ON "public"."orders" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "idx_orders_student" ON "public"."orders" USING "btree" ("student_id");



CREATE INDEX "idx_payments_flagged" ON "public"."payments" USING "btree" ("flagged") WHERE ("flagged" = true);



CREATE INDEX "idx_payments_group_session" ON "public"."payments" USING "btree" ("group_session_id");



CREATE INDEX "idx_payments_payee" ON "public"."payments" USING "btree" ("payee_id");



CREATE INDEX "idx_payments_payer" ON "public"."payments" USING "btree" ("payer_id");



CREATE INDEX "idx_payments_session" ON "public"."payments" USING "btree" ("session_id");



CREATE INDEX "idx_payments_stripe" ON "public"."payments" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_referrals_invitee" ON "public"."referrals" USING "btree" ("invitee_id");



CREATE INDEX "idx_referrals_pending_qualify" ON "public"."referrals" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_referrals_referrer" ON "public"."referrals" USING "btree" ("referrer_id");



CREATE INDEX "idx_reviews_tutor" ON "public"."reviews" USING "btree" ("tutor_id");



CREATE INDEX "idx_sessions_status_ends" ON "public"."sessions" USING "btree" ("status", "ends_at");



CREATE INDEX "idx_sessions_student" ON "public"."sessions" USING "btree" ("student_id");



CREATE INDEX "idx_sessions_tutor_starts" ON "public"."sessions" USING "btree" ("tutor_id", "starts_at");



CREATE INDEX "idx_student_skills" ON "public"."student_profiles" USING "gin" ("skills");



CREATE INDEX "idx_student_user" ON "public"."student_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_tutor_active" ON "public"."tutor_profiles" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_tutor_courses_code" ON "public"."tutor_courses" USING "btree" ("lower"("course_code"));



CREATE INDEX "idx_tutor_courses_tutor" ON "public"."tutor_courses" USING "btree" ("tutor_id");



CREATE INDEX "idx_tutor_rating" ON "public"."tutor_profiles" USING "btree" ("rating_avg" DESC);



CREATE INDEX "idx_tutor_subjects" ON "public"."tutor_profiles" USING "gin" ("subjects");



CREATE INDEX "idx_tutor_user" ON "public"."tutor_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_roles" ON "public"."users" USING "gin" ("roles");



CREATE INDEX "idx_users_suspended" ON "public"."users" USING "btree" ("suspended_at") WHERE ("suspended_at" IS NOT NULL);



CREATE INDEX "message_reactions_conv_idx" ON "public"."message_reactions" USING "btree" ("conversation_id");



CREATE INDEX "messages_attachment_path_idx" ON "public"."messages" USING "btree" ("attachment_path") WHERE ("attachment_path" IS NOT NULL);



CREATE INDEX "messages_reply_to_idx" ON "public"."messages" USING "btree" ("reply_to") WHERE ("reply_to" IS NOT NULL);



CREATE UNIQUE INDEX "payments_one_per_session" ON "public"."payments" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE UNIQUE INDEX "payments_paypal_order_unique" ON "public"."payments" USING "btree" ("paypal_order_id") WHERE ("paypal_order_id" IS NOT NULL);



CREATE UNIQUE INDEX "reschedule_requests_one_pending" ON "public"."reschedule_requests" USING "btree" ("session_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "reschedule_requests_session" ON "public"."reschedule_requests" USING "btree" ("session_id");



CREATE UNIQUE INDEX "reviews_session_unique" ON "public"."reviews" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE UNIQUE INDEX "tuv_email_verified_once" ON "public"."tutor_university_verifications" USING "btree" ("lower"("email")) WHERE ("verified_at" IS NOT NULL);



CREATE INDEX "tuv_user_idx" ON "public"."tutor_university_verifications" USING "btree" ("user_id", "sent_at" DESC);



CREATE OR REPLACE TRIGGER "a0_compute_session_times" BEFORE INSERT OR UPDATE ON "public"."group_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."a0_compute_session_times"();



CREATE OR REPLACE TRIGGER "a0_compute_session_times" BEFORE INSERT OR UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."a0_compute_session_times"();



CREATE OR REPLACE TRIGGER "a1_force_online_format" BEFORE INSERT OR UPDATE ON "public"."group_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."a1_force_online_format"();



CREATE OR REPLACE TRIGGER "a1_force_online_format" BEFORE INSERT ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."a1_force_online_format"();



CREATE OR REPLACE TRIGGER "a1_force_online_format" BEFORE INSERT OR UPDATE ON "public"."tutor_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."a1_force_online_format"();



CREATE OR REPLACE TRIGGER "a_block_contact_info" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."a_block_contact_info"();



CREATE OR REPLACE TRIGGER "a_guard_feed_posts" BEFORE INSERT OR UPDATE ON "public"."feed_posts" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_feed_posts"();



CREATE OR REPLACE TRIGGER "a_guard_group_sessions" BEFORE INSERT OR DELETE OR UPDATE ON "public"."group_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_group_sessions"();



CREATE OR REPLACE TRIGGER "a_guard_gsp" BEFORE INSERT OR UPDATE ON "public"."group_session_participants" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_gsp"();



CREATE OR REPLACE TRIGGER "a_guard_messages" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_messages"();



CREATE OR REPLACE TRIGGER "a_guard_notifications" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_notifications"();



CREATE OR REPLACE TRIGGER "a_guard_referrals" BEFORE INSERT OR DELETE OR UPDATE ON "public"."referrals" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_referrals"();



CREATE OR REPLACE TRIGGER "a_guard_reviews" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_reviews"();



CREATE OR REPLACE TRIGGER "a_guard_sessions" BEFORE INSERT OR UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_sessions"();



CREATE OR REPLACE TRIGGER "a_guard_subject_requests" BEFORE INSERT OR UPDATE ON "public"."subject_requests" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_subject_requests"();



CREATE OR REPLACE TRIGGER "a_guard_tutor_profiles" BEFORE INSERT OR UPDATE ON "public"."tutor_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_tutor_profiles"();



CREATE OR REPLACE TRIGGER "a_guard_users" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."a_guard_users"();



CREATE OR REPLACE TRIGGER "b_check_message_extras" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."b_check_message_extras"();



CREATE OR REPLACE TRIGGER "on_job_application" AFTER INSERT ON "public"."job_applications" FOR EACH ROW EXECUTE FUNCTION "public"."increment_job_applicants"();



CREATE OR REPLACE TRIGGER "set_business_profiles_updated_at" BEFORE UPDATE ON "public"."business_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_disputes_updated_at" BEFORE UPDATE ON "public"."disputes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_reaction_conversation" BEFORE INSERT OR UPDATE ON "public"."message_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_reaction_conversation"();



CREATE OR REPLACE TRIGGER "set_student_profiles_updated_at" BEFORE UPDATE ON "public"."student_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_tutor_profiles_updated_at" BEFORE UPDATE ON "public"."tutor_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sanitize_notification" BEFORE INSERT OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_notification_text"();



CREATE OR REPLACE TRIGGER "trg_set_referral_code" BEFORE INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_referral_code"();



CREATE OR REPLACE TRIGGER "trg_set_session_completed_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_session_completed_at"();



CREATE OR REPLACE TRIGGER "z_sync_feed_like_count" AFTER INSERT OR DELETE ON "public"."feed_likes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_feed_like_count"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."classroom_attendance"
    ADD CONSTRAINT "classroom_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_attendance"
    ADD CONSTRAINT "classroom_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_1_fkey" FOREIGN KEY ("participant_1") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_2_fkey" FOREIGN KEY ("participant_2") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_follows"
    ADD CONSTRAINT "course_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credential_endorsements"
    ADD CONSTRAINT "credential_endorsements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."credential_endorsements"
    ADD CONSTRAINT "credential_endorsements_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_created_by_admin_fkey" FOREIGN KEY ("created_by_admin") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."credentials"
    ADD CONSTRAINT "credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_reference_referral_id_fkey" FOREIGN KEY ("reference_referral_id") REFERENCES "public"."referrals"("id");



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_reference_session_id_fkey" FOREIGN KEY ("reference_session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_against_fkey" FOREIGN KEY ("against") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."feed_likes"
    ADD CONSTRAINT "feed_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_likes"
    ADD CONSTRAINT "feed_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_posts"
    ADD CONSTRAINT "feed_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_replies"
    ADD CONSTRAINT "feed_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_replies"
    ADD CONSTRAINT "feed_replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_session_participants"
    ADD CONSTRAINT "group_session_participants_group_session_id_fkey" FOREIGN KEY ("group_session_id") REFERENCES "public"."group_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_session_participants"
    ADD CONSTRAINT "group_session_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."group_sessions"
    ADD CONSTRAINT "group_sessions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_feedback"
    ADD CONSTRAINT "lesson_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_feedback"
    ADD CONSTRAINT "lesson_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_fkey" FOREIGN KEY ("reply_to") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_group_session_id_fkey" FOREIGN KEY ("group_session_id") REFERENCES "public"."group_sessions"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_invitee_discount_applied_session_id_fkey" FOREIGN KEY ("invitee_discount_applied_session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_qualifying_session_id_fkey" FOREIGN KEY ("qualifying_session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."reschedule_requests"
    ADD CONSTRAINT "reschedule_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."saved_students"
    ADD CONSTRAINT "saved_students_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_students"
    ADD CONSTRAINT "saved_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_tutors"
    ADD CONSTRAINT "saved_tutors_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_tutors"
    ADD CONSTRAINT "saved_tutors_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subject_requests"
    ADD CONSTRAINT "subject_requests_accepted_tutor_id_fkey" FOREIGN KEY ("accepted_tutor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subject_requests"
    ADD CONSTRAINT "subject_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tutor_availability"
    ADD CONSTRAINT "tutor_availability_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tutor_blocked_slots"
    ADD CONSTRAINT "tutor_blocked_slots_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tutor_courses"
    ADD CONSTRAINT "tutor_courses_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tutor_profiles"
    ADD CONSTRAINT "tutor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tutor_verifications"
    ADD CONSTRAINT "tutor_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tutor_verifications"
    ADD CONSTRAINT "tutor_verifications_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reported_user_fkey" FOREIGN KEY ("reported_user") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_warnings"
    ADD CONSTRAINT "user_warnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id");



CREATE POLICY "Allow public inserts" ON "public"."Waitlist" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Announcements: admin manages" ON "public"."announcements" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Announcements: public read" ON "public"."announcements" FOR SELECT USING (true);



CREATE POLICY "Anyone can read feed posts" ON "public"."feed_posts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read likes" ON "public"."feed_likes" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read replies" ON "public"."feed_replies" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Applications: admin full access" ON "public"."job_applications" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Applications: business reads for own jobs" ON "public"."job_applications" FOR SELECT USING (("job_id" IN ( SELECT "jobs"."id"
   FROM "public"."jobs"
  WHERE ("jobs"."business_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Applications: student manages own" ON "public"."job_applications" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Audit: admin only" ON "public"."audit_logs" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Availability: public read" ON "public"."tutor_availability" FOR SELECT USING (true);



CREATE POLICY "Availability: tutor manages own" ON "public"."tutor_availability" USING (("tutor_id" IN ( SELECT "tutor_profiles"."id"
   FROM "public"."tutor_profiles"
  WHERE ("tutor_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Business profiles: admin full access" ON "public"."business_profiles" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Business profiles: own full access" ON "public"."business_profiles" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Business profiles: public read verified" ON "public"."business_profiles" FOR SELECT USING (true);



CREATE POLICY "Credentials: admin manages" ON "public"."credentials" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Credentials: owner reads own" ON "public"."credentials" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Credentials: public reads active" ON "public"."credentials" FOR SELECT USING ((("is_active" = true) AND ("revoked_at" IS NULL)));



CREATE POLICY "Disputes: admin full access" ON "public"."disputes" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Disputes: participants access" ON "public"."disputes" USING ((("opened_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("against" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Jobs: admin full access" ON "public"."jobs" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Jobs: business manages own" ON "public"."jobs" USING (("business_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Jobs: public read live" ON "public"."jobs" FOR SELECT USING (("status" = 'live'::"public"."job_status"));



CREATE POLICY "Orders: admin full access" ON "public"."orders" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Orders: participants access" ON "public"."orders" USING ((("business_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Own profile only" ON "public"."profiles" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Payments: admin full access" ON "public"."payments" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Payments: own transactions" ON "public"."payments" FOR SELECT USING ((("payer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("payee_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Payouts: admin full access" ON "public"."payout_requests" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Payouts: own only" ON "public"."payout_requests" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Reports: admin full access" ON "public"."user_reports" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Reports: anyone can report" ON "public"."user_reports" FOR INSERT WITH CHECK (("reported_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Reports: reporter sees own" ON "public"."user_reports" FOR SELECT USING (("reported_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Saved students: business manages own" ON "public"."saved_students" USING (("business_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Saved tutors: student manages own" ON "public"."saved_tutors" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Settings: admin write" ON "public"."platform_settings" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Settings: public read" ON "public"."platform_settings" FOR SELECT USING (true);



CREATE POLICY "Student profiles: admin full access" ON "public"."student_profiles" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Student profiles: own full access" ON "public"."student_profiles" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Tutor profiles: admin full access" ON "public"."tutor_profiles" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Tutor profiles: own full access" ON "public"."tutor_profiles" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Tutor profiles: public read active" ON "public"."tutor_profiles" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can create their own posts" ON "public"."feed_posts" FOR INSERT TO "authenticated" WITH CHECK (("author_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can follow as themselves" ON "public"."course_follows" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can like as themselves" ON "public"."feed_likes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can read their own follows" ON "public"."course_follows" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can unfollow their own follows" ON "public"."course_follows" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can unlike their own likes" ON "public"."feed_likes" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update their own posts" ON "public"."feed_posts" FOR UPDATE TO "authenticated" USING (("author_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users: admin full access" ON "public"."users" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Users: own record full access" ON "public"."users" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users: public read non-sensitive fields" ON "public"."users" FOR SELECT USING (("suspended_at" IS NULL));



CREATE POLICY "Verifications: admin manages" ON "public"."tutor_verifications" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Verifications: tutor reads own" ON "public"."tutor_verifications" FOR SELECT USING ((("tutor_id" IN ( SELECT "tutor_profiles"."id"
   FROM "public"."tutor_profiles"
  WHERE ("tutor_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "Verifications: tutor submits own" ON "public"."tutor_verifications" FOR INSERT WITH CHECK (("tutor_id" IN ( SELECT "tutor_profiles"."id"
   FROM "public"."tutor_profiles"
  WHERE ("tutor_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."Waitlist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Warnings: admin manages" ON "public"."user_warnings" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Warnings: user reads own" ON "public"."user_warnings" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ce_select_authenticated" ON "public"."credential_endorsements" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."classroom_attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classroom_attendance_read" ON "public"."classroom_attendance" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE (("s"."id" = "classroom_attendance"."session_id") AND ((( SELECT "auth"."uid"() AS "uid") = "s"."tutor_id") OR (( SELECT "auth"."uid"() AS "uid") = "s"."student_id")))))));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert_participant" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK ((("participant_1" = ( SELECT "auth"."uid"() AS "uid")) OR ("participant_2" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "conversations_select_participant" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((("participant_1" = ( SELECT "auth"."uid"() AS "uid")) OR ("participant_2" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "conversations_update_participant" ON "public"."conversations" FOR UPDATE TO "authenticated" USING ((("participant_1" = ( SELECT "auth"."uid"() AS "uid")) OR ("participant_2" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."course_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credential_endorsements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ct_select_own" ON "public"."credit_transactions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."error_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_session_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_sessions_delete_own_or_admin" ON "public"."group_sessions" FOR DELETE TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "group_sessions_insert_as_tutor" ON "public"."group_sessions" FOR INSERT TO "authenticated" WITH CHECK (("tutor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "group_sessions_select_authenticated" ON "public"."group_sessions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "group_sessions_update_own_or_admin" ON "public"."group_sessions" FOR UPDATE TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "gsp_insert_as_student" ON "public"."group_session_participants" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "gsp_select_own_tutor_or_admin" ON "public"."group_session_participants" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."group_sessions" "gs"
  WHERE (("gs"."id" = "group_session_participants"."group_session_id") AND ("gs"."tutor_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "gsp_update_own_or_admin" ON "public"."group_session_participants" FOR UPDATE TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."job_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lesson_feedback_admin_read" ON "public"."lesson_feedback" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert_as_sender" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ((("c"."participant_1" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."participant_2" = "messages"."receiver_id")) OR (("c"."participant_2" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."participant_1" = "messages"."receiver_id"))))))));



CREATE POLICY "messages_select_participant" ON "public"."messages" FOR SELECT TO "authenticated" USING ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("receiver_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "messages_update_participant" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("receiver_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("receiver_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert_authenticated" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_notify"("user_id") AND (("link" IS NULL) OR ("link" = ''::"text") OR ("link" ~ '^[A-Za-z0-9_-]+\.html([?#][A-Za-z0-9_=&%.-]*)?$'::"text")) AND ("length"(COALESCE("title", ''::"text")) <= 200) AND ("length"(COALESCE("body", ''::"text")) <= 1000)));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reactions_insert_own" ON "public"."message_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_reactions"."message_id") AND (("m"."sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("m"."receiver_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "reactions_select_participant" ON "public"."message_reactions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_reactions"."message_id") AND (("m"."sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("m"."receiver_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "reactions_update_own" ON "public"."message_reactions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referrals_insert_as_referrer" ON "public"."referrals" FOR INSERT TO "authenticated" WITH CHECK (("referrer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "referrals_select_own" ON "public"."referrals" FOR SELECT TO "authenticated" USING ((("referrer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("invitee_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "referrals_update_admin_only" ON "public"."referrals" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."reschedule_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reschedule_requests_select_participants" ON "public"."reschedule_requests" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."sessions" "s"
  WHERE (("s"."id" = "reschedule_requests"."session_id") AND (("s"."student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("s"."tutor_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_delete_admin_only" ON "public"."reviews" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "reviews_insert" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tutor_id" <> ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_review"("tutor_id")));



CREATE POLICY "reviews_insert_as_student" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tutor_id" <> ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_review"("tutor_id")));



CREATE POLICY "reviews_read_all" ON "public"."reviews" FOR SELECT USING (true);



CREATE POLICY "reviews_select_public" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "reviews_update_own_or_admin" ON "public"."reviews" FOR UPDATE TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."saved_students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_tutors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions_delete_admin_only" ON "public"."sessions" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "sessions_insert_as_student" ON "public"."sessions" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "sessions_select_own" ON "public"."sessions" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "sessions_update_own" ON "public"."sessions" FOR UPDATE TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."site_health_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_insert" ON "public"."student_profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."student_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_profiles_delete_admin_only" ON "public"."student_profiles" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "student_profiles_insert_own_or_signup" ON "public"."student_profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "student_profiles_update_own_or_admin" ON "public"."student_profiles" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "student_select" ON "public"."student_profiles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "student_update" ON "public"."student_profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."subject_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subject_requests_delete_own_or_admin" ON "public"."subject_requests" FOR DELETE TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "subject_requests_insert_as_student" ON "public"."subject_requests" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "subject_requests_select_authenticated" ON "public"."subject_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "subject_requests_update_owner_or_accepting_tutor" ON "public"."subject_requests" FOR UPDATE TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("status" = 'open'::"text") OR ( SELECT "public"."is_admin"() AS "is_admin"))) WITH CHECK ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("accepted_tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "tbs_delete_own_or_admin" ON "public"."tutor_blocked_slots" FOR DELETE TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "tbs_insert_own" ON "public"."tutor_blocked_slots" FOR INSERT TO "authenticated" WITH CHECK (("tutor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tbs_select_public" ON "public"."tutor_blocked_slots" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "tbs_update_own_or_admin" ON "public"."tutor_blocked_slots" FOR UPDATE TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "tc_delete_own_or_admin" ON "public"."tutor_courses" FOR DELETE TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "tc_insert_own_or_signup" ON "public"."tutor_courses" FOR INSERT WITH CHECK ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."tutor_profiles"
  WHERE ("tutor_profiles"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "tc_select_public" ON "public"."tutor_courses" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "tc_update_own_or_admin" ON "public"."tutor_courses" FOR UPDATE TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."tutor_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tutor_blocked_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tutor_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tutor_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tutor_profiles_delete_admin_only" ON "public"."tutor_profiles" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "tutor_profiles_insert_own_or_signup" ON "public"."tutor_profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tutor_profiles_select_public" ON "public"."tutor_profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "tutor_profiles_update_own_or_admin" ON "public"."tutor_profiles" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."tutor_university_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tutor_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."university_domain_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."university_domains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "university_domains_read" ON "public"."university_domains" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."user_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_warnings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_delete_admin_only" ON "public"."users" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "users_insert" ON "public"."users" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "users_insert_own_or_anon_signup" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users_select" ON "public"."users" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "users_select_authenticated" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "users_update" ON "public"."users" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "users_update_own_or_admin" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."feed_posts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."feed_replies";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sessions";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."_has_tutor_profile"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_has_tutor_profile"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_has_tutor_profile"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_is_plain_end_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a0_compute_session_times"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_block_contact_info"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_group_sessions"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_gsp"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_messages"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_notifications"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_referrals"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_reviews"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_sessions"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_subject_requests"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_tutor_profiles"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."a_guard_users"() FROM PUBLIC;



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("full_name") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("cover_url") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("roles") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("timezone") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("language") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("bio") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("country") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("city") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("website_url") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("linkedin_url") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("github_url") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("email_verified") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("university_email_verified") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("suspended_at") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("last_seen_at") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("gender") ON TABLE "public"."users" TO "authenticated";



GRANT SELECT("role") ON TABLE "public"."users" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_users"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."b_check_message_extras"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."can_notify"("p_recipient" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_notify"("p_recipient" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_review"("p_tutor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_review"("p_tutor" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."classroom_heartbeat"("p_session_id" "uuid", "p_connected" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_heartbeat"("p_session_id" "uuid", "p_connected" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."classroom_leave"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_leave"("p_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_account"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_tutor_private"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_tutor_private"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_session_meeting_link"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_session_meeting_link"("p_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_setting"("setting_key" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_setting"("setting_key" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_setting_bool"("setting_key" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_setting_bool"("setting_key" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_setting_int"("setting_key" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_setting_int"("setting_key" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."increment_student_earnings"("student_user_id" "uuid", "amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_student_earnings"("student_user_id" "uuid", "amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_tutor_earnings"("tutor_user_id" "uuid", "amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_tutor_earnings"("tutor_user_id" "uuid", "amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."local_to_utc"("p_date" "date", "p_time" time without time zone, "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."local_to_utc"("p_date" "date", "p_time" time without time zone, "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reply_to_review"("p_review_id" "uuid", "p_reply" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reply_to_review"("p_review_id" "uuid", "p_reply" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sanitize_notification_text"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."send_session_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_session_reminders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_my_meeting_link"("p_link" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_meeting_link"("p_link" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_reaction_conversation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."submit_lesson_review"("p_session_id" "uuid", "p_rating" integer, "p_comment" "text", "p_tags" "text"[], "p_private_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_lesson_review"("p_session_id" "uuid", "p_rating" integer, "p_comment" "text", "p_tags" "text"[], "p_private_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sync_feed_like_count"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."verify_cron_secret"("p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_cron_secret"("p_secret" "text") TO "service_role";
























GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."Waitlist" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."Waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."Waitlist" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."Waitlist_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."Waitlist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Waitlist_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcements" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_logs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."business_profiles" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."business_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."business_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."classroom_attendance" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."classroom_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_follows" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."course_follows" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credential_endorsements" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credential_endorsements" TO "authenticated";
GRANT ALL ON TABLE "public"."credential_endorsements" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credentials" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."credentials" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credit_transactions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_transactions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."disputes" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."disputes" TO "service_role";



GRANT ALL ON TABLE "public"."error_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."feed_likes" TO "anon";
GRANT ALL ON TABLE "public"."feed_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_likes" TO "service_role";



GRANT ALL ON TABLE "public"."feed_posts" TO "anon";
GRANT ALL ON TABLE "public"."feed_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_posts" TO "service_role";



GRANT ALL ON TABLE "public"."feed_replies" TO "anon";
GRANT ALL ON TABLE "public"."feed_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_replies" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."group_session_participants" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."group_session_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."group_session_participants" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."group_sessions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."group_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."group_sessions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."group_session_seats" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."group_session_seats" TO "authenticated";
GRANT ALL ON TABLE "public"."group_session_seats" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."job_applications" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."job_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."job_applications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."jobs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lesson_feedback" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lesson_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_feedback" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payout_requests" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payout_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."platform_settings" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."platform_settings_map" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."platform_settings_map" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings_map" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_profiles" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."tutor_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("id") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("user_id") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("bio") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("bio") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("subjects") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("subjects") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("teaching_levels") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("teaching_levels") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("hourly_rate") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("hourly_rate") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("currency") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("currency") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("languages") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("languages") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("format") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("format") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("location") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("location") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("teaching_style") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("teaching_style") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("materials_url") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("video_link") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("video_link") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("rating_avg") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("rating_avg") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("review_count") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("review_count") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("sessions_count") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("sessions_count") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("response_rate") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("completion_rate") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("no_show_count") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("university_verified_at") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("university_verified_at") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("grade_verified_at") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("grade_verified_at") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("certified_at") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("certified_at") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("top_rated_at") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("top_rated_at") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("next_available") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("next_available") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("is_active") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("is_active") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("session_length") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("session_length") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("availability") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("availability") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("preferred_time") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("preferred_time") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("teaching_format") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("teaching_format") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("country") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("country") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("language") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("language") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("gender") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("certificates") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("certificates") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("degree_level") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("degree_level") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("major") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("major") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("overall_grade") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("overall_grade") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("max_students") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("max_students") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("avatar_url") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("study_year") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("study_year") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("cover_url") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("cover_url") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("preferred_times") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("preferred_times") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT("verified_university") ON TABLE "public"."tutor_profiles" TO "anon";
GRANT SELECT("verified_university") ON TABLE "public"."tutor_profiles" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_tutor_subject_stats" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_tutor_subject_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."public_tutor_subject_stats" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_tutors" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_tutors" TO "authenticated";
GRANT ALL ON TABLE "public"."public_tutors" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."referrals" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reschedule_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."reschedule_requests" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."saved_students" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."saved_students" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_students" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."saved_tutors" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."saved_tutors" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_tutors" TO "service_role";



GRANT ALL ON TABLE "public"."site_health_snapshots" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."site_health_snapshots_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."site_health_snapshots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."site_health_snapshots_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."student_profiles" TO "anon";
GRANT ALL ON TABLE "public"."student_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."student_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."subject_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."subject_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_availability" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_availability" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_blocked_slots" TO "anon";
GRANT ALL ON TABLE "public"."tutor_blocked_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_blocked_slots" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tutor_courses" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."tutor_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_courses" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_listing" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_listing" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_listing" TO "service_role";



GRANT ALL ON TABLE "public"."tutor_university_verifications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_verifications" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tutor_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."university_domain_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."university_domains" TO "anon";
GRANT REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."university_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."university_domains" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_reports" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."user_reports" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_warnings" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_warnings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_warnings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































