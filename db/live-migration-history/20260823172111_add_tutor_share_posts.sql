-- Exported from the live database migration history (20260823172111 add_tutor_share_posts).

ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'question' CHECK (post_type IN ('question', 'share')),
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text;
