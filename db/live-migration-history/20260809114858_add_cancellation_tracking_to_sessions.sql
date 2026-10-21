-- Exported from the live database migration history (20260809114858 add_cancellation_tracking_to_sessions).

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS cancelled_by text CHECK (cancelled_by IN ('student', 'tutor')),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS refund_outcome text CHECK (refund_outcome IN ('full_refund', 'no_refund_reschedule_offered', 'no_refund'));
