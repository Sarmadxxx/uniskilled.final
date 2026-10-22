-- Exported from the live database migration history (20260615203608 fix_tutor_profile_columns).

ALTER TABLE public.tutor_profiles
ADD COLUMN IF NOT EXISTS study_year varchar,
ADD COLUMN IF NOT EXISTS degree_level varchar,
ADD COLUMN IF NOT EXISTS major varchar,
ADD COLUMN IF NOT EXISTS overall_grade varchar,
ADD COLUMN IF NOT EXISTS max_students integer,
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS session_length varchar,
ADD COLUMN IF NOT EXISTS teaching_format varchar,
ADD COLUMN IF NOT EXISTS preferred_time varchar;
