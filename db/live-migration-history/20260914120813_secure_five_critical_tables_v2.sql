-- Exported from the live database migration history (20260914120813 secure_five_critical_tables_v2).

-- ═══ users ═══
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, UPDATE, DELETE ON users FROM anon;

CREATE POLICY "users_select_authenticated" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_insert_own_or_anon_signup" ON users FOR INSERT TO authenticated, anon WITH CHECK (id = auth.uid() OR auth.uid() IS NULL);
CREATE POLICY "users_update_own_or_admin" ON users FOR UPDATE TO authenticated USING (id = auth.uid() OR is_admin());
CREATE POLICY "users_delete_admin_only" ON users FOR DELETE TO authenticated USING (is_admin());

-- ═══ sessions ═══
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sessions FROM anon;

CREATE POLICY "sessions_select_own" ON sessions FOR SELECT TO authenticated USING (student_id = auth.uid() OR tutor_id = auth.uid() OR is_admin());
CREATE POLICY "sessions_insert_as_student" ON sessions FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "sessions_update_own" ON sessions FOR UPDATE TO authenticated USING (student_id = auth.uid() OR tutor_id = auth.uid() OR is_admin());
CREATE POLICY "sessions_delete_admin_only" ON sessions FOR DELETE TO authenticated USING (is_admin());

-- ═══ messages ═══
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON messages FROM anon;

CREATE POLICY "messages_select_participant" ON messages FOR SELECT TO authenticated USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR is_admin());
CREATE POLICY "messages_insert_as_sender" ON messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages_update_participant" ON messages FOR UPDATE TO authenticated USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- ═══ notifications ═══
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notifications FROM anon;

CREATE POLICY "notifications_select_own" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "notifications_insert_authenticated" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ═══ conversations ═══ (real columns: participant_1, participant_2)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON conversations FROM anon;

CREATE POLICY "conversations_select_participant" ON conversations FOR SELECT TO authenticated USING (participant_1 = auth.uid() OR participant_2 = auth.uid() OR is_admin());
CREATE POLICY "conversations_insert_participant" ON conversations FOR INSERT TO authenticated WITH CHECK (participant_1 = auth.uid() OR participant_2 = auth.uid());
CREATE POLICY "conversations_update_participant" ON conversations FOR UPDATE TO authenticated USING (participant_1 = auth.uid() OR participant_2 = auth.uid());

GRANT ALL ON users, sessions, messages, notifications, conversations TO service_role;
