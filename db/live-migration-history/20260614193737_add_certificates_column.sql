-- Exported from the live database migration history (20260614193737 add_certificates_column).

ALTER TABLE public.tutor_profiles ADD COLUMN IF NOT EXISTS certificates jsonb;
