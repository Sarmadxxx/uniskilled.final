-- Exported from the live database migration history (20260929151601 enforce_min_booking_price_10eur_11usd).

-- Server-side enforcement of the new minimum booking value (€10 / $11), independent of frontend validation.
-- NOT VALID: applies to all new inserts/updates going forward, without touching pre-existing rows
-- (some legacy test sessions have price = 0 from before pricing was enforced).

ALTER TABLE sessions
  ADD CONSTRAINT sessions_min_price_check
  CHECK (
    price IS NULL
    OR (currency = 'USD' AND price >= 11)
    OR (currency IS DISTINCT FROM 'USD' AND price >= 10)
  ) NOT VALID;

ALTER TABLE group_sessions
  ADD CONSTRAINT group_sessions_min_price_check
  CHECK (
    price_per_student IS NULL
    OR (currency = 'USD' AND price_per_student >= 11)
    OR (currency IS DISTINCT FROM 'USD' AND price_per_student >= 10)
  ) NOT VALID;
