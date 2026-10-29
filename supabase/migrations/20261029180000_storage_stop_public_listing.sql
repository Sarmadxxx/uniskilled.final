-- Stop anyone from LISTING every file in the public buckets.
--
-- Why: avatars, covers, portfolios and credentials each had a "public read" SELECT policy on
-- storage.objects with no owner check. For a public bucket that policy is not needed to show a
-- file (public URLs work without it); what it does add is the ability for anyone, signed in or
-- not, to list and enumerate every file name in the bucket.
--
-- What stays the same: every existing public URL keeps working (pages use getPublicUrl or the
-- /object/public/ path). Owners can still upload, replace (upsert) and delete their own files,
-- because they keep read access to their own folder.

DROP POLICY IF EXISTS "Avatars: public read"     ON storage.objects;
DROP POLICY IF EXISTS "Covers: public read"      ON storage.objects;
DROP POLICY IF EXISTS "Portfolios: public read"  ON storage.objects;
DROP POLICY IF EXISTS "Credentials files: public read" ON storage.objects;

CREATE POLICY "Avatars: own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Covers: own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'covers' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Portfolios: own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'portfolios' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Credentials files: admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'credentials' AND (SELECT public.is_admin()));
