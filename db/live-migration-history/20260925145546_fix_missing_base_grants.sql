-- Exported from the live database migration history (20260925145546 fix_missing_base_grants).

-- The actual root cause: RLS policies alone were never enough — the base
-- table-level GRANT was missing entirely for these three, so every request
-- was rejected before RLS even got a chance to evaluate it.
GRANT SELECT, INSERT ON referrals TO authenticated;
GRANT SELECT ON credit_transactions TO authenticated;
GRANT SELECT ON credential_endorsements TO authenticated;
