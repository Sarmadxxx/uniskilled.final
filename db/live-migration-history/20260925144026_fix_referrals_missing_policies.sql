-- Exported from the live database migration history (20260925144026 fix_referrals_missing_policies).

CREATE POLICY "referrals_select_own" ON referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR invitee_id = auth.uid() OR is_admin());

CREATE POLICY "referrals_insert_as_referrer" ON referrals FOR INSERT TO authenticated
  WITH CHECK (referrer_id = auth.uid());

CREATE POLICY "referrals_update_admin_only" ON referrals FOR UPDATE TO authenticated
  USING (is_admin());

GRANT ALL ON referrals TO service_role;
