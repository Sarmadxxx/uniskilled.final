-- Exported from the live database migration history (20260823092016 create_feed_system).

CREATE TABLE feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_role text NOT NULL DEFAULT 'student',
  content text NOT NULL,
  course_code text,
  subject text,
  reply_count int NOT NULL DEFAULT 0,
  like_count int NOT NULL DEFAULT 0,
  has_tutor_answer boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE feed_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  is_tutor_answer boolean NOT NULL DEFAULT false,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE feed_likes (
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_feed_posts_created ON feed_posts(created_at DESC);
CREATE INDEX idx_feed_posts_course ON feed_posts(lower(course_code));
CREATE INDEX idx_feed_replies_post ON feed_replies(post_id);

GRANT ALL ON feed_posts, feed_replies, feed_likes TO service_role, authenticated, anon;
