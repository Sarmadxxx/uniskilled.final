-- Exported from the live database migration history (20261008215103 remove_anonymous_signup_inserts).

-- Signup rows are now created server-side by handle_new_user(); the browser no longer needs
-- to insert anything while logged out. Signed-in users may still insert only their own rows.
ALTER POLICY users_insert_own_or_anon_signup ON public.users
  TO authenticated WITH CHECK (id = auth.uid());
ALTER POLICY student_profiles_insert_own_or_signup ON public.student_profiles
  TO authenticated WITH CHECK (user_id = auth.uid());
ALTER POLICY tutor_profiles_insert_own_or_signup ON public.tutor_profiles
  TO authenticated WITH CHECK (user_id = auth.uid());
ALTER POLICY tc_insert_own_or_signup ON public.tutor_courses
  TO authenticated WITH CHECK (tutor_id = auth.uid());

REVOKE INSERT ON public.users, public.student_profiles, public.tutor_profiles, public.tutor_courses FROM anon;
