-- Exported from the live database migration history (20260805130056 add_paypal_capture_id_and_group_session_tracking).

ALTER TABLE payments ADD COLUMN IF NOT EXISTS paypal_capture_id text;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS min_check_done boolean DEFAULT false;
