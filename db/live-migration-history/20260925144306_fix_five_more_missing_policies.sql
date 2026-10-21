-- Exported from the live database migration history (20260925144306 fix_five_more_missing_policies).

-- group_session_participants: enrollment records for group sessions — broad
-- read (rosters/counts are meant to be visible), writes restricted to the
-- student's own row (payment-status updates happen server-side via
-- service_role in edge functions, which bypasses RLS entirely).
CREATE POLICY "gsp_select_authenticated" ON group_session_participants FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "gsp_insert_as_student" ON group_session_participants FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "gsp_update_own_or_admin" ON group_session_participants FOR UPDATE TO authenticated USING (student_id = auth.uid() OR is_admin());

-- tutor_blocked_slots: a tutor's blocked dates need to be publicly visible
-- (anyone booking needs to see them), only the owning tutor can set them.
CREATE POLICY "tbs_select_public" ON tutor_blocked_slots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tbs_insert_own" ON tutor_blocked_slots FOR INSERT TO authenticated WITH CHECK (tutor_id = auth.uid());
CREATE POLICY "tbs_update_own_or_admin" ON tutor_blocked_slots FOR UPDATE TO authenticated USING (tutor_id = auth.uid() OR is_admin());
CREATE POLICY "tbs_delete_own_or_admin" ON tutor_blocked_slots FOR DELETE TO authenticated USING (tutor_id = auth.uid() OR is_admin());

-- tutor_courses: needs to stay publicly browsable (exact-course search on
-- find-tutors.html) and anon keeps INSERT since onboarding writes this
-- before email confirmation, same as tutor_profiles.
CREATE POLICY "tc_select_public" ON tutor_courses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tc_insert_own_or_signup" ON tutor_courses FOR INSERT TO authenticated, anon WITH CHECK (tutor_id = auth.uid() OR auth.uid() IS NULL);
CREATE POLICY "tc_update_own_or_admin" ON tutor_courses FOR UPDATE TO authenticated USING (tutor_id = auth.uid() OR is_admin());
CREATE POLICY "tc_delete_own_or_admin" ON tutor_courses FOR DELETE TO authenticated USING (tutor_id = auth.uid() OR is_admin());

-- credit_transactions: real financial data — strictly own-user only.
-- No client-side INSERT policy: every real write already happens via
-- service_role in edge functions, which bypasses RLS entirely.
CREATE POLICY "ct_select_own" ON credit_transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());

-- credential_endorsements: part of the not-yet-live business/freelance
-- infrastructure — conservative read-only default until that feature
-- actually ships.
CREATE POLICY "ce_select_authenticated" ON credential_endorsements FOR SELECT TO authenticated USING (true);

GRANT ALL ON group_session_participants, tutor_blocked_slots, tutor_courses, credit_transactions, credential_endorsements TO service_role;
