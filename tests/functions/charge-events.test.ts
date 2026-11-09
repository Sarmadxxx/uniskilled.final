// Unit tests for chargebacks and dashboard refunds (stripe-webhook/charge-logic.ts).
// Run:  node --experimental-strip-types --test tests/functions/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  disputeCreatedAction, disputeClosedAction, chargeRefundedAction,
} from '../../supabase/functions/stripe-webhook/charge-logic.ts';

const PAYABLE_IN_PAYOUT_JOB = ['paid', 'partially_refunded'];
const paid = { status: 'paid', released_at: null, stripe_transfer_id: null };
const released = { status: 'released', released_at: '2026-11-01T10:00:00Z', stripe_transfer_id: 'po_1' };

// ─── Chargebacks ────────────────────────────────────────────────────────────────
test('chargeback on an unpaid-out payment pauses the payout', () => {
  const a = disputeCreatedAction(paid, 'dp_1', '15.00 EUR');
  assert.equal(a.kind, 'update');
  assert.ok(a.kind === 'update' && !PAYABLE_IN_PAYOUT_JOB.includes(a.status), 'new status must not be payable');
});

test('chargeback on a partly refunded payment also pauses it', () => {
  const a = disputeCreatedAction({ status: 'partially_refunded' }, 'dp_1', '15.00 EUR');
  assert.ok(a.kind === 'update' && a.status === 'disputed');
});

test('chargeback after the tutor was paid only alerts (nothing left to pause)', () => {
  assert.equal(disputeCreatedAction(released, 'dp_1', '15.00 EUR').kind, 'alert_only');
});

test('chargeback while a payout is mid-flight alerts and does not touch the status', () => {
  assert.equal(disputeCreatedAction({ status: 'releasing' }, 'dp_1', '15.00 EUR').kind, 'alert_only');
});

test('chargeback for an unknown payment still alerts the admin', () => {
  assert.equal(disputeCreatedAction(null, 'dp_1', '15.00 EUR').kind, 'alert_only');
});

test('repeat chargeback delivery changes nothing', () => {
  assert.equal(disputeCreatedAction({ status: 'disputed' }, 'dp_1', '15.00 EUR').kind, 'ignore');
});

test('won chargeback resumes the payout', () => {
  const a = disputeClosedAction({ status: 'disputed' }, 'dp_1', 'won');
  assert.ok(a.kind === 'update' && a.status === 'paid');
});

test('lost chargeback is never paid out', () => {
  for (const outcome of ['lost', 'warning_closed', 'charge_refunded']) {
    const a = disputeClosedAction({ status: 'disputed' }, 'dp_1', outcome);
    assert.ok(a.kind === 'update' && !PAYABLE_IN_PAYOUT_JOB.includes(a.status), outcome);
  }
});

// ─── Refunds made in the Stripe dashboard ───────────────────────────────────────
test('UniSkilled’s own refunds are recognised and left alone', () => {
  for (const status of ['refund_processing', 'refunded', 'partially_refunded', 'refund_failed']) {
    assert.equal(chargeRefundedAction({ status }, 1500, 1500).kind, 'ignore', status);
  }
});

test('full dashboard refund of a paid booking stops the payout', () => {
  const a = chargeRefundedAction(paid, 1500, 1500);
  assert.ok(a.kind === 'update' && a.status === 'refunded');
});

test('partial dashboard refund pauses the payout for a manual decision', () => {
  const a = chargeRefundedAction(paid, 500, 1500);
  assert.ok(a.kind === 'update' && !PAYABLE_IN_PAYOUT_JOB.includes(a.status));
});

test('refund of a payment flagged for review (late/duplicate) is recorded as refunded', () => {
  const a = chargeRefundedAction({ status: 'needs_review' }, 1500, 1500);
  assert.ok(a.kind === 'update' && a.status === 'refunded');
});

test('dashboard refund after the tutor was paid only alerts', () => {
  assert.equal(chargeRefundedAction(released, 1500, 1500).kind, 'alert_only');
});

test('refund of a charge UniSkilled has no record of is ignored', () => {
  assert.equal(chargeRefundedAction(null, 1500, 1500).kind, 'ignore');
});

// ─── Wiring ─────────────────────────────────────────────────────────────────────
test('webhook routes chargeback and refund events before the checkout-only filter', () => {
  const src = readFileSync(new URL('../../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');
  const route = src.indexOf("'charge.dispute.created', 'charge.dispute.closed', 'charge.refunded'");
  const filter = src.indexOf("event.type !== 'checkout.session.completed'");
  assert.ok(route > 0 && filter > 0 && route < filter);
  // signature is verified before any event is handled
  assert.ok(src.indexOf('verifyStripeSignature(rawBody') < route);
});

test('payout job never pays disputed, lost or review payments', () => {
  const src = readFileSync(new URL('../../supabase/functions/release-tutor-payout/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("const PAYABLE_STATUSES = ['paid', 'partially_refunded']"));
});

test('group-minimum refunds claim the payment before refunding', () => {
  const src = readFileSync(new URL('../../supabase/functions/check-group-session-minimums/index.ts', import.meta.url), 'utf8');
  const claim = src.indexOf("update({ status: 'refund_processing' })");
  const refund = src.indexOf('refundStripe(payment.stripe_payment_intent_id)');
  assert.ok(claim > 0 && refund > claim);
});
