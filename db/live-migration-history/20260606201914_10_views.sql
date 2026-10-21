-- Exported from the live database migration history (20260606201914 10_views).

-- Public tutor listing view (what tutoring.html shows)
CREATE OR REPLACE VIEW public.tutor_listing AS
SELECT
  tp.id,
  tp.user_id,
  u.full_name,
  u.avatar_url,
  u.city,
  u.country,
  u.timezone,
  tp.bio,
  tp.subjects,
  tp.teaching_levels,
  tp.hourly_rate,
  tp.currency,
  tp.languages,
  tp.format,
  tp.rating_avg,
  tp.review_count,
  tp.sessions_count,
  tp.response_rate,
  tp.next_available,
  tp.university_verified_at IS NOT NULL AS university_verified,
  tp.grade_verified_at IS NOT NULL AS grade_verified,
  tp.certified_at IS NOT NULL AS uniskilled_certified,
  tp.top_rated_at IS NOT NULL AS top_rated
FROM public.tutor_profiles tp
JOIN public.users u ON u.id = tp.user_id
WHERE tp.is_active = true AND u.suspended_at IS NULL;

-- Admin overview stats view
CREATE OR REPLACE VIEW public.admin_overview AS
SELECT
  (SELECT COUNT(*) FROM public.users WHERE 'student'::user_role = ANY(roles)) AS total_students,
  (SELECT COUNT(*) FROM public.users WHERE 'tutor'::user_role = ANY(roles)) AS total_tutors,
  (SELECT COUNT(*) FROM public.users WHERE 'business'::user_role = ANY(roles)) AS total_businesses,
  (SELECT COUNT(*) FROM public.users WHERE suspended_at IS NOT NULL) AS suspended_users,
  (SELECT COUNT(*) FROM public.sessions WHERE status = 'confirmed') AS active_sessions,
  (SELECT COUNT(*) FROM public.orders WHERE status IN ('active','delivered')) AS active_orders,
  (SELECT COUNT(*) FROM public.disputes WHERE status = 'open') AS open_disputes,
  (SELECT COUNT(*) FROM public.disputes WHERE status = 'under_review') AS disputes_under_review,
  (SELECT COUNT(*) FROM public.tutor_verifications WHERE status = 'pending') AS pending_verifications,
  (SELECT COUNT(*) FROM public.payments WHERE flagged = true AND reviewed_at IS NULL) AS flagged_payments,
  (SELECT COUNT(*) FROM public.user_reports WHERE status = 'pending') AS pending_reports,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE status = 'succeeded'
   AND created_at >= date_trunc('month', NOW())) AS gmv_this_month,
  (SELECT COALESCE(SUM(platform_fee), 0) FROM public.payments WHERE status = 'succeeded'
   AND created_at >= date_trunc('month', NOW())) AS revenue_this_month;

-- Tutor earnings summary
CREATE OR REPLACE VIEW public.tutor_earnings AS
SELECT
  tp.user_id,
  COALESCE(SUM(s.tutor_payout) FILTER (WHERE s.status = 'completed'), 0) AS total_earned,
  COALESCE(SUM(s.tutor_payout) FILTER (
    WHERE s.status = 'completed'
    AND s.completed_at >= date_trunc('month', NOW())
  ), 0) AS earned_this_month,
  COALESCE(SUM(s.session_fee) FILTER (WHERE s.status = 'confirmed'), 0) AS pending_payout,
  COUNT(*) FILTER (WHERE s.status = 'completed') AS completed_sessions,
  COUNT(*) FILTER (WHERE s.status = 'confirmed') AS upcoming_sessions
FROM public.tutor_profiles tp
LEFT JOIN public.sessions s ON s.tutor_id = tp.id
GROUP BY tp.user_id;

-- Platform settings as key-value map for easy API response
CREATE OR REPLACE VIEW public.platform_settings_map AS
SELECT
  jsonb_object_agg(key, value) AS settings
FROM public.platform_settings;
