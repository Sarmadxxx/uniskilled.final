-- Exported from the live database migration history (20260606201819 08_row_level_security).

-- Enable RLS on every table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_tutors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND 'admin'::user_role = ANY(roles)
    AND suspended_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(check_role user_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND check_role = ANY(roles)
    AND suspended_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── USERS ──
CREATE POLICY "Users: own record full access"
  ON public.users FOR ALL
  USING (id = auth.uid());

CREATE POLICY "Users: public read non-sensitive fields"
  ON public.users FOR SELECT
  USING (suspended_at IS NULL);

CREATE POLICY "Users: admin full access"
  ON public.users FOR ALL
  USING (public.is_admin());

-- ── STUDENT PROFILES ──
CREATE POLICY "Student profiles: own full access"
  ON public.student_profiles FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Student profiles: public read"
  ON public.student_profiles FOR SELECT
  USING (true);

CREATE POLICY "Student profiles: admin full access"
  ON public.student_profiles FOR ALL
  USING (public.is_admin());

-- ── TUTOR PROFILES ──
CREATE POLICY "Tutor profiles: own full access"
  ON public.tutor_profiles FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Tutor profiles: public read active"
  ON public.tutor_profiles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Tutor profiles: admin full access"
  ON public.tutor_profiles FOR ALL
  USING (public.is_admin());

-- ── BUSINESS PROFILES ──
CREATE POLICY "Business profiles: own full access"
  ON public.business_profiles FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Business profiles: public read verified"
  ON public.business_profiles FOR SELECT
  USING (true);

CREATE POLICY "Business profiles: admin full access"
  ON public.business_profiles FOR ALL
  USING (public.is_admin());

-- ── TUTOR AVAILABILITY ──
CREATE POLICY "Availability: tutor manages own"
  ON public.tutor_availability FOR ALL
  USING (tutor_id IN (SELECT id FROM public.tutor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Availability: public read"
  ON public.tutor_availability FOR SELECT
  USING (true);

-- ── TUTOR VERIFICATIONS ──
CREATE POLICY "Verifications: tutor submits own"
  ON public.tutor_verifications FOR INSERT
  WITH CHECK (tutor_id IN (SELECT id FROM public.tutor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Verifications: tutor reads own"
  ON public.tutor_verifications FOR SELECT
  USING (tutor_id IN (SELECT id FROM public.tutor_profiles WHERE user_id = auth.uid())
    OR public.is_admin());

CREATE POLICY "Verifications: admin manages"
  ON public.tutor_verifications FOR ALL
  USING (public.is_admin());

-- ── SESSIONS ──
CREATE POLICY "Sessions: participants access"
  ON public.sessions FOR ALL
  USING (
    student_id = auth.uid() OR
    tutor_id IN (SELECT id FROM public.tutor_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Sessions: admin full access"
  ON public.sessions FOR ALL
  USING (public.is_admin());

-- ── JOBS ──
CREATE POLICY "Jobs: business manages own"
  ON public.jobs FOR ALL
  USING (business_id = auth.uid());

CREATE POLICY "Jobs: public read live"
  ON public.jobs FOR SELECT
  USING (status = 'live');

CREATE POLICY "Jobs: admin full access"
  ON public.jobs FOR ALL
  USING (public.is_admin());

-- ── JOB APPLICATIONS ──
CREATE POLICY "Applications: student manages own"
  ON public.job_applications FOR ALL
  USING (student_id = auth.uid());

CREATE POLICY "Applications: business reads for own jobs"
  ON public.job_applications FOR SELECT
  USING (job_id IN (SELECT id FROM public.jobs WHERE business_id = auth.uid()));

CREATE POLICY "Applications: admin full access"
  ON public.job_applications FOR ALL
  USING (public.is_admin());

-- ── ORDERS ──
CREATE POLICY "Orders: participants access"
  ON public.orders FOR ALL
  USING (business_id = auth.uid() OR student_id = auth.uid());

CREATE POLICY "Orders: admin full access"
  ON public.orders FOR ALL
  USING (public.is_admin());

-- ── CONVERSATIONS ──
CREATE POLICY "Conversations: participants access"
  ON public.conversations FOR ALL
  USING (auth.uid() = ANY(participant_ids));

CREATE POLICY "Conversations: admin full access"
  ON public.conversations FOR ALL
  USING (public.is_admin());

-- ── MESSAGES ──
CREATE POLICY "Messages: participants access"
  ON public.messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE auth.uid() = ANY(participant_ids)
    )
  );

CREATE POLICY "Messages: admin full access"
  ON public.messages FOR ALL
  USING (public.is_admin());

-- ── REVIEWS ──
CREATE POLICY "Reviews: reviewer manages own"
  ON public.reviews FOR ALL
  USING (reviewer_id = auth.uid());

CREATE POLICY "Reviews: public reads non-hidden"
  ON public.reviews FOR SELECT
  USING (hidden_by_admin = false AND is_public = true);

CREATE POLICY "Reviews: admin full access"
  ON public.reviews FOR ALL
  USING (public.is_admin());

-- ── CREDENTIALS ──
CREATE POLICY "Credentials: owner reads own"
  ON public.credentials FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Credentials: public reads active"
  ON public.credentials FOR SELECT
  USING (is_active = true AND revoked_at IS NULL);

CREATE POLICY "Credentials: admin manages"
  ON public.credentials FOR ALL
  USING (public.is_admin());

-- ── DISPUTES ──
CREATE POLICY "Disputes: participants access"
  ON public.disputes FOR ALL
  USING (opened_by = auth.uid() OR against = auth.uid());

CREATE POLICY "Disputes: admin full access"
  ON public.disputes FOR ALL
  USING (public.is_admin());

-- ── NOTIFICATIONS ──
CREATE POLICY "Notifications: own only"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Notifications: admin reads"
  ON public.notifications FOR SELECT
  USING (public.is_admin());

-- ── PAYMENTS ──
CREATE POLICY "Payments: own transactions"
  ON public.payments FOR SELECT
  USING (payer_id = auth.uid() OR payee_id = auth.uid());

CREATE POLICY "Payments: admin full access"
  ON public.payments FOR ALL
  USING (public.is_admin());

-- ── PAYOUT REQUESTS ──
CREATE POLICY "Payouts: own only"
  ON public.payout_requests FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Payouts: admin full access"
  ON public.payout_requests FOR ALL
  USING (public.is_admin());

-- ── PLATFORM SETTINGS ──
CREATE POLICY "Settings: public read"
  ON public.platform_settings FOR SELECT
  USING (true);

CREATE POLICY "Settings: admin write"
  ON public.platform_settings FOR ALL
  USING (public.is_admin());

-- ── AUDIT LOGS ──
CREATE POLICY "Audit: admin only"
  ON public.audit_logs FOR ALL
  USING (public.is_admin());

-- ── ANNOUNCEMENTS ──
CREATE POLICY "Announcements: public read"
  ON public.announcements FOR SELECT
  USING (true);

CREATE POLICY "Announcements: admin manages"
  ON public.announcements FOR ALL
  USING (public.is_admin());

-- ── USER REPORTS ──
CREATE POLICY "Reports: reporter sees own"
  ON public.user_reports FOR SELECT
  USING (reported_by = auth.uid());

CREATE POLICY "Reports: anyone can report"
  ON public.user_reports FOR INSERT
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Reports: admin full access"
  ON public.user_reports FOR ALL
  USING (public.is_admin());

-- ── USER WARNINGS ──
CREATE POLICY "Warnings: user reads own"
  ON public.user_warnings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Warnings: admin manages"
  ON public.user_warnings FOR ALL
  USING (public.is_admin());

-- ── SAVED TUTORS / STUDENTS ──
CREATE POLICY "Saved tutors: student manages own"
  ON public.saved_tutors FOR ALL
  USING (student_id = auth.uid());

CREATE POLICY "Saved students: business manages own"
  ON public.saved_students FOR ALL
  USING (business_id = auth.uid());
