-- Exported from the live database migration history (20260808104826 add_currency_to_sessions).

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';
