// Student-facing PayPal checkout is OFF unless BOTH Supabase secrets are set:
//   PAYPAL_CHECKOUT_ENABLED = true   (a deliberate business decision to offer PayPal)
//   PAYPAL_ENV              = live   (real-money PayPal Business credentials)
//
// Why both: PayPal falls back to the sandbox when PAYPAL_ENV isn't 'live'. A sandbox checkout on
// the real website lets anyone confirm a real booking with fake test money. Card-only (Stripe) is
// the launch decision of 9 Oct 2026; this keeps the PayPal code dormant but safe.
//
// Refunds of PayPal payments that already exist are NOT affected by this switch.
//
// Keep this file identical in: paypal-config, create-paypal-order, capture-paypal-order.

export function paypalCheckoutEnabled(getEnv: (key: string) => string | undefined): boolean {
  return (getEnv('PAYPAL_CHECKOUT_ENABLED') ?? '').trim().toLowerCase() === 'true'
    && (getEnv('PAYPAL_ENV') ?? '').trim().toLowerCase() === 'live';
}

export const PAYPAL_DISABLED_MESSAGE =
  'PayPal is not available right now. Please pay by card — your booking is still held for you.';
