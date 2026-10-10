-- Pre-release hardening (audit 2026-10-10). Non-destructive: adds indexes and tightens storage
-- permissions. No rows are changed or deleted.

-- DB-01 ─ one payment record per one-to-one booking, and a PayPal order can be recorded only once.
-- (Verified before applying: no existing duplicates.) Payments recorded for refund review are stored
-- without a session link, so they never collide with the booking's real payment.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_session
  ON public.payments (session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_paypal_order_unique
  ON public.payments (paypal_order_id) WHERE paypal_order_id IS NOT NULL;

-- SEC-01 ─ anyone could LIST every tutor's uploaded certificates/transcripts. The bucket is public,
-- so individual file links shown on profiles keep working without this policy (Supabase serves
-- public-bucket files by URL regardless of policies); only listing/browsing is removed.
DROP POLICY IF EXISTS "Public can read certificates" ON storage.objects;
DROP POLICY IF EXISTS "Certificates: own read" ON storage.objects;
CREATE POLICY "Certificates: own read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'certificates' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- SEC-03 ─ storage-level size limit for certificates (the upload function already enforces 10 MB).
UPDATE storage.buckets SET file_size_limit = 10485760
  WHERE id = 'certificates' AND file_size_limit IS NULL;

-- SEC-02 ─ message attachments were readable by every signed-in user. Restrict to the uploader's
-- own folder and admins. (Bucket is currently unused: 0 files.)
DROP POLICY IF EXISTS "Message files: authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "Message files: own or admin read" ON storage.objects;
CREATE POLICY "Message files: own or admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'messages' AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin()));
