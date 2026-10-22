-- Exported from the live database migration history (20261011165916 pricing_min_15_group_fee_25).

-- One-to-one minimum booking value raised from €10/$11 to €15/$17 (group seats stay €10/$11).
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_min_price_check;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_min_price_check CHECK (
  price IS NULL
  OR (currency = 'USD' AND price >= 17)
  OR (currency IS DISTINCT FROM 'USD' AND price >= 15)
) NOT VALID;

UPDATE public.platform_settings SET value = '15' WHERE key = 'min_tutor_rate';

-- Separate platform fee for group sessions (read by create-stripe-checkout, stripe-webhook, capture-paypal-order).
INSERT INTO public.platform_settings (key, value) VALUES ('group_platform_fee_rate', '0.25')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
