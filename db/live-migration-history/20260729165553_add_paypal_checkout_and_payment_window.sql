-- Exported from the live database migration history (20260729165553 add_paypal_checkout_and_payment_window).

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS payment_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS paypal_order_id text;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS paypal_order_id text;
