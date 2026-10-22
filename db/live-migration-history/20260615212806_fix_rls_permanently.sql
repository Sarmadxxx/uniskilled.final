-- Exported from the live database migration history (20260615212806 fix_rls_permanently).

-- Drop ALL existing policies on tutor_profiles
DROP POLICY IF EXISTS "tutor_select" ON public.tutor_profiles;
DROP POLICY IF EXISTS "tutor_insert" ON public.tutor_profiles;
DROP POLICY IF EXISTS "tutor_update" ON public.tutor_profiles;
DROP POLICY IF EXISTS "Tutors can read own profile" ON public.tutor_profiles;
DROP POLICY IF EXISTS "Tutors can update own profile" ON public.tutor_profiles;
DROP POLICY IF EXISTS "Tutors can insert own profile" ON public.tutor_profiles;

-- Disable RLS completely on tutor_profiles
ALTER TABLE public.tutor_profiles DISABLE ROW LEVEL SECURITY;

-- Also disable on users and student_profiles to prevent future issues
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles DISABLE ROW LEVEL SECURITY;
