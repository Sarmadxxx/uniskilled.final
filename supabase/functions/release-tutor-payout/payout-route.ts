// Decides HOW a tutor's share of one payment is paid out.
//
// The route depends on where the money actually is, not on the tutor's payout preference:
//  • Card payments (Stripe) are destination charges — the tutor's 80% already sits in the tutor's
//    own Stripe Express balance. The only correct payout is a Stripe payout from that balance.
//  • PayPal payments landed in UniSkilled's PayPal balance — they can only go out via PayPal.
// Choosing by preference used to send PayPal money from UniSkilled while the card money stayed
// in the tutor's Stripe account (a double payment once live).

export type PaymentForRoute = {
  stripe_payment_intent_id?: string | null;
  paypal_capture_id?: string | null;
  paypal_order_id?: string | null;
};

export type TutorForRoute = {
  stripe_account_id?: string | null;
  stripe_account_status?: string | null;
  paypal_email?: string | null;
} | null | undefined;

export type PayoutRoute =
  | { method: 'stripe'; stripeAccountId: string }
  | { method: 'paypal'; paypalEmail: string }
  | { method: 'skip'; reason: string };

export function choosePayoutRoute(payment: PaymentForRoute, tutor: TutorForRoute): PayoutRoute {
  if (!tutor) return { method: 'skip', reason: 'tutor profile not found' };

  const paidByCard = !!payment.stripe_payment_intent_id;
  const paidByPaypal = !!(payment.paypal_capture_id || payment.paypal_order_id);

  if (paidByCard && paidByPaypal) {
    return { method: 'skip', reason: 'payment references both Stripe and PayPal — check manually' };
  }

  if (paidByCard) {
    if (!tutor.stripe_account_id || tutor.stripe_account_status !== 'active') {
      return { method: 'skip', reason: "card payment, but the tutor's Stripe payout account is not active" };
    }
    return { method: 'stripe', stripeAccountId: tutor.stripe_account_id };
  }

  if (paidByPaypal) {
    if (!tutor.paypal_email) {
      return { method: 'skip', reason: 'PayPal payment, but no PayPal email on file — pay this tutor out manually' };
    }
    return { method: 'paypal', paypalEmail: tutor.paypal_email };
  }

  return { method: 'skip', reason: 'payment has no Stripe or PayPal reference — check manually' };
}
