-- Exported from the live database migration history (20260614194819 storage_certificates_rls).

CREATE POLICY "Tutors can upload certificates" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Tutors can update certificates" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can read certificates" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'certificates');
