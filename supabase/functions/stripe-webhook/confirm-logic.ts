// Pure decision helpers for stripe-webhook (unit-tested in tests/functions).

// confirm               → booking is waiting for this payment: confirm it.
// already_paid          → booking was already paid. Because the webhook first ignores repeat
//                         deliveries of the SAME payment, reaching this means a SECOND charge
//                         (e.g. two checkout tabs) — or a concurrent repeat delivery. The caller
//                         records it for review; the unique payment-intent index tells them apart.
// not_awaiting_payment  → booking expired / was cancelled / declined. A late payment must NOT
//                         confirm it (the slot may have been rebooked). Record for refund review.
// missing               → booking no longer exists. Record for refund review.
export type PaymentDecision = 'confirm' | 'already_paid' | 'not_awaiting_payment' | 'missing';

export function sessionPaymentDecision(session: { status?: string | null; payment_status?: string | null } | null | undefined): PaymentDecision {
  if (!session) return 'missing';
  if (session.status === 'awaiting_payment' && session.payment_status !== 'paid') return 'confirm';
  if (session.payment_status === 'paid' && (session.status === 'confirmed' || session.status === 'completed')) return 'already_paid';
  return 'not_awaiting_payment';
}

export function groupSeatPaymentDecision(seat: { status?: string | null } | null | undefined): PaymentDecision {
  if (!seat) return 'missing';
  if (seat.status === 'awaiting_payment') return 'confirm';
  if (seat.status === 'confirmed') return 'already_paid';
  return 'not_awaiting_payment';
}

// Postgres unique_violation. The payments table has a unique index on stripe_payment_intent_id,
// so a second delivery of the same Stripe event fails here — that run must stop immediately,
// before it deducts credit or sends emails a second time.
export function isDuplicateKeyError(err: { code?: string } | null | undefined): boolean {
  return !!err && err.code === '23505';
}

// Human-readable reason stored on a payment that was recorded for review instead of confirming.
export function reviewReason(decision: PaymentDecision, ref: string): string {
  switch (decision) {
    case 'already_paid': return `Second payment for an already-paid booking (${ref}) — refund the student`;
    case 'not_awaiting_payment': return `Paid after the booking expired or was cancelled (${ref}) — refund the student`;
    case 'missing': return `Paid for a booking that no longer exists (${ref}) — refund the student`;
    default: return `Needs review (${ref})`;
  }
}
