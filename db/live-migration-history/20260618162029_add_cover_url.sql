-- Exported from the live database migration history (20260618162029 add_cover_url).

ALTER TABLE public.tutor_profiles ADD COLUMN IF NOT EXISTS cover_url text;
