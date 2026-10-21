-- Exported from the live database migration history (20260830124540 add_credit_balance_functions).

-- Atomic deduction \u2014 prevents a race where two concurrent bookings both spend the same credit
CREATE OR REPLACE FUNCTION public.deduct_credit_balance(p_user_id uuid, p_amount numeric)
RETURNS numeric AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE public.users
  SET credit_balance = GREATEST(0, credit_balance - p_amount)
  WHERE id = p_user_id
  RETURNING credit_balance INTO new_balance;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- Atomic credit \u2014 used when a referral qualifies and a reward is issued
CREATE OR REPLACE FUNCTION public.add_credit_balance(p_user_id uuid, p_amount numeric)
RETURNS numeric AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE public.users
  SET credit_balance = credit_balance + p_amount
  WHERE id = p_user_id
  RETURNING credit_balance INTO new_balance;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
