// When should a Stripe Checkout link stop accepting payment?
//
// It should die together with the booking's 24-hour payment window, so a student can't pay for
// a booking that has already expired and been released. Stripe only accepts an expiry between
// 30 minutes and 24 hours from now, so the deadline is clamped into that range (with a minute of
// margin on each side). The webhook separately refuses to confirm a booking that is no longer
// awaiting payment, which covers the remaining ≤ 30-minute overlap.

export const STRIPE_MIN_EXPIRY_SECONDS = 30 * 60;
export const STRIPE_MAX_EXPIRY_SECONDS = 24 * 60 * 60;
const MARGIN_SECONDS = 60;

export function checkoutExpiresAt(paymentDueAt: string | null | undefined, nowMs: number): number {
  const nowS = Math.floor(nowMs / 1000);
  const earliest = nowS + STRIPE_MIN_EXPIRY_SECONDS + MARGIN_SECONDS;
  const latest = nowS + STRIPE_MAX_EXPIRY_SECONDS - MARGIN_SECONDS;
  const dueS = paymentDueAt ? Math.floor(new Date(paymentDueAt).getTime() / 1000) : NaN;
  if (!Number.isFinite(dueS)) return latest;
  return Math.min(latest, Math.max(earliest, dueS));
}
