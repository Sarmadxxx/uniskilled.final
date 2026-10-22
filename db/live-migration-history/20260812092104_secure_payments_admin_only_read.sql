-- Exported from the live database migration history (20260812092104 secure_payments_admin_only_read).

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all payments"
ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND 'admin' = ANY(users.roles::text[])
  )
);

GRANT SELECT ON payments TO authenticated;
