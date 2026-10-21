-- UniSkilled — database performance for growth (no change to who can see or edit what)
--
-- 1. Indexes on the 42 foreign keys that had none. Without them, lookups such as
--    "all messages from this sender" or "all reviews by this student" scan the whole table.
--    Purely additive: nothing is read or written differently.
--
-- 2. Access rules (RLS policies) that call auth.uid() or is_admin() now evaluate them once per
--    query instead of once per row, by wrapping them in a sub-select. This is the standard fix
--    from Supabase's performance advisor ("auth_rls_initplan"). The rules themselves are
--    identical, so security is unchanged — proven by tests/db/security_tests.sql before and after.
--
-- Deliberately NOT changed (reviewed 2026-10-21):
--  • Views public_tutors, public_tutor_subject_stats, group_session_seats stay SECURITY DEFINER on
--    purpose: they expose only public tutor columns to signed-out visitors while the base tables
--    stay locked. Switching them to security_invoker would break Find Tutors and tutor profiles.
--  • is_admin() / has_role() stay executable by anon: they only check auth.uid() (always false for a
--    signed-out visitor) and access rules evaluated for anon call them.
--  • error_reviews, site_health_snapshots, tutor_university_verifications,
--    university_domain_requests: RLS on with no policies = server-only tables (service role). Intended.

