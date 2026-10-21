-- Exported from the live database migration history (20260823170515 fix_feed_replies_rls_and_cleanup).

-- feed_replies had the exact same bug as feed_posts: RLS on, zero policies
CREATE POLICY "Anyone can read replies" ON feed_replies FOR SELECT TO authenticated, anon USING (true);
GRANT SELECT ON feed_replies TO authenticated, anon;
GRANT ALL ON feed_replies TO service_role;

-- Clean up the parallel feed_answers/feed_comments tables and function I
-- built before discovering the real, already-live feed_replies design —
-- they're unused by the actual frontend, no point leaving them around.
DROP TABLE IF EXISTS feed_answers;
DROP TABLE IF EXISTS feed_comments;
