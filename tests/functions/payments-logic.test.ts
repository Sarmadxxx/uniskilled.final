// Unit tests for the money-handling decisions inside the Supabase Edge Functions.
// Run:  node --experimental-strip-types --test tests/functions/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { choosePayoutRoute } from '../../supabase/functions/release-tutor-payout/payout-route.ts';
import { paypalCheckoutEnabled } from '../../supabase/functions/paypal-config/paypal-gate.ts';
import {
  sessionPaymentDecision, groupSeatPaymentDecision, isDuplicateKeyError, reviewReason,
} from '../../supabase/functions/stripe-webhook/confirm-logic.ts';
import {
  checkoutExpiresAt, STRIPE_MIN_EXPIRY_SECONDS, STRIPE_MAX_EXPIRY_SECONDS,
} from '../../supabase/functions/create-stripe-checkout/checkout-expiry.ts';

// ─── PAY-02: payout route follows where the money is ────────────────────────────
const activeStripeTutor = { stripe_account_id: 'acct_123', stripe_account_status: 'active', paypal_email: null };

test('card payment → Stripe payout from the tutor’s own balance', () => {
  assert.deepEqual(choosePayoutRoute({ stripe_payment_intent_id: 'pi_1' }, activeStripeTutor),
    { method: 'stripe', stripeAccountId: 'acct_123' });
});

test('card payment stays on Stripe even if the tutor prefers PayPal (the old double-pay bug)', () => {
  const tutor = { ...activeStripeTutor, paypal_email: 'tutor@example.com' };
  const r = choosePayoutRoute({ stripe_payment_intent_id: 'pi_1' }, tutor);
  assert.equal(r.method, 'stripe');
});

test('card payment with an inactive Stripe account is skipped, not sent via PayPal', () => {
  const tutor = { stripe_account_id: 'acct_123', stripe_account_status: 'onboarding', paypal_email: 'tutor@example.com' };
  const r = choosePayoutRoute({ stripe_payment_intent_id: 'pi_1' }, tutor);
  assert.equal(r.method, 'skip');
});

test('card payment with no Stripe account at all is skipped', () => {
  const r = choosePayoutRoute({ stripe_payment_intent_id: 'pi_1' }, { paypal_email: 'x@y.com' });
  assert.equal(r.method, 'skip');
});

test('PayPal-captured payment → PayPal payout to the tutor’s PayPal email', () => {
  const tutor = { ...activeStripeTutor, paypal_email: 'tutor@example.com' };
  assert.deepEqual(choosePayoutRoute({ paypal_capture_id: 'CAP1' }, tutor),
    { method: 'paypal', paypalEmail: 'tutor@example.com' });
});

test('PayPal payment never pulls from the tutor’s Stripe balance (that money is not there)', () => {
  const r = choosePayoutRoute({ paypal_capture_id: 'CAP1', paypal_order_id: 'ORD1' }, activeStripeTutor);
  assert.equal(r.method, 'skip');
});

test('payment referencing both providers is skipped for manual review', () => {
  const r = choosePayoutRoute({ stripe_payment_intent_id: 'pi_1', paypal_capture_id: 'CAP1' }, { ...activeStripeTutor, paypal_email: 'a@b.c' });
  assert.equal(r.method, 'skip');
});

test('payment with no provider reference is skipped', () => {
  assert.equal(choosePayoutRoute({}, activeStripeTutor).method, 'skip');
});

test('missing tutor profile is skipped', () => {
  assert.equal(choosePayoutRoute({ stripe_payment_intent_id: 'pi_1' }, null).method, 'skip');
});

// ─── PAY-01: PayPal checkout gate ───────────────────────────────────────────────
const envOf = (o: Record<string, string>) => (k: string) => o[k];

test('PayPal checkout is OFF by default (no secrets set)', () => {
  assert.equal(paypalCheckoutEnabled(envOf({})), false);
});

