-- Exported from the live database migration history (20261009170755 credit_type_credit_restored).

-- Credit used on a booking that is later fully refunded is given back as account credit.
alter table public.credit_transactions drop constraint credit_transactions_type_check;
alter table public.credit_transactions add constraint credit_transactions_type_check
  check (type = any (array['referral_reward','referral_discount_redeemed','referral_welcome_credit','credit_redeemed','credit_restored','admin_adjustment','credit_expired']));
