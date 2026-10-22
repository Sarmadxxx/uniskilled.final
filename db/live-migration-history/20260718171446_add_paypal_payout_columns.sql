-- Exported from the live database migration history (20260718171446 add_paypal_payout_columns).

ALTER TABLE tutor_profiles
  ADD COLUMN IF NOT EXISTS payout_method text DEFAULT 'stripe' CHECK (payout_method IN ('stripe', 'paypal')),
  ADD COLUMN IF NOT EXISTS paypal_email text;
