import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sessionPaymentDecision, groupSeatPaymentDecision, isDuplicateKeyError, reviewReason, type PaymentDecision } from './confirm-logic.ts';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SIGNATURE_TOLERANCE_SECONDS = 300; // same default as Stripe's own libraries

async function getPlatformFeeRate(supabase: any): Promise<number> {
  const { data } = await supabase.from('platform_settings').select('value').eq('key', 'platform_fee_rate').single();
  const rate = parseFloat(data?.value);
  return isNaN(rate) ? 0.20 : rate;
}

async function sendEmail(supabaseUrl: string, type: string, to: string, data: any) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (e) {
    console.error('Email dispatch failed (non-critical):', e);
  }
}

async function notifyAdmins(supabase: any, supabaseUrl: string, subject: string, amount: number, currency: string, payerName: string, sessionKind: string) {
  try {
    const { data: admins } = await supabase.from('users').select('id, email').contains('roles', ['admin']);
    const sym = currency.toUpperCase() === 'USD' ? '$' : '€';
    for (const admin of admins || []) {
      await supabase.from('notifications').insert({
        user_id: admin.id, type: 'transaction',
        title: `💳 Card payment received — ${sym}${amount.toFixed(2)}`,
        body: `${payerName} paid ${sym}${amount.toFixed(2)} by card for a ${sessionKind} session — ${subject}.`,
        link: 'admin.html?tab=transactions', read: false,
      });
      if (admin.email) {
        await sendEmail(supabaseUrl, 'admin_transaction_alert', admin.email, { subject, amount: amount.toFixed(2), currency: sym, payerName, sessionKind });
      }
    }
  } catch (e) {
    console.error('Admin notification failed (non-critical):', e);
  }
}

async function alertAdminsForReview(supabase: any, title: string, body: string) {
  try {
    const { data: admins } = await supabase.from('users').select('id').contains('roles', ['admin']);
    for (const admin of admins || []) {
      await supabase.from('notifications').insert({ user_id: admin.id, type: 'transaction', title, body, link: 'admin.html?tab=transactions', read: false });
    }
  } catch (e) {
    console.error('Admin review alert failed:', e);
  }
}

// Records a card payment that must NOT confirm a booking (late, duplicate, or orphaned) so it is
// never lost and can be refunded. It is deliberately not linked to the session/group row, so the
// payout job can never pick it up. Returns 'duplicate' when this exact payment was already recorded
// (i.e. a repeat delivery of the same Stripe event), which callers treat as already processed.
async function recordForReview(supabase: any, args: {
  paymentIntentId: string; decision: PaymentDecision; ref: string; type: 'session' | 'group_session';
  payerId?: string | null; payeeId?: string | null; paidCents: number; currency: string;
}): Promise<'recorded' | 'duplicate' | 'error'> {
  const { error } = await supabase.from('payments').insert({
    type: args.type, payer_id: args.payerId ?? null, payee_id: args.payeeId ?? null,
    amount: args.paidCents / 100, platform_fee: 0, tutor_payout: 0, currency: args.currency,
    stripe_payment_intent_id: args.paymentIntentId, status: 'needs_review', paid_at: new Date().toISOString(),
    flagged: true, flag_reason: reviewReason(args.decision, args.ref).slice(0, 250),
  });
  if (!error) return 'recorded';
  if (isDuplicateKeyError(error)) return 'duplicate';
  console.error('Could not record payment for review:', error.message, args);
  return 'error';
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function verifyStripeSignature(rawBody: string, sigHeader: string | null, secret: string): Promise<boolean> {
  // Fail closed: without a configured signing secret we cannot verify anything, so reject.
  if (!secret || !sigHeader) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') signatures.push(v); // several v1 entries are sent while a secret is being rolled
  }
  if (!timestamp || signatures.length === 0) return false;

  // Reject stale or future-dated events so a captured request can't be replayed later.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

  return signatures.some(sig => safeEqual(computed, sig));
}

const toCents = (v: unknown) => Math.round(Number(v) * 100);

