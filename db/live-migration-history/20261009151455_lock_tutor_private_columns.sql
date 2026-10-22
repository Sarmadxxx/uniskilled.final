-- Exported from the live database migration history (20261009151455 lock_tutor_private_columns).

-- Signed-in users could read every tutor's payout details and meeting link.
-- Owners read their own via get_my_tutor_private(); students get a session's
-- link via get_session_meeting_link(). Edge Functions use service_role (unaffected).
revoke select on public.tutor_profiles from authenticated;
grant select (id,user_id,bio,subjects,teaching_levels,hourly_rate,currency,languages,format,location,teaching_style,materials_url,video_link,rating_avg,review_count,sessions_count,response_rate,completion_rate,no_show_count,university_verified_at,grade_verified_at,certified_at,top_rated_at,next_available,is_active,created_at,updated_at,session_length,availability,preferred_time,teaching_format,country,language,gender,certificates,degree_level,major,overall_grade,max_students,avatar_url,study_year,cover_url,preferred_times,verified_university)
  on public.tutor_profiles to authenticated;
comment on table public.tutor_profiles is 'SELECT for authenticated is column-level: new public columns must be granted explicitly. Private: meeting_link, paypal_email, payout_method, stripe_account_id, stripe_account_status, total_earnings.';
