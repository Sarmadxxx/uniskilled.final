-- Exported from the live database migration history (20260718165926 add_paypal_batch_id_to_payments).

ALTER TABLE payments ADD COLUMN IF NOT EXISTS paypal_batch_id text;
