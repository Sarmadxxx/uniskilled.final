-- Exported from the live database migration history (20261010153346 pre_release_hardening_part1).

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_session
  ON public.payments (session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_paypal_order_unique
  ON public.payments (paypal_order_id) WHERE paypal_order_id IS NOT NULL;
UPDATE storage.buckets SET file_size_limit = 10485760
  WHERE id = 'certificates' AND file_size_limit IS NULL;
