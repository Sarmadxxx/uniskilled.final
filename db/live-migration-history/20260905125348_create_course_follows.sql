-- Exported from the live database migration history (20260905125348 create_course_follows).

CREATE TABLE course_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, course_code)
);

CREATE INDEX idx_course_follows_user ON course_follows(user_id);
CREATE INDEX idx_course_follows_code ON course_follows(lower(course_code));

ALTER TABLE course_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own follows" ON course_follows FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can follow as themselves" ON course_follows FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unfollow their own follows" ON course_follows FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON course_follows TO authenticated;
