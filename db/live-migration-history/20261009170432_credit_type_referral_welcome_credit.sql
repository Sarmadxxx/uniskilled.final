-- Exported from the live database migration history (20261009170432 credit_type_referral_welcome_credit).

-- Discounts are now capped at the platform fee per booking; the unused part of a
-- referral welcome discount is kept as account credit, logged with this type.
alter table public.credit_transactions drop constraint credit_transactions_type_check;
alter table public.credit_transactions add constraint credit_transactions_type_check
  check (type = any (array['referral_reward','referral_discount_redeemed','referral_welcome_credit','credit_redeemed','admin_adjustment','credit_expired']));
