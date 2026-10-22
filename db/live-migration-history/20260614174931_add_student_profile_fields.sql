-- Exported from the live database migration history (20260614174931 add_student_profile_fields).

ALTER TABLE public.student_profiles 
ADD COLUMN IF NOT EXISTS gender character varying,
ADD COLUMN IF NOT EXISTS country character varying,
ADD COLUMN IF NOT EXISTS language character varying,
ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS gender character varying,
ADD COLUMN IF NOT EXISTS country character varying,
ADD COLUMN IF NOT EXISTS language character varying,
ADD COLUMN IF NOT EXISTS avatar_url character varying;
