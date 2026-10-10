import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const MIN_CHARGE = 1.00; // never let a discount take the card charge to zero

async function getPlatformFeeRate(supabase: any): Promise<number> {
  const { data } = await supabase.from('platform_settings').select('value').eq('key', 'platform_fee_rate').single();
  const rate = parseFloat(data?.value);
  return isNaN(rate) ? 0.20 : rate;
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
    const { session_id, group_participant_id } = await req.json();
    if (!session_id && !group_participant_id) return json({ error: 'session_id or group_participant_id required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const feeRate = await getPlatformFeeRate(supabase);

    let price: number, subject: string, currency: string, referenceId: string, metadataKey: string, tutorId: string;
    let studentId: string | null = null;

    if (group_participant_id) {
      const { data: participant, error: pErr } = await supabase.from('group_session_participants')
        .select('id, status, payment_due_at, group_sessions(price_per_student, subject, currency, tutor_id)')
        .eq('id', group_participant_id).single();

      if (pErr || !participant) return json({ error: 'Group session spot not found' }, 404);
      if (participant.status !== 'awaiting_payment') return json({ error: 'This spot is not currently awaiting payment.' }, 400);
      if (participant.payment_due_at && new Date(participant.payment_due_at).getTime() < Date.now()) {
        return json({ error: 'The 24-hour payment window for this spot has expired.' }, 400);
      }

      price = Number(participant.group_sessions.price_per_student);
      subject = participant.group_sessions.subject;
      currency = (participant.group_sessions.currency || 'EUR').toLowerCase();
      tutorId = participant.group_sessions.tutor_id;
      referenceId = group_participant_id;
      metadataKey = 'group_participant_id';

    } else {
      const { data: session, error: sessErr } = await supabase.from('sessions')
        .select('id, price, status, payment_due_at, subject, currency, tutor_id, student_id')
        .eq('id', session_id).single();

      if (sessErr || !session) return json({ error: 'Session not found' }, 404);
      if (session.status !== 'awaiting_payment') return json({ error: 'This booking is not currently awaiting payment.' }, 400);
      if (session.payment_due_at && new Date(session.payment_due_at).getTime() < Date.now()) {
        return json({ error: 'The 24-hour payment window for this booking has expired.' }, 400);
      }

      price = Number(session.price);
      subject = session.subject;
      currency = (session.currency || 'EUR').toLowerCase();
      tutorId = session.tutor_id;
      studentId = session.student_id;
      referenceId = session_id;
      metadataKey = 'session_id';
    }

    const { data: tp } = await supabase.from('tutor_profiles').select('stripe_account_id, stripe_account_status').eq('user_id', tutorId).single();
    if (!tp?.stripe_account_id || tp.stripe_account_status !== 'active') {
      return json({ error: "This tutor hasn't finished setting up payouts yet, so payment can't be taken. Please message them — your booking is kept until the payment window ends." }, 400);
    }

    // ── Discount (one-to-one bookings only): unused referral welcome credit first, then account credit.
    // Capped at UniSkilled's platform fee on this booking, so the tutor's 80% is always paid in full
    // and a discount can never make the platform fee negative. Unused credit stays for later bookings.
    let discount = 0;
    let discountSource: 'referral_welcome' | 'credit_balance' | null = null;
    if (studentId) {
      const maxDiscount = Math.max(0, Math.min(Math.floor(price * feeRate * 100) / 100, price - MIN_CHARGE));
      const { data: referral } = await supabase.from('referrals')
        .select('id, invitee_discount_amount').eq('invitee_id', studentId).eq('invitee_discount_applied', false).maybeSingle();
      if (referral) {
        discount = Math.min(Number(referral.invitee_discount_amount), maxDiscount);
        discountSource = 'referral_welcome';
      } else {
        const { data: user } = await supabase.from('users').select('credit_balance').eq('id', studentId).maybeSingle();
        const balance = Number(user?.credit_balance || 0);
        if (balance > 0) {
          discount = Math.min(balance, maxDiscount);
          discountSource = 'credit_balance';
        }
      }
      discount = discount > 0 ? Math.round(discount * 100) / 100 : 0;
      if (discount <= 0) discountSource = null;

      // Lock the decision to the booking so the webhook applies exactly this, never a client value.
      await supabase.from('sessions').update({
        pending_discount_amount: discount > 0 ? discount : null,
        pending_discount_source: discount > 0 ? discountSource : null,
      }).eq('id', referenceId);
    }

    const priceCents = Math.round(price * 100);
    const discountCents = Math.round(discount * 100);
    const chargeCents = priceCents - discountCents;
    // Destination charge: the tutor's account receives charge − application fee = exactly 80% of the full price.
    const applicationFeeCents = Math.max(0, Math.round(priceCents * feeRate) - discountCents);

    const siteUrl = 'https://uniskilled.com';
    const refParam = metadataKey === 'session_id' ? 'session' : 'group_participant';
    const body = new URLSearchParams({
      'mode': 'payment',
      'success_url': `${siteUrl}/complete-payment.html?${refParam}=${referenceId}&stripe_success=1`,
      'cancel_url': `${siteUrl}/complete-payment.html?${refParam}=${referenceId}`,
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][product_data][name]': `UniSkilled tutoring session — ${subject || 'Session'}`,
      'line_items[0][price_data][unit_amount]': chargeCents.toString(),
      'line_items[0][quantity]': '1',
      [`metadata[${metadataKey}]`]: referenceId,
      'metadata[discount_cents]': discountCents.toString(),
      'payment_intent_data[transfer_data][destination]': tp.stripe_account_id,
      'payment_intent_data[application_fee_amount]': applicationFeeCents.toString(),
      'payment_intent_data[metadata][platform]': 'uniskilled',
      [`payment_intent_data[metadata][${metadataKey}]`]: referenceId,
      'payment_method_types[0]': 'card',
      'payment_method_types[1]': 'klarna',
    });

    const createSession = (b: URLSearchParams) => fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: b.toString(),
    });

    let stripeRes = await createSession(body);
    let checkoutSession = await stripeRes.json();

    if (!stripeRes.ok && checkoutSession.error?.message?.toLowerCase().includes('klarna')) {
      // Klarna isn't available for every amount/currency — retry card-only.
      const fallbackBody = new URLSearchParams(body);
      fallbackBody.delete('payment_method_types[1]');
      stripeRes = await createSession(fallbackBody);
      checkoutSession = await stripeRes.json();
    }

    if (!stripeRes.ok) {
      console.error('Stripe checkout session creation failed:', JSON.stringify(checkoutSession));
      return json({ error: checkoutSession.error?.message || 'Could not start card checkout' }, 500);
    }

    return json({
      checkout_url: checkoutSession.url,
      full_price: price, discount_applied: discount, discount_source: discountSource, charge_amount: chargeCents / 100,
    });

  } catch (err) {
    console.error('create-stripe-checkout error:', err);
    return json({ error: String(err) }, 500);
  }
});
