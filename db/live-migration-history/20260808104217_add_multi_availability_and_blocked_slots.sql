-- Exported from the live database migration history (20260808104217 add_multi_availability_and_blocked_slots).

-- Multi-select time-of-day preference (keeps old singular preferred_time column
-- untouched for backward compatibility with any existing display code)
ALTER TABLE tutor_profiles ADD COLUMN IF NOT EXISTS preferred_times text[] DEFAULT '{}';

-- Specific blocked dates/time-ranges a tutor sets, that students then cannot
-- select when booking. Two kinds of block:
--   - all_day = true  -> the whole date is blocked (start_time/end_time ignored)
--   - all_day = false -> only that specific time range on that date is blocked
CREATE TABLE tutor_blocked_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_date date NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_blocked_slots_tutor_date ON tutor_blocked_slots(tutor_id, blocked_date);

GRANT ALL ON tutor_blocked_slots TO service_role, authenticated;
GRANT SELECT ON tutor_blocked_slots TO anon;