test('PayPal checkout stays OFF in sandbox even if someone enables it', () => {
  assert.equal(paypalCheckoutEnabled(envOf({ PAYPAL_CHECKOUT_ENABLED: 'true' })), false);
  assert.equal(paypalCheckoutEnabled(envOf({ PAYPAL_CHECKOUT_ENABLED: 'true', PAYPAL_ENV: 'sandbox' })), false);
});

test('PayPal checkout stays OFF when live but not explicitly enabled', () => {
  assert.equal(paypalCheckoutEnabled(envOf({ PAYPAL_ENV: 'live' })), false);
  assert.equal(paypalCheckoutEnabled(envOf({ PAYPAL_ENV: 'live', PAYPAL_CHECKOUT_ENABLED: 'false' })), false);
  assert.equal(paypalCheckoutEnabled(envOf({ PAYPAL_ENV: 'live', PAYPAL_CHECKOUT_ENABLED: 'yes' })), false);
});

test('PayPal checkout is ON only when enabled AND live (tolerates case/spaces)', () => {
  assert.equal(paypalCheckoutEnabled(envOf({ PAYPAL_ENV: 'live', PAYPAL_CHECKOUT_ENABLED: 'true' })), true);
  assert.equal(paypalCheckoutEnabled(envOf({ PAYPAL_ENV: ' LIVE ', PAYPAL_CHECKOUT_ENABLED: 'True' })), true);
});

test('the PayPal gate file is identical in all three PayPal functions', () => {
  const read = (fn: string) => readFileSync(new URL(`../../supabase/functions/${fn}/paypal-gate.ts`, import.meta.url), 'utf8');
  const a = read('paypal-config');
  assert.equal(read('create-paypal-order'), a);
  assert.equal(read('capture-paypal-order'), a);
});

