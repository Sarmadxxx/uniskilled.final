-- Exported from the live database migration history (20260606201747 07_indexes).

-- Users
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_roles ON public.users USING GIN(roles);
CREATE INDEX idx_users_suspended ON public.users(suspended_at) WHERE suspended_at IS NOT NULL;

-- Tutor profiles
CREATE INDEX idx_tutor_subjects ON public.tutor_profiles USING GIN(subjects);
CREATE INDEX idx_tutor_rating ON public.tutor_profiles(rating_avg DESC);
CREATE INDEX idx_tutor_active ON public.tutor_profiles(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_tutor_user ON public.tutor_profiles(user_id);

-- Student profiles
CREATE INDEX idx_student_skills ON public.student_profiles USING GIN(skills);
CREATE INDEX idx_student_user ON public.student_profiles(user_id);

-- Business profiles
CREATE INDEX idx_business_user ON public.business_profiles(user_id);
CREATE INDEX idx_business_plan ON public.business_profiles(plan);
CREATE INDEX idx_business_verified ON public.business_profiles(verified_at) WHERE verified_at IS NOT NULL;

-- Tutor availability
CREATE INDEX idx_availability_tutor ON public.tutor_availability(tutor_id);
CREATE INDEX idx_availability_day ON public.tutor_availability(day_of_week);

-- Sessions
CREATE INDEX idx_sessions_tutor ON public.sessions(tutor_id);
CREATE INDEX idx_sessions_student ON public.sessions(student_id);
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_scheduled ON public.sessions(scheduled_at_utc);
CREATE INDEX idx_sessions_stripe ON public.sessions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Jobs
CREATE INDEX idx_jobs_business ON public.jobs(business_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_skills ON public.jobs USING GIN(skills_required);
CREATE INDEX idx_jobs_created ON public.jobs(created_at DESC);

-- Job applications
CREATE INDEX idx_applications_job ON public.job_applications(job_id);
CREATE INDEX idx_applications_student ON public.job_applications(student_id);
CREATE INDEX idx_applications_score ON public.job_applications(match_score DESC);

-- Orders
CREATE INDEX idx_orders_business ON public.orders(business_id);
CREATE INDEX idx_orders_student ON public.orders(student_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_stripe ON public.orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Messages
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);

-- Conversations
CREATE INDEX idx_conversations_participants ON public.conversations USING GIN(participant_ids);
CREATE INDEX idx_conversations_updated ON public.conversations(last_message_at DESC);

-- Reviews
CREATE INDEX idx_reviews_reviewee ON public.reviews(reviewee_id);
CREATE INDEX idx_reviews_reviewer ON public.reviews(reviewer_id);

-- Notifications
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;

-- Payments
CREATE INDEX idx_payments_payer ON public.payments(payer_id);
CREATE INDEX idx_payments_payee ON public.payments(payee_id);
CREATE INDEX idx_payments_flagged ON public.payments(flagged) WHERE flagged = TRUE;
CREATE INDEX idx_payments_stripe ON public.payments(stripe_payment_intent_id);

-- Disputes
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_opened_by ON public.disputes(opened_by);

-- Audit logs
CREATE INDEX idx_audit_admin ON public.audit_logs(admin_id);
CREATE INDEX idx_audit_target ON public.audit_logs(target_type, target_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);

-- Credentials
CREATE INDEX idx_credentials_user ON public.credentials(user_id);
CREATE INDEX idx_credentials_slug ON public.credentials(public_slug);
