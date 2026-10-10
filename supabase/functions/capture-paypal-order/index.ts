import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET') ?? '';
// PAYPAL_ENV secret: 'live' = real money; anything else (or unset) = PayPal sandbox
const PAYPAL_BASE = Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function getToken(): Promise<string> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function getPlatformFeeRate(supabase: any): Promise<number> {
  const { data } = await supabase.from('platform_settings').select('value').eq('key', 'platform_fee_rate').single();
  const rate = parseFloat(data?.value);
  return isNaN(rate) ? 0.20 : rate;
}

async function sendEmail(supabaseUrl: string, type: string, to: string, data: any) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}` },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (e) {
    console.error('Email dispatch failed (non-critical):', e);
  }
}

async function notifyAdmins(supabase: any, supabaseUrl: string, subject: string, amount: number, currency: string, payerName: string, sessionKind: string) {
  try {
    const { data: admins } = await supabase.from('users').select('id, email').contains('roles', ['admin']);
    const sym = currency === 'USD' ? '$' : '€';
    for (const admin of admins || []) {
      await supabase.from('notifications').insert({
        user_id: admin.id, type: 'transaction',
        title: `💰 Payment received — ${sym}${amount.toFixed(2)}`,
        body: `${payerName} paid ${sym}${amount.toFixed(2)} for a ${sessionKind} session — ${subject}.`,
        link: 'admin.html?tab=transactions', read: false,
      });
      if (admin.email) {
        await sendEmail(supabaseUrl, 'admin_transaction_alert', admin.email, {
          subject, amount: amount.toFixed(2), currency: sym, payerName, sessionKind,
        });
      }
    }
  } catch (e) {
    console.error('Admin notification failed (non-critical):', e);
  }
}

const toCents = (v: unknown) => Math.round(Number(v) * 100);

// SECURITY: an order may only confirm the booking it was created for, at exactly the
// price that booking costs. Without this, a cheap paid order could be replayed against
// an expensive booking. Checked BEFORE capturing, and the captured amount is re-checked after.
async function verifyOrderBeforeCapture(token: string, orderId: string, expectedRef: string, expectedAmount: number, expectedCurrency: string): Promise<string | null> {
  if (!/^[A-Z0-9]{5,40}$/i.test(String(orderId))) return 'Invalid PayPal order reference.';
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const order = await res.json();
  if (!res.ok) return 'PayPal order not found.';
  const pu = order?.purchase_units?.[0];
  if (!pu || order.purchase_units.length !== 1) return 'Unexpected PayPal order shape.';
  if (pu.reference_id !== expectedRef) return 'This PayPal order does not belong to this booking.';
  if (String(pu.amount?.currency_code).toUpperCase() !== expectedCurrency.toUpperCase()) return 'Currency mismatch — please restart checkout.';
  if (toCents(pu.amount?.value) !== toCents(expectedAmount)) return 'Amount mismatch — please restart checkout.';
  if (order.status !== 'APPROVED') return 'This PayPal order is not ready to be captured.';
  return null;
}

function checkCapturedAmount(captureObj: any, expectedAmount: number, expectedCurrency: string): boolean {
  return toCents(captureObj?.amount?.value) === toCents(expectedAmount)
    && String(captureObj?.amount?.currency_code).toUpperCase() === expectedCurrency.toUpperCase();
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { order_id, session_id, group_participant_id } = await req.json();
    if (!order_id || (!session_id && !group_participant_id)) {
      return json({ error: 'order_id and (session_id or group_participant_id) required' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const feeRate = await getPlatformFeeRate(supabase);

    // An order already recorded against any payment can never be reused.
    const orderAlreadyUsed = async () => {
      const { data } = await supabase.from('payments').select('id').eq('paypal_order_id', order_id).limit(1);
      return !!(data && data.length > 0);
    };

    if (group_participant_id) {
      const { data: participant, error: pErr } = await supabase.from('group_session_participants')
        .select('*, group_sessions(*)').eq('id', group_participant_id).single();

      if (pErr || !participant) return json({ error: 'Group session spot not found' }, 404);
      if (participant.status === 'confirmed') return json({ success: true, already_processed: true });
      if (participant.status !== 'awaiting_payment') return json({ error: 'This spot is no longer awaiting payment.' }, 400);
      if (await orderAlreadyUsed()) return json({ error: 'This PayPal order has already been used.' }, 400);

      const gs = participant.group_sessions;
      const price = Number(gs.price_per_student);
      const currency = (gs.currency || 'EUR').toUpperCase();

      const token = await getToken();
      const verifyErr = await verifyOrderBeforeCapture(token, order_id, group_participant_id, price, currency);
      if (verifyErr) {
        console.error('capture-paypal-order rejected (group):', verifyErr, { order_id, group_participant_id });
        return json({ error: verifyErr }, 400);
      }

      const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(order_id)}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `cap_${order_id}` },
      });
      const captureData = await captureRes.json();
      const captureObj = captureData?.purchase_units?.[0]?.payments?.captures?.[0];
      const captureStatus = captureObj?.status;
      const captureId = captureObj?.id;

      if (!captureRes.ok || captureData.status !== 'COMPLETED' || captureStatus !== 'COMPLETED') {
        console.error('PayPal capture failed:', JSON.stringify(captureData));
        return json({ error: captureData.message || 'Payment could not be captured. Please try again.' }, 500);
      }
      if (!checkCapturedAmount(captureObj, price, currency)) {
        console.error('Captured amount mismatch (group) — needs manual review:', JSON.stringify(captureObj));
        return json({ error: 'Payment amount did not match. Please contact support.' }, 500);
      }

      const platformFee = parseFloat((price * feeRate).toFixed(2));
      const tutorPayout = parseFloat((price * (1 - feeRate)).toFixed(2));

      await supabase.from('group_session_participants').update({
        status: 'confirmed', paypal_order_id: order_id, payment_due_at: null,
      }).eq('id', group_participant_id);

      await supabase.from('payments').insert({
        group_session_id: gs.id,
        payer_id: participant.student_id,
        payee_id: gs.tutor_id,
        type: 'group_session',
        amount: price,
        platform_fee: platformFee,
        tutor_payout: tutorPayout,
        currency: gs.currency || 'EUR',
        paypal_order_id: order_id,
        paypal_capture_id: captureId,
        status: 'paid',
        paid_at: new Date().toISOString(),
      });

      await supabase.from('notifications').insert([
        {
          user_id: participant.student_id, type: 'payment_confirmed',
          title: '✅ Payment confirmed!',
          body: `You're in for the ${gs.subject} group session with ${gs.tutor_name}. If the group doesn't reach 2 paid students by 12 hours before the session, you'll be automatically refunded.`,
          link: 'student-dashboard.html', read: false,
        },
        {
          user_id: gs.tutor_id, type: 'payment_received',
          title: '💰 Payment received!',
          body: `${participant.student_name} has joined and paid for your ${gs.subject} group session.`,
          link: 'tutor-dashboard.html?tab=groupSessions', read: false,
        },
      ]);

      try {
        const { data: studentUser } = await supabase.from('users').select('email').eq('id', participant.student_id).single();
        const { data: tutorUser } = await supabase.from('users').select('email').eq('id', gs.tutor_id).single();
        const emailData = {
          studentName: participant.student_name, tutorName: gs.tutor_name, subject: gs.subject,
          date: gs.scheduled_date ? new Date(gs.scheduled_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD',
          time: gs.scheduled_time || '', duration: gs.duration_minutes || 60,
        };
        if (studentUser?.email) await sendEmail(supabaseUrl, 'booking_confirmed', studentUser.email, emailData);
        if (tutorUser?.email) await sendEmail(supabaseUrl, 'payment_received', tutorUser.email, emailData);
      } catch (e) {
        console.error('Email dispatch failed (non-critical):', e);
      }

      await notifyAdmins(supabase, supabaseUrl, gs.subject, price, gs.currency || 'EUR', participant.student_name, 'group');

      return json({ success: true });
    }

    const { data: session, error: sessErr } = await supabase.from('sessions')
      .select('*').eq('id', session_id).single();

    if (sessErr || !session) return json({ error: 'Session not found' }, 404);
    if (session.status === 'confirmed' && session.payment_status === 'paid') return json({ success: true, already_processed: true });
    if (session.status !== 'awaiting_payment') {
      return json({ error: 'This booking is no longer awaiting payment (it may have expired or been cancelled).' }, 400);
    }
    if (await orderAlreadyUsed()) return json({ error: 'This PayPal order has already been used.' }, 400);

    const price = Number(session.price);
    const discount = Number(session.pending_discount_amount || 0);
    const discountSource = session.pending_discount_source as 'referral_welcome' | 'credit_balance' | null;
    const currency = (session.currency || 'EUR').toUpperCase();
    // Same rounding create-paypal-order uses for the charged amount.
    const expectedCharge = discount > 0 ? Math.round((price - discount) * 100) / 100 : price;

    const token = await getToken();
    const verifyErr = await verifyOrderBeforeCapture(token, order_id, session_id, expectedCharge, currency);
    if (verifyErr) {
      console.error('capture-paypal-order rejected (session):', verifyErr, { order_id, session_id });
      return json({ error: verifyErr }, 400);
    }

    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(order_id)}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `cap_${order_id}` },
    });
    const captureData = await captureRes.json();
    const captureObj = captureData?.purchase_units?.[0]?.payments?.captures?.[0];
    const captureStatus = captureObj?.status;
    const captureId = captureObj?.id;

    if (!captureRes.ok || captureData.status !== 'COMPLETED' || captureStatus !== 'COMPLETED') {
      console.error('PayPal capture failed:', JSON.stringify(captureData));
      return json({ error: captureData.message || 'Payment could not be captured. Please try again.' }, 500);
    }
    if (!checkCapturedAmount(captureObj, expectedCharge, currency)) {
      console.error('Captured amount mismatch (session) — needs manual review:', JSON.stringify(captureObj));
      return json({ error: 'Payment amount did not match. Please contact support.' }, 500);
    }

    // The discount is capped at the platform fee when the order is created, so this never goes negative.
    const platformFee = Math.max(0, parseFloat((price * feeRate - discount).toFixed(2)));
    const tutorPayout = parseFloat((price * (1 - feeRate)).toFixed(2));

    await supabase.from('sessions').update({
      status: 'confirmed',
      payment_status: 'paid',
      paypal_order_id: order_id,
      payment_due_at: null,
      pending_discount_amount: null,
      pending_discount_source: null,
    }).eq('id', session_id);

    await supabase.from('payments').insert({
      session_id: session_id,
      payer_id: session.student_id,
      payee_id: session.tutor_id,
      type: 'session',
      amount: price,
      platform_fee: platformFee,
      tutor_payout: tutorPayout,
      discount_amount: discount,
      currency: session.currency || 'EUR',
      paypal_order_id: order_id,
      paypal_capture_id: captureId,
      status: 'paid',
      paid_at: new Date().toISOString(),
    });

    if (discount > 0 && discountSource === 'referral_welcome') {
      const { data: referral } = await supabase.from('referrals')
        .select('id, invitee_discount_amount').eq('invitee_id', session.student_id).eq('invitee_discount_applied', false).maybeSingle();
      if (referral) {
        // Claim the welcome discount once; only the run that claims it records the remainder.
        const { data: claimed } = await supabase.from('referrals').update({
          invitee_discount_applied: true,
          invitee_discount_applied_session_id: session_id,
        }).eq('id', referral.id).eq('invitee_discount_applied', false).select('id');
        if (claimed && claimed.length > 0) {
          await supabase.from('credit_transactions').insert({
            user_id: session.student_id, amount: -discount, type: 'referral_discount_redeemed',
            reference_referral_id: referral.id, reference_session_id: session_id,
            description: `Referral welcome discount applied to booking`,
          });
          // The part of the welcome discount not used on this booking is kept as account credit.
          const remainder = Math.round((Number(referral.invitee_discount_amount) - discount) * 100) / 100;
          if (remainder > 0) {
            await supabase.rpc('add_credit_balance', { p_user_id: session.student_id, p_amount: remainder });
            await supabase.from('credit_transactions').insert({
              user_id: session.student_id, amount: remainder, type: 'referral_welcome_credit',
              reference_referral_id: referral.id, reference_session_id: session_id,
              description: 'Unused part of your welcome discount, kept as account credit',
            });
          }
        }
      }
    } else if (discount > 0 && discountSource === 'credit_balance') {
      await supabase.rpc('deduct_credit_balance', { p_user_id: session.student_id, p_amount: discount });
      await supabase.from('credit_transactions').insert({
        user_id: session.student_id, amount: -discount, type: 'credit_redeemed',
        reference_session_id: session_id, description: 'Credit balance applied to booking',
      });
    }

    await supabase.from('notifications').insert([
      {
        user_id: session.student_id, type: 'payment_confirmed',
        title: '✅ Payment confirmed!',
        body: discount > 0
          ? `Your session with ${session.tutor_name} is all set. A ${(session.currency === 'USD' ? '$' : '€')}${discount.toFixed(2)} discount was applied.`
          : `Your session with ${session.tutor_name} is all set.`,
        link: 'student-dashboard.html', read: false,
      },
      {
        user_id: session.tutor_id, type: 'payment_received',
        title: '💰 Payment received!',
        body: `${session.student_name} has completed payment for your ${session.subject} session.`,
        link: 'tutor-dashboard.html', read: false,
      },
    ]);

    try {
      const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
      const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
      const emailData = {
        studentName: session.student_name, tutorName: session.tutor_name, subject: session.subject,
        date: session.scheduled_date ? new Date(session.scheduled_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD',
        time: session.scheduled_time || '', duration: session.duration_minutes || 60,
      };
      if (studentUser?.email) await sendEmail(supabaseUrl, 'booking_confirmed', studentUser.email, emailData);
      if (tutorUser?.email) await sendEmail(supabaseUrl, 'payment_received', tutorUser.email, emailData);
    } catch (e) {
      console.error('Email dispatch failed (non-critical):', e);
    }

    await notifyAdmins(supabase, supabaseUrl, session.subject, price - discount, session.currency || 'EUR', session.student_name, 'individual');

    return json({ success: true, discount_applied: discount });

  } catch (err) {
    console.error('capture-paypal-order error:', err);
    return new Response(JSON.stringify({ error: 'Payment could not be completed. Please contact support.' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }
});