test('all three PayPal functions actually call the gate before doing anything', () => {
  for (const fn of ['paypal-config', 'create-paypal-order', 'capture-paypal-order']) {
    const src = readFileSync(new URL(`../../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8');
    const gateAt = src.indexOf('paypalCheckoutEnabled(');
    assert.ok(gateAt > 0, `${fn} must call paypalCheckoutEnabled`);
    // the gate must come before any PayPal API use or request parsing
    for (const later of ['getToken()', 'req.json()', "Deno.env.get('PAYPAL_CLIENT_ID') ?? '';\n  if (!clientId)"]) {
      const at = src.indexOf(later, src.indexOf('Deno.serve'));
      if (at > 0) assert.ok(gateAt < at, `${fn}: gate must run before ${later}`);
    }
  }
});

// ─── PAY-04 / PAY-07: webhook confirm decisions ─────────────────────────────────
test('booking awaiting payment → confirm', () => {
  assert.equal(sessionPaymentDecision({ status: 'awaiting_payment', payment_status: 'unpaid' }), 'confirm');
});

test('expired booking is NOT confirmed by a late payment', () => {
  assert.equal(sessionPaymentDecision({ status: 'payment_expired', payment_status: 'unpaid' }), 'not_awaiting_payment');
});

test('cancelled or declined booking is NOT confirmed', () => {
  assert.equal(sessionPaymentDecision({ status: 'cancelled', payment_status: 'unpaid' }), 'not_awaiting_payment');
  assert.equal(sessionPaymentDecision({ status: 'declined', payment_status: 'unpaid' }), 'not_awaiting_payment');
  assert.equal(sessionPaymentDecision({ status: 'pending', payment_status: 'unpaid' }), 'not_awaiting_payment');
});

test('paid-then-cancelled booking is treated as cancelled, not as a second payment', () => {
  assert.equal(sessionPaymentDecision({ status: 'cancelled', payment_status: 'paid' }), 'not_awaiting_payment');
});

test('already-paid booking → second payment (recorded for refund, never silently dropped)', () => {
  assert.equal(sessionPaymentDecision({ status: 'confirmed', payment_status: 'paid' }), 'already_paid');
  assert.equal(sessionPaymentDecision({ status: 'completed', payment_status: 'paid' }), 'already_paid');
});

test('booking that no longer exists → missing', () => {
  assert.equal(sessionPaymentDecision(null), 'missing');
  assert.equal(sessionPaymentDecision(undefined), 'missing');
});

test('group seat decisions', () => {
  assert.equal(groupSeatPaymentDecision({ status: 'awaiting_payment' }), 'confirm');
  assert.equal(groupSeatPaymentDecision({ status: 'confirmed' }), 'already_paid');
  assert.equal(groupSeatPaymentDecision({ status: 'payment_expired' }), 'not_awaiting_payment');
  assert.equal(groupSeatPaymentDecision({ status: 'cancelled' }), 'not_awaiting_payment');
  assert.equal(groupSeatPaymentDecision(null), 'missing');
});

test('duplicate-key detection (repeat Stripe delivery) only matches unique violations', () => {
  assert.equal(isDuplicateKeyError({ code: '23505' }), true);
  assert.equal(isDuplicateKeyError({ code: '23503' }), false);
  assert.equal(isDuplicateKeyError(null), false);
  assert.equal(isDuplicateKeyError(undefined), false);
});

test('review reasons tell the admin to refund and include the reference', () => {
  for (const d of ['already_paid', 'not_awaiting_payment', 'missing'] as const) {
    const r = reviewReason(d, 'booking abc');
    assert.match(r, /refund/i);
    assert.match(r, /booking abc/);
    assert.ok(r.length <= 250);
  }
});

test('webhook records the payment BEFORE confirming and stops on a duplicate', () => {
  const src = readFileSync(new URL('../../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');
  const oneToOne = src.slice(src.indexOf("const decision = sessionPaymentDecision"));
  const insertAt = oneToOne.indexOf(".from('payments').insert(");
  const confirmAt = oneToOne.indexOf("status: 'confirmed', payment_status: 'paid'");
  const creditAt = oneToOne.indexOf('deduct_credit_balance');
  assert.ok(insertAt > 0 && confirmAt > insertAt, 'payment insert must come before the confirm update');
  assert.ok(creditAt > confirmAt, 'credit deduction must come after both');
  assert.ok(oneToOne.slice(insertAt, confirmAt).includes('isDuplicateKeyError(payInsErr)'), 'duplicate insert must stop the run');
  assert.ok(oneToOne.includes(".eq('status', 'awaiting_payment')"), 'confirm update must be conditional');
});

// ─── PAY-04: checkout link expiry ───────────────────────────────────────────────
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const nowS = NOW / 1000;
const iso = (secondsFromNow: number) => new Date(NOW + secondsFromNow * 1000).toISOString();

test('checkout link expires exactly at the payment deadline when that is within Stripe’s range', () => {
  assert.equal(checkoutExpiresAt(iso(6 * 3600), NOW), nowS + 6 * 3600);
});

test('deadline less than 30 min away → clamped up to Stripe’s minimum (+1 min margin)', () => {
  assert.equal(checkoutExpiresAt(iso(5 * 60), NOW), nowS + STRIPE_MIN_EXPIRY_SECONDS + 60);
});

test('deadline more than 24 h away (or missing) → clamped to Stripe’s maximum (−1 min margin)', () => {
  assert.equal(checkoutExpiresAt(iso(30 * 3600), NOW), nowS + STRIPE_MAX_EXPIRY_SECONDS - 60);
  assert.equal(checkoutExpiresAt(null, NOW), nowS + STRIPE_MAX_EXPIRY_SECONDS - 60);
  assert.equal(checkoutExpiresAt('not a date', NOW), nowS + STRIPE_MAX_EXPIRY_SECONDS - 60);
});

test('expiry is always inside Stripe’s accepted window', () => {
  for (const s of [-3600, 0, 60, 1799, 1800, 1861, 7200, 86340, 86400, 200000]) {
    const e = checkoutExpiresAt(iso(s), NOW) - nowS;
    assert.ok(e >= STRIPE_MIN_EXPIRY_SECONDS && e <= STRIPE_MAX_EXPIRY_SECONDS, `offset ${s} → ${e}`);
  }
});

test('checkout function sends expires_at to Stripe', () => {
  const src = readFileSync(new URL('../../supabase/functions/create-stripe-checkout/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("'expires_at': checkoutExpiresAt(paymentDueAt, Date.now())"));
});
