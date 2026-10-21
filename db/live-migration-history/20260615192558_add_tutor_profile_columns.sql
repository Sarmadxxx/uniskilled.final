-- Exported from the live database migration history (20260615192558 add_tutor_profile_columns).

ALTER TABLE public.tutor_profiles
ADD COLUMN IF NOT EXISTS degree_level varchar,
ADD COLUMN IF NOT EXISTS major varchar,
ADD COLUMN IF NOT EXISTS overall_grade varchar,
ADD COLUMN IF NOT EXISTS max_students integer,
ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS avatar_url text;