Deno.serve(async (req: Request) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const ok = (b: unknown) => new Response(JSON.stringify(b), { headers: cors });

  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get('stripe-signature');

    const isValid = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.error('Stripe webhook signature verification failed');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: cors });
    }

    const event = JSON.parse(rawBody);

    // checkout.session.completed fires when checkout finishes; for delayed payment methods the
    // money only arrives later (checkout.session.async_payment_succeeded). Only confirm when paid.
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
      return ok({ received: true, ignored: event.type });
    }

    const checkoutSession = event.data.object;
    if (checkoutSession.payment_status !== 'paid') {
      return ok({ received: true, waiting_for_payment: checkoutSession.payment_status });
    }

    const paymentIntentId = checkoutSession.payment_intent;
    const sessionId = checkoutSession.metadata?.session_id;
    const groupParticipantId = checkoutSession.metadata?.group_participant_id;
    const paidCents = Number(checkoutSession.amount_total);
    const paidCurrency = String(checkoutSession.currency || '').toUpperCase();

    if (!sessionId && !groupParticipantId) {
      console.error('Stripe webhook: no session_id or group_participant_id in metadata');
      return new Response(JSON.stringify({ error: 'Missing metadata' }), { status: 400, headers: cors });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const feeRate = await getPlatformFeeRate(supabase);

    // The same payment intent can never be recorded twice (Stripe retries deliveries).
    if (paymentIntentId) {
      const { data: dup } = await supabase.from('payments').select('id').eq('stripe_payment_intent_id', paymentIntentId).limit(1);
      if (dup && dup.length > 0) return ok({ received: true, already_processed: true });
    }

    if (groupParticipantId) {
      const { data: participant } = await supabase.from('group_session_participants')
        .select('*, group_sessions(*)').eq('id', groupParticipantId).maybeSingle();

      const decision = groupSeatPaymentDecision(participant);
      if (decision !== 'confirm') {
        // Late, second or orphaned payment: never confirm — record it so it can be refunded.
        const rec = await recordForReview(supabase, {
          paymentIntentId, decision, ref: `group seat ${groupParticipantId}`, type: 'group_session',
          payerId: participant?.student_id, payeeId: participant?.group_sessions?.tutor_id,
          paidCents, currency: paidCurrency || 'EUR',
        });
        if (rec === 'duplicate') return ok({ received: true, already_processed: true });
        if (rec === 'error') return new Response(JSON.stringify({ error: 'Could not record payment' }), { status: 500, headers: cors });
        await alertAdminsForReview(supabase, '⚠️ Card payment needs a refund', `${reviewReason(decision, `group seat ${groupParticipantId}`)}. Stripe payment ${paymentIntentId}: refund it in the Stripe dashboard with "reverse transfer" ticked.`);
        return ok({ received: true, needs_review: true, reason: decision });
      }

      const gs = participant.group_sessions;
      const price = Number(gs.price_per_student);
      const currency = (gs.currency || 'EUR').toUpperCase();
      if (paidCents !== toCents(price) || paidCurrency !== currency) {
        console.error('Group card payment amount mismatch — needs manual review', { groupParticipantId, paidCents, paidCurrency, price, currency, paymentIntentId });
        await alertAdminsForReview(supabase, '⚠️ Card payment needs review', `A group session card payment (${paymentIntentId}) didn't match the expected amount. Check it in Stripe before confirming.`);
        return ok({ received: true, needs_review: true });
      }

      const platformFee = parseFloat((price * feeRate).toFixed(2));
      const tutorPayout = parseFloat((price * (1 - feeRate)).toFixed(2));

      // Record the payment FIRST. The unique index on stripe_payment_intent_id makes this the lock:
      // if two deliveries of the same event race, only one insert succeeds and the other stops here.
      const { data: payRow, error: payInsErr } = await supabase.from('payments').insert({
        group_session_id: gs.id, payer_id: participant.student_id, payee_id: gs.tutor_id,
        type: 'group_session', amount: price, platform_fee: platformFee, tutor_payout: tutorPayout,
        currency: gs.currency || 'EUR', stripe_payment_intent_id: paymentIntentId,
        status: 'paid', paid_at: new Date().toISOString(),
      }).select('id').single();
      if (payInsErr) {
        if (isDuplicateKeyError(payInsErr)) return ok({ received: true, already_processed: true });
        console.error('Could not record group card payment — Stripe will retry:', payInsErr.message);
        return new Response(JSON.stringify({ error: 'Could not record payment' }), { status: 500, headers: cors });
      }

      // Only a seat that is still awaiting payment may be confirmed (it can expire in the meantime).
      const { data: seatRows } = await supabase.from('group_session_participants')
        .update({ status: 'confirmed', payment_due_at: null })
        .eq('id', groupParticipantId).eq('status', 'awaiting_payment').select('id');
      if (!seatRows || seatRows.length === 0) {
        await supabase.from('payments').update({
          status: 'needs_review', flagged: true, group_session_id: null,
          flag_reason: reviewReason('not_awaiting_payment', `group seat ${groupParticipantId}`).slice(0, 250),
        }).eq('id', payRow.id);
        await alertAdminsForReview(supabase, '⚠️ Card payment needs a refund', `${reviewReason('not_awaiting_payment', `group seat ${groupParticipantId}`)}. Stripe payment ${paymentIntentId}: refund it in the Stripe dashboard with "reverse transfer" ticked.`);
        return ok({ received: true, needs_review: true, reason: 'not_awaiting_payment' });
      }

      await supabase.from('notifications').insert([
        { user_id: participant.student_id, type: 'payment_confirmed', title: '✅ Payment confirmed!', body: `You're in for the ${gs.subject} group session with ${gs.tutor_name}. If the group doesn't reach 2 paid students by 12 hours before the session, you'll be automatically refunded.`, link: 'student-dashboard.html', read: false },
        { user_id: gs.tutor_id, type: 'payment_received', title: '💰 Payment received!', body: `${participant.student_name} has joined and paid for your ${gs.subject} group session.`, link: 'tutor-dashboard.html?tab=groupSessions', read: false },
      ]);

      try {
        const { data: studentUser } = await supabase.from('users').select('email').eq('id', participant.student_id).single();
        const { data: tutorUser } = await supabase.from('users').select('email').eq('id', gs.tutor_id).single();
        const emailData = { studentName: participant.student_name, tutorName: gs.tutor_name, subject: gs.subject, date: gs.scheduled_date ? new Date(gs.scheduled_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD', time: gs.scheduled_time || '', duration: gs.duration_minutes || 60 };
        if (studentUser?.email) await sendEmail(supabaseUrl, 'booking_confirmed', studentUser.email, emailData);
        if (tutorUser?.email) await sendEmail(supabaseUrl, 'payment_received', tutorUser.email, emailData);
      } catch (e) { console.error('Email failed (non-critical):', e); }

      await notifyAdmins(supabase, supabaseUrl, gs.subject, price, gs.currency || 'EUR', participant.student_name, 'group');

      return ok({ received: true });
    }

    const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();

    const decision = sessionPaymentDecision(session);
    if (decision !== 'confirm') {
      // Late, second or orphaned payment: never confirm — record it so it can be refunded.
      const rec = await recordForReview(supabase, {
        paymentIntentId, decision, ref: `booking ${sessionId}`, type: 'session',
        payerId: session?.student_id, payeeId: session?.tutor_id,
        paidCents, currency: paidCurrency || 'EUR',
      });
      if (rec === 'duplicate') return ok({ received: true, already_processed: true });
      if (rec === 'error') return new Response(JSON.stringify({ error: 'Could not record payment' }), { status: 500, headers: cors });
      await alertAdminsForReview(supabase, '⚠️ Card payment needs a refund', `${reviewReason(decision, `booking ${sessionId}`)}${session?.subject ? ` (${session.subject})` : ''}. Stripe payment ${paymentIntentId}: refund it in the Stripe dashboard with "reverse transfer" ticked.`);
      return ok({ received: true, needs_review: true, reason: decision });
    }

    const price = Number(session.price);
    const currency = (session.currency || 'EUR').toUpperCase();
    const discount = Number(session.pending_discount_amount || 0);
    const discountSource = session.pending_discount_source as 'referral_welcome' | 'credit_balance' | null;
    const expectedCents = toCents(price) - toCents(discount);

    if (paidCents !== expectedCents || paidCurrency !== currency) {
      console.error('Card payment amount mismatch — needs manual review', { sessionId, paidCents, expectedCents, paidCurrency, currency, paymentIntentId });
      await alertAdminsForReview(supabase, '⚠️ Card payment needs review', `A card payment for the ${session.subject} session (${paymentIntentId}) didn't match the expected amount, so the booking wasn't confirmed automatically. Check it in Stripe.`);
      return ok({ received: true, needs_review: true });
    }

    // The discount was capped at the platform fee when checkout was created, so this never goes negative.
    const platformFee = Math.max(0, parseFloat((price * feeRate - discount).toFixed(2)));
    const tutorPayout = parseFloat((price * (1 - feeRate)).toFixed(2));

    // Record the payment FIRST. The unique index on stripe_payment_intent_id makes this the lock:
    // if two deliveries of the same event race, only one insert succeeds and the other stops here —
    // before credit is deducted or emails are sent a second time.
    const { data: payRow, error: payInsErr } = await supabase.from('payments').insert({
      session_id: sessionId, payer_id: session.student_id, payee_id: session.tutor_id,
      type: 'session', amount: price, platform_fee: platformFee, tutor_payout: tutorPayout,
      discount_amount: discount,
      currency: session.currency || 'EUR', stripe_payment_intent_id: paymentIntentId,
      status: 'paid', paid_at: new Date().toISOString(),
    }).select('id').single();
    if (payInsErr) {
      if (isDuplicateKeyError(payInsErr)) return ok({ received: true, already_processed: true });
      console.error('Could not record card payment — Stripe will retry:', payInsErr.message);
      return new Response(JSON.stringify({ error: 'Could not record payment' }), { status: 500, headers: cors });
    }

    // Only a booking that is still awaiting payment may be confirmed (the expiry job may have
    // released it between the check above and now).
    const { data: confirmedRows } = await supabase.from('sessions').update({
      status: 'confirmed', payment_status: 'paid', payment_due_at: null,
      pending_discount_amount: null, pending_discount_source: null,
    }).eq('id', sessionId).eq('status', 'awaiting_payment').select('id');
    if (!confirmedRows || confirmedRows.length === 0) {
      await supabase.from('payments').update({
        status: 'needs_review', flagged: true, session_id: null, tutor_payout: 0, platform_fee: 0,
        flag_reason: reviewReason('not_awaiting_payment', `booking ${sessionId}`).slice(0, 250),
      }).eq('id', payRow.id);
      await alertAdminsForReview(supabase, '⚠️ Card payment needs a refund', `${reviewReason('not_awaiting_payment', `booking ${sessionId}`)} (${session.subject}). Stripe payment ${paymentIntentId}: refund it in the Stripe dashboard with "reverse transfer" ticked.`);
      return ok({ received: true, needs_review: true, reason: 'not_awaiting_payment' });
    }

    if (discount > 0 && discountSource === 'referral_welcome') {
      const { data: referral } = await supabase.from('referrals')
        .select('id, invitee_discount_amount').eq('invitee_id', session.student_id).eq('invitee_discount_applied', false).maybeSingle();
      if (referral) {
        // Claim the welcome discount once; only the run that claims it records the remainder.
        const { data: claimed } = await supabase.from('referrals').update({
          invitee_discount_applied: true,
          invitee_discount_applied_session_id: sessionId,
        }).eq('id', referral.id).eq('invitee_discount_applied', false).select('id');
        if (claimed && claimed.length > 0) {
          await supabase.from('credit_transactions').insert({
            user_id: session.student_id, amount: -discount, type: 'referral_discount_redeemed',
            reference_referral_id: referral.id, reference_session_id: sessionId,
            description: 'Referral welcome discount applied to booking',
          });
          // The part of the welcome discount not used on this booking is kept as account credit.
          const remainder = Math.round((Number(referral.invitee_discount_amount) - discount) * 100) / 100;
          if (remainder > 0) {
            await supabase.rpc('add_credit_balance', { p_user_id: session.student_id, p_amount: remainder });
            await supabase.from('credit_transactions').insert({
              user_id: session.student_id, amount: remainder, type: 'referral_welcome_credit',
              reference_referral_id: referral.id, reference_session_id: sessionId,
              description: 'Unused part of your welcome discount, kept as account credit',
            });
          }
        }
      }
    } else if (discount > 0 && discountSource === 'credit_balance') {
      await supabase.rpc('deduct_credit_balance', { p_user_id: session.student_id, p_amount: discount });
      await supabase.from('credit_transactions').insert({
        user_id: session.student_id, amount: -discount, type: 'credit_redeemed',
        reference_session_id: sessionId, description: 'Credit balance applied to booking',
      });
    }

    const sym = currency === 'USD' ? '$' : '€';
    await supabase.from('notifications').insert([
      { user_id: session.student_id, type: 'payment_confirmed', title: '✅ Payment confirmed!', body: discount > 0 ? `Your session with ${session.tutor_name} is all set. A ${sym}${discount.toFixed(2)} credit was applied.` : `Your session with ${session.tutor_name} is all set.`, link: 'student-dashboard.html', read: false },
      { user_id: session.tutor_id, type: 'payment_received', title: '💰 Payment received!', body: `${session.student_name} has completed payment for your ${session.subject} session.`, link: 'tutor-dashboard.html', read: false },
    ]);

    try {
      const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
      const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
      const emailData = { studentName: session.student_name, tutorName: session.tutor_name, subject: session.subject, date: session.scheduled_date ? new Date(session.scheduled_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD', time: session.scheduled_time || '', duration: session.duration_minutes || 60 };
      if (studentUser?.email) await sendEmail(supabaseUrl, 'booking_confirmed', studentUser.email, emailData);
      if (tutorUser?.email) await sendEmail(supabaseUrl, 'payment_received', tutorUser.email, emailData);
    } catch (e) { console.error('Email failed (non-critical):', e); }

    await notifyAdmins(supabase, supabaseUrl, session.subject, price - discount, session.currency || 'EUR', session.student_name, 'individual');

    return ok({ received: true });

  } catch (err) {
    console.error('stripe-webhook error:', err);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
