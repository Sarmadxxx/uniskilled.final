-- Exported from the live database migration history (20260823170403 fix_feed_posts_rls_and_complete_schema).

-- feed_posts: anyone logged in can read all posts, and insert their own
CREATE POLICY "Anyone can read feed posts" ON feed_posts FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Users can create their own posts" ON feed_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "Users can update their own posts" ON feed_posts FOR UPDATE TO authenticated USING (author_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON feed_posts TO authenticated, anon;

-- feed_likes: anyone can read, and like/unlike as themselves
CREATE POLICY "Anyone can read likes" ON feed_likes FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Users can like as themselves" ON feed_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unlike their own likes" ON feed_likes FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON feed_likes TO authenticated, anon;

-- feed_answers: verified-tutor-only writes, enforced server-side via edge
-- function (not just RLS) since this is the core trust mechanic of the
-- whole feature — everyone can read, but only the edge function (service
-- role) inserts, after checking the poster is a verified tutor.
CREATE TABLE IF NOT EXISTS feed_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tutor_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE feed_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read answers" ON feed_answers FOR SELECT TO authenticated, anon USING (true);
GRANT SELECT ON feed_answers TO authenticated, anon;
GRANT ALL ON feed_answers TO service_role;

-- feed_comments: any logged-in user can comment as themselves
CREATE TABLE IF NOT EXISTS feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read comments" ON feed_comments FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Users can comment as themselves" ON feed_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
GRANT SELECT, INSERT ON feed_comments TO authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_feed_answers_post ON feed_answers(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post ON feed_comments(post_id);
