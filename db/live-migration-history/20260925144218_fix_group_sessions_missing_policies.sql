-- Exported from the live database migration history (20260925144218 fix_group_sessions_missing_policies).

-- Broad SELECT (like subject_requests) — students need to discover and browse
-- open group sessions to join them, not just the tutor who created it.
CREATE POLICY "group_sessions_select_authenticated" ON group_sessions FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "group_sessions_insert_as_tutor" ON group_sessions FOR INSERT TO authenticated
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "group_sessions_update_own_or_admin" ON group_sessions FOR UPDATE TO authenticated
  USING (tutor_id = auth.uid() OR is_admin());

CREATE POLICY "group_sessions_delete_own_or_admin" ON group_sessions FOR DELETE TO authenticated
  USING (tutor_id = auth.uid() OR is_admin());

GRANT ALL ON group_sessions TO service_role;
