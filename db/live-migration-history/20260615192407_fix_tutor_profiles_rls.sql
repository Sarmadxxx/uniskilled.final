-- Exported from the live database migration history (20260615192407 fix_tutor_profiles_rls).

-- Fix RLS on all tables
ALTER TABLE public.tutor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Tutors can read own profile" ON public.tutor_profiles;
DROP POLICY IF EXISTS "Tutors can update own profile" ON public.tutor_profiles;
DROP POLICY IF EXISTS "Tutors can insert own profile" ON public.tutor_profiles;
DROP POLICY IF EXISTS "Students can read own profile" ON public.student_profiles;
DROP POLICY IF EXISTS "Students can update own profile" ON public.student_profiles;
DROP POLICY IF EXISTS "Students can insert own profile" ON public.student_profiles;

-- Users table - own row access
CREATE POLICY "users_select" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Tutor profiles - own row access
CREATE POLICY "tutor_select" ON public.tutor_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tutor_insert" ON public.tutor_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tutor_update" ON public.tutor_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Student profiles - own row access  
CREATE POLICY "student_select" ON public.student_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "student_insert" ON public.student_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "student_update" ON public.student_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Reviews table - anyone can read, students can write
DROP TABLE IF EXISTS public.reviews CASCADE;
CREATE TABLE public.reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tutor_id uuid REFERENCES auth.users(id),
  student_id uuid REFERENCES auth.users(id),
  student_name text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_read_all" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = student_id);

-- Sessions table RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_read" ON public.sessions;
CREATE POLICY "sessions_read" ON public.sessions FOR SELECT USING (
  auth.uid() = student_id OR auth.uid() = tutor_id
);
