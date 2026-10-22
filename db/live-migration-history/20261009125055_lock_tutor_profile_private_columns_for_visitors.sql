-- Exported from the live database migration history (20261009125055 lock_tutor_profile_private_columns_for_visitors).

-- Signed-out visitors may read only the public columns of tutor_profiles.
-- Private: meeting_link, paypal_email, payout_method, stripe_account_id, stripe_account_status,
-- total_earnings, gender, materials_url, no_show_count, response_rate, completion_rate.
revoke select on public.tutor_profiles from anon;
grant select (
  id, user_id, bio, subjects, teaching_levels, hourly_rate, currency, languages, format, location,
  teaching_style, video_link, rating_avg, review_count, sessions_count,
  university_verified_at, verified_university, grade_verified_at, certified_at, top_rated_at,
  next_available, is_active, created_at, session_length, availability, preferred_time, preferred_times,
  teaching_format, country, language, certificates, degree_level, major, overall_grade, max_students,
  avatar_url, study_year, cover_url
) on public.tutor_profiles to anon;
