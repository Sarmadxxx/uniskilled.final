-- Exported from the live database migration history (20260805122920 create_group_sessions).

CREATE TABLE group_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES auth.users(id),
  tutor_name text,
  subject text NOT NULL,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  duration_minutes integer DEFAULT 60,
  format text DEFAULT 'online',
  notes text,
  max_students integer NOT NULL DEFAULT 4 CHECK (max_students BETWEEN 2 AND 4),
  price_per_student numeric NOT NULL,
  currency text DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE group_session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_session_id uuid NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  student_name text,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'confirmed', 'payment_expired', 'cancelled')),
  payment_due_at timestamptz,
  paypal_order_id text,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_session_id, student_id)
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS group_session_id uuid REFERENCES group_sessions(id);

GRANT ALL ON group_sessions TO service_role;
GRANT ALL ON group_session_participants TO service_role;
GRANT SELECT ON group_sessions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON group_session_participants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON group_sessions TO authenticated;
