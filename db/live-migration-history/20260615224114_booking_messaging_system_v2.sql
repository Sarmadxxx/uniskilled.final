-- Exported from the live database migration history (20260615224114 booking_messaging_system_v2).

-- Sessions/Bookings table
DROP TABLE IF EXISTS public.sessions CASCADE;
CREATE TABLE public.sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tutor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tutor_name text,
  student_name text,
  subject text,
  scheduled_date date,
  scheduled_time time,
  duration_minutes integer DEFAULT 60,
  format text DEFAULT 'online',
  status text DEFAULT 'pending',
  price numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Messages table
DROP TABLE IF EXISTS public.messages CASCADE;
CREATE TABLE public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid,
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text,
  content text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Conversations table
DROP TABLE IF EXISTS public.conversations CASCADE;
CREATE TABLE public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_1 uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_2 uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_1_name text,
  participant_2_name text,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(participant_1, participant_2)
);

-- Notifications table
DROP TABLE IF EXISTS public.notifications CASCADE;
CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Grant permissions
GRANT ALL ON public.sessions TO anon, authenticated;
GRANT ALL ON public.messages TO anon, authenticated;
GRANT ALL ON public.conversations TO anon, authenticated;
GRANT ALL ON public.notifications TO anon, authenticated;
GRANT ALL ON public.reviews TO anon, authenticated;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
