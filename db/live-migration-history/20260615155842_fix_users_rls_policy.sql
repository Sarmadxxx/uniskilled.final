-- Exported from the live database migration history (20260615155842 fix_users_rls_policy).

-- Enable RLS on users table if not already
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start clean
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;

-- Allow users to read their OWN row
CREATE POLICY "Users can read own profile" ON public.users
FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own row
CREATE POLICY "Users can update own profile" ON public.users
FOR UPDATE USING (auth.uid() = id);

-- Allow users to insert their own row
CREATE POLICY "Users can insert own profile" ON public.users
FOR INSERT WITH CHECK (auth.uid() = id);
