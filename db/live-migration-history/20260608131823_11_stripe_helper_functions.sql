-- Exported from the live database migration history (20260608131823 11_stripe_helper_functions).

-- Increment tutor total earnings after payout
CREATE OR REPLACE FUNCTION public.increment_tutor_earnings(
  tutor_user_id UUID,
  amount DECIMAL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.tutor_profiles
  SET total_earnings = total_earnings + amount
  WHERE user_id = tutor_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment student total earnings after order payout
CREATE OR REPLACE FUNCTION public.increment_student_earnings(
  student_user_id UUID,
  amount DECIMAL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.student_profiles
  SET total_earnings = total_earnings + amount
  WHERE user_id = student_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
