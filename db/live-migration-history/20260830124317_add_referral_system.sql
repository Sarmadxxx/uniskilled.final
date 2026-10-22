-- Exported from the live database migration history (20260830124317 add_referral_system).

-- Referral code + credit balance on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code varchar(12) UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credit_balance numeric(10,2) NOT NULL DEFAULT 0;

-- Function to generate a short, human-shareable, unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code() RETURNS varchar AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no O/0/I/1 to avoid ambiguity
  result varchar := '';
  i integer;
  code_exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..7 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.users WHERE referral_code = result) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Auto-assign a referral code to every new user
CREATE OR REPLACE FUNCTION public.set_referral_code() RETURNS trigger AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_referral_code ON public.users;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

-- Backfill existing users
UPDATE public.users SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

-- Referrals: one row per successful invite, tracks its lifecycle
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id uuid NOT NULL REFERENCES public.users(id),
  invitee_id uuid NOT NULL UNIQUE REFERENCES public.users(id), -- a user can only ever be someone's invitee once
  referral_code varchar(12) NOT NULL,
  invitee_role text NOT NULL CHECK (invitee_role IN ('student', 'tutor')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'expired', 'void')),
  qualifying_session_id uuid REFERENCES public.sessions(id),
  referrer_reward_amount numeric(10,2),
  invitee_discount_amount numeric(10,2) NOT NULL DEFAULT 10.00,
  invitee_discount_applied boolean NOT NULL DEFAULT false,
  invitee_discount_applied_session_id uuid REFERENCES public.sessions(id),
  qualified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invitee ON public.referrals(invitee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_pending_qualify ON public.referrals(status) WHERE status = 'pending';

-- Credit ledger: every earn/spend event, so credit_balance is always auditable and reconstructable
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  amount numeric(10,2) NOT NULL, -- positive = credited, negative = spent
  type text NOT NULL CHECK (type IN ('referral_reward', 'referral_discount_redeemed', 'credit_redeemed', 'admin_adjustment', 'credit_expired')),
  reference_referral_id uuid REFERENCES public.referrals(id),
  reference_session_id uuid REFERENCES public.sessions(id),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON public.credit_transactions(user_id);
