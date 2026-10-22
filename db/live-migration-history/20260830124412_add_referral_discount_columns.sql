-- Exported from the live database migration history (20260830124412 add_referral_discount_columns).

-- Where the discount decision is locked in at order-creation time, so capture-paypal-order
-- applies exactly what was actually charged rather than trusting a client-supplied amount.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS pending_discount_amount numeric(10,2);
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS pending_discount_source text CHECK (pending_discount_source IN ('referral_welcome', 'credit_balance'));

-- Record what was subsidized on the payment itself, for accounting/audit —
-- tutor_payout always stays based on the full session price, never reduced by this.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