-- ── 1. Foreign-key indexes ──
CREATE INDEX IF NOT EXISTS idx_fk_announcements_sent_by_fkey ON public.announcements (sent_by);
CREATE INDEX IF NOT EXISTS idx_fk_business_profiles_verified_by_fkey ON public.business_profiles (verified_by);
CREATE INDEX IF NOT EXISTS idx_fk_classroom_attendance_user_id_fkey ON public.classroom_attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_credential_endorsements_business_id_fkey ON public.credential_endorsements (business_id);
CREATE INDEX IF NOT EXISTS idx_fk_credential_endorsements_credential_id_fkey ON public.credential_endorsements (credential_id);
CREATE INDEX IF NOT EXISTS idx_fk_credentials_created_by_admin_fkey ON public.credentials (created_by_admin);
CREATE INDEX IF NOT EXISTS idx_fk_credentials_revoked_by_fkey ON public.credentials (revoked_by);
CREATE INDEX IF NOT EXISTS idx_fk_credit_transactions_reference_referral_id_fkey ON public.credit_transactions (reference_referral_id);
CREATE INDEX IF NOT EXISTS idx_fk_credit_transactions_reference_session_id_fkey ON public.credit_transactions (reference_session_id);
CREATE INDEX IF NOT EXISTS idx_fk_disputes_admin_id_fkey ON public.disputes (admin_id);
CREATE INDEX IF NOT EXISTS idx_fk_disputes_against_fkey ON public.disputes (against);
CREATE INDEX IF NOT EXISTS idx_fk_disputes_order_id_fkey ON public.disputes (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_feed_likes_user_id_fkey ON public.feed_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_feed_posts_author_id_fkey ON public.feed_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_fk_feed_replies_author_id_fkey ON public.feed_replies (author_id);
CREATE INDEX IF NOT EXISTS idx_fk_group_session_participants_student_id_fkey ON public.group_session_participants (student_id);
CREATE INDEX IF NOT EXISTS idx_fk_group_sessions_tutor_id_fkey ON public.group_sessions (tutor_id);
CREATE INDEX IF NOT EXISTS idx_fk_lesson_feedback_session_id_fkey ON public.lesson_feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_fk_lesson_feedback_user_id_fkey ON public.lesson_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_message_reactions_user_id_fkey ON public.message_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_messages_sender_id_fkey ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_fk_orders_job_id_fkey ON public.orders (job_id);
CREATE INDEX IF NOT EXISTS idx_fk_payments_order_id_fkey ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_payments_reviewed_by_fkey ON public.payments (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_payout_requests_user_id_fkey ON public.payout_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_platform_settings_updated_by_fkey ON public.platform_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_fk_referrals_invitee_discount_applied_session_id_fkey ON public.referrals (invitee_discount_applied_session_id);
CREATE INDEX IF NOT EXISTS idx_fk_referrals_qualifying_session_id_fkey ON public.referrals (qualifying_session_id);
CREATE INDEX IF NOT EXISTS idx_fk_reviews_student_id_fkey ON public.reviews (student_id);
CREATE INDEX IF NOT EXISTS idx_fk_saved_students_student_id_fkey ON public.saved_students (student_id);
CREATE INDEX IF NOT EXISTS idx_fk_saved_tutors_tutor_id_fkey ON public.saved_tutors (tutor_id);
CREATE INDEX IF NOT EXISTS idx_fk_sessions_payment_id_fkey ON public.sessions (payment_id);
CREATE INDEX IF NOT EXISTS idx_fk_subject_requests_accepted_tutor_id_fkey ON public.subject_requests (accepted_tutor_id);
CREATE INDEX IF NOT EXISTS idx_fk_subject_requests_student_id_fkey ON public.subject_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_fk_tutor_verifications_reviewed_by_fkey ON public.tutor_verifications (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_tutor_verifications_tutor_id_fkey ON public.tutor_verifications (tutor_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_reports_reported_by_fkey ON public.user_reports (reported_by);
CREATE INDEX IF NOT EXISTS idx_fk_user_reports_reported_user_fkey ON public.user_reports (reported_user);
CREATE INDEX IF NOT EXISTS idx_fk_user_reports_reviewed_by_fkey ON public.user_reports (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_user_warnings_issued_by_fkey ON public.user_warnings (issued_by);
CREATE INDEX IF NOT EXISTS idx_fk_user_warnings_user_id_fkey ON public.user_warnings (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_users_suspended_by_fkey ON public.users (suspended_by);

-- ── 2. Evaluate auth.uid() / is_admin() once per query in every access rule ──
-- Safe to re-run: calls already wrapped (stored by Postgres as "( SELECT auth.uid() AS uid)")
-- are protected with a placeholder first, so they are never wrapped twice.
DO $mig$
DECLARE
  p record;
  nq text;
  nw text;
  stmt text;
BEGIN
  FOR p IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(auth\.uid\(\)|\mis_admin\(\))'
  LOOP
    nq := p.qual;
    nw := p.with_check;
    IF nq IS NOT NULL THEN
      nq := replace(replace(nq, 'SELECT auth.uid()', 'SELECT §UID§'), 'SELECT is_admin()', 'SELECT §ADM§');
      nq := regexp_replace(nq, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      nq := regexp_replace(nq, '\mis_admin\(\)', '(select is_admin())', 'g');
      nq := replace(replace(nq, '§UID§', 'auth.uid()'), '§ADM§', 'is_admin()');
    END IF;
    IF nw IS NOT NULL THEN
      nw := replace(replace(nw, 'SELECT auth.uid()', 'SELECT §UID§'), 'SELECT is_admin()', 'SELECT §ADM§');
      nw := regexp_replace(nw, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      nw := regexp_replace(nw, '\mis_admin\(\)', '(select is_admin())', 'g');
      nw := replace(replace(nw, '§UID§', 'auth.uid()'), '§ADM§', 'is_admin()');
    END IF;
    IF nq IS NOT DISTINCT FROM p.qual AND nw IS NOT DISTINCT FROM p.with_check THEN
      CONTINUE; -- already optimised
    END IF;
    stmt := format('ALTER POLICY %I ON public.%I', p.policyname, p.tablename)
         || CASE WHEN nq IS NOT NULL THEN format(' USING (%s)', nq) ELSE '' END
         || CASE WHEN nw IS NOT NULL THEN format(' WITH CHECK (%s)', nw) ELSE '' END;
    EXECUTE stmt;
  END LOOP;
END
$mig$;
