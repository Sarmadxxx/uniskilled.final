// Pure decision helpers for card chargebacks and refunds made outside UniSkilled
// (e.g. in the Stripe dashboard). Unit-tested in tests/functions.
//
// Why this exists: card payments are destination charges, so the tutor's 80% sits in their
// Stripe account until the payout job pays it out after the 48-hour hold. Before this, the
// webhook ignored every event except checkout completion, so:
//  • a chargeback (charge.dispute.created) did not pause the tutor's payout — the platform
//    would lose the money once the bank took it back;
//  • a refund made by hand in the Stripe dashboard (charge.refunded) left the payment marked
//    'paid', so the payout job could still try to pay the tutor.
//
// Refunds started by UniSkilled itself (cancel-session, resolve-dispute, group minimums) set
// the payment to refund_processing / refunded / partially_refunded first, so their own
// charge.refunded events are recognised here and left alone.

export type PaymentRow = {
  status?: string | null;
  released_at?: string | null;
  stripe_transfer_id?: string | null;
};

export type ChargeAction =
  | { kind: 'ignore'; reason: string }
  | { kind: 'update'; status: string; flagReason: string; alert: string }
  | { kind: 'alert_only'; flagReason: string; alert: string };

// Statuses that mean UniSkilled is already handling (or has handled) a refund for this payment.
const OWN_REFUND_STATUSES = ['refund_processing', 'refunded', 'partially_refunded', 'refund_failed'];
// Statuses the payout job may still pay out (keep in sync with release-tutor-payout).
const PAYABLE = ['paid', 'partially_refunded'];

function isReleased(p: PaymentRow): boolean {
  return !!(p.released_at || p.stripe_transfer_id || p.status === 'released');
}

/** A card chargeback was opened by the student's bank. */
export function disputeCreatedAction(payment: PaymentRow | null | undefined, disputeId: string, amountText: string): ChargeAction {
  if (!payment) {
    return { kind: 'alert_only', flagReason: '', alert: `A card chargeback (${disputeId}, ${amountText}) was opened for a payment UniSkilled has no record of. Check it in Stripe → Disputes.` };
  }
  if (isReleased(payment)) {
    return {
      kind: 'alert_only',
      flagReason: `Chargeback ${disputeId} opened after the tutor was paid`.slice(0, 250),
      alert: `A card chargeback (${disputeId}, ${amountText}) was opened, but the tutor has already been paid out. Respond in Stripe → Disputes with the session evidence before the deadline.`,
    };
  }
  if (payment.status === 'releasing') {
    return {
      kind: 'alert_only',
      flagReason: `Chargeback ${disputeId} opened while a payout was in progress`.slice(0, 250),
      alert: `A card chargeback (${disputeId}, ${amountText}) was opened while this payment's payout was being sent. Check the tutor's payout in Stripe and respond in Stripe → Disputes.`,
    };
  }
  if (payment.status === 'disputed') return { kind: 'ignore', reason: 'already marked disputed' };
  return {
    kind: 'update',
    status: 'disputed',
    flagReason: `Card chargeback ${disputeId} — payout paused until it is closed`.slice(0, 250),
    alert: `A card chargeback (${disputeId}, ${amountText}) was opened. The tutor's payout is paused. Respond in Stripe → Disputes with the session evidence before the deadline.`,
  };
}

/** The bank closed the chargeback: 'won' means UniSkilled keeps the money, anything else means it was lost. */
export function disputeClosedAction(payment: PaymentRow | null | undefined, disputeId: string, outcome: string): ChargeAction {
  if (!payment) return { kind: 'ignore', reason: 'no payment record' };
  if (payment.status !== 'disputed') {
    return { kind: 'alert_only', flagReason: `Chargeback ${disputeId} closed: ${outcome}`.slice(0, 250), alert: `Card chargeback ${disputeId} was closed (${outcome}). The payment was not paused here, so check it by hand.` };
  }
  if (outcome === 'won') {
    return { kind: 'update', status: 'paid', flagReason: `Chargeback ${disputeId} won — payout resumed`.slice(0, 250), alert: `Card chargeback ${disputeId} was won. The tutor's payout will go out with the next hourly run.` };
  }
  return {
    kind: 'update',
    status: 'chargeback_lost',
    flagReason: `Chargeback ${disputeId} closed as '${outcome}' — not paid out`.slice(0, 250),
    alert: `Card chargeback ${disputeId} closed as '${outcome}'. The money went back to the student's bank, so the tutor's share will not be paid out. Check the session and tell the tutor.`,
  };
}

/** A refund appeared on a card charge. amountRefunded/amount are in cents. */
export function chargeRefundedAction(payment: PaymentRow | null | undefined, amountRefunded: number, amount: number): ChargeAction {
  if (!payment) return { kind: 'ignore', reason: 'no payment record (not a UniSkilled booking payment)' };
  const status = payment.status || '';
  if (OWN_REFUND_STATUSES.includes(status)) return { kind: 'ignore', reason: `refund already handled by UniSkilled (${status})` };
  const full = amountRefunded >= amount;

  if (status === 'needs_review') {
    // A late/duplicate payment that was flagged for refund; the admin has now refunded it.
    return full
      ? { kind: 'update', status: 'refunded', flagReason: 'Refunded in the Stripe dashboard', alert: '' }
      : { kind: 'ignore', reason: 'partial refund of a payment already flagged for review' };
  }
  if (isReleased(payment) || status === 'releasing') {
    return {
      kind: 'alert_only',
      flagReason: 'Refunded in the Stripe dashboard after the tutor was paid'.slice(0, 250),
      alert: 'A card payment was refunded in the Stripe dashboard after the tutor had been paid out. Check whether the transfer was reversed.',
    };
  }
  if (!PAYABLE.includes(status) && status !== 'disputed') {
    return { kind: 'ignore', reason: `payment status '${status}' is not payable anyway` };
  }
  if (full) {
    return {
      kind: 'update', status: 'refunded',
      flagReason: 'Fully refunded in the Stripe dashboard — not paid out',
      alert: 'A card payment was fully refunded in the Stripe dashboard. It has been marked refunded, so the tutor will not be paid for it. Cancel the booking if that was the intention.',
    };
  }
  return {
    kind: 'update', status: 'needs_review',
    flagReason: 'Partly refunded in the Stripe dashboard — set the tutor payout by hand',
    alert: "A card payment was partly refunded in the Stripe dashboard. Its payout is paused: set the tutor's correct share and status by hand (or use the dispute tools next time).",
  };
}
