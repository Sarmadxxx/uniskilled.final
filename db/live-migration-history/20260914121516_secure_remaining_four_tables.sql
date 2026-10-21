-- Exported from the live database migration history (20260914121516 secure_remaining_four_tables).

-- tutor_profiles: SELECT stays public (browsing before signup is intentional),
-- anon keeps INSERT (onboarding writes before email confirmation), but
-- anon can no longer modify or delete ANY tutor's profile — only the owner.
ALTER TABLE tutor_profiles ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON tutor_profiles FROM anon;

CREATE POLICY "tutor_profiles_select_public" ON tutor_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tutor_profiles_insert_own_or_signup" ON tutor_profiles FOR INSERT TO authenticated, anon WITH CHECK (user_id = auth.uid() OR auth.uid() IS NULL);
CREATE POLICY "tutor_profiles_update_own_or_admin" ON tutor_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "tutor_profiles_delete_admin_only" ON tutor_profiles FOR DELETE TO authenticated USING (is_admin());

-- student_profiles: not publicly browsed like tutors — restrict SELECT to
-- logged-in users; anon keeps INSERT only (onboarding).
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, UPDATE, DELETE ON student_profiles FROM anon;

CREATE POLICY "student_profiles_select_authenticated" ON student_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "student_profiles_insert_own_or_signup" ON student_profiles FOR INSERT TO authenticated, anon WITH CHECK (user_id = auth.uid() OR auth.uid() IS NULL);
CREATE POLICY "student_profiles_update_own_or_admin" ON student_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "student_profiles_delete_admin_only" ON student_profiles FOR DELETE TO authenticated USING (is_admin());

-- reviews: publicly visible by design (shown on tutor profiles pre-signup),
-- but only the actual reviewer can create/edit their own review.
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON reviews FROM anon;

CREATE POLICY "reviews_select_public" ON reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "reviews_insert_as_student" ON reviews FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "reviews_update_own_or_admin" ON reviews FOR UPDATE TO authenticated USING (student_id = auth.uid() OR is_admin());
CREATE POLICY "reviews_delete_admin_only" ON reviews FOR DELETE TO authenticated USING (is_admin());

-- subject_requests: tutors browse all open requests, students see demand
-- from others — needs broad read for logged-in users, but no anon at all
-- (created post-login, never during onboarding).
ALTER TABLE subject_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subject_requests FROM anon;

CREATE POLICY "subject_requests_select_authenticated" ON subject_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "subject_requests_insert_as_student" ON subject_requests FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "subject_requests_update_authenticated" ON subject_requests FOR UPDATE TO authenticated USING (true);
CREATE POLICY "subject_requests_delete_own_or_admin" ON subject_requests FOR DELETE TO authenticated USING (student_id = auth.uid() OR is_admin());

GRANT ALL ON tutor_profiles, student_profiles, reviews, subject_requests TO service_role;
