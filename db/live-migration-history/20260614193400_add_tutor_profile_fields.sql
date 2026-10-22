-- Exported from the live database migration history (20260614193400 add_tutor_profile_fields).

ALTER TABLE public.tutor_profiles
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS subjects jsonb,
ADD COLUMN IF NOT EXISTS hourly_rate numeric,
ADD COLUMN IF NOT EXISTS session_length varchar,
ADD COLUMN IF NOT EXISTS availability jsonb,
ADD COLUMN IF NOT EXISTS preferred_time varchar,
ADD COLUMN IF NOT EXISTS teaching_format varchar,
ADD COLUMN IF NOT EXISTS country varchar,
ADD COLUMN IF NOT EXISTS language varchar,
ADD COLUMN IF NOT EXISTS gender varchar;

ALTER TABLE public.student_profiles
ADD COLUMN IF NOT EXISTS subjects jsonb,
ADD COLUMN IF NOT EXISTS availability jsonb,
ADD COLUMN IF NOT EXISTS preferred_time varchar;
