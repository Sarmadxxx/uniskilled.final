import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { paypalCheckoutEnabled, PAYPAL_DISABLED_MESSAGE } from './paypal-gate.ts';

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET') ?? '';
// PAYPAL_ENV secret: 'live' = real money; anything else (or unset) = PayPal sandbox
const PAYPAL_BASE = Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const MIN_CHARGE = 1.00; // never let a discount take the actual PayPal charge to zero

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

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // PayPal checkout is off unless explicitly enabled AND live — see paypal-gate.ts.
  if (!paypalCheckoutEnabled((k) => Deno.env.get(k))) {
    return new Response(JSON.stringify({ error: PAYPAL_DISABLED_MESSAGE, paypal_disabled: true }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { session_id, group_participant_id } = await req.json();
    if (!session_id && !group_participant_id) {
      return new Response(JSON.stringify({ error: 'session_id or group_participant_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    let price: number, subject: string, referenceId: string, currency: string;
    let studentId: string | null = null;

    if (group_participant_id) {
      // Group session bookings don't participate in the referral-discount system in this version —
      // group pricing/refund math is already its own scope, kept intentionally separate here.
      const { data: participant, error: pErr } = await supabase.from('group_session_participants')
        .select('id, status, payment_due_at, group_session_id, group_sessions(price_per_student, subject, currency)')
        .eq('id', group_participant_id).single();

      if (pErr || !participant) {
        return new Response(JSON.stringify({ error: 'Group session spot not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (participant.status !== 'awaiting_payment') {
        return new Response(JSON.stringify({ error: 'This spot is not currently awaiting payment.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (participant.payment_due_at && new Date(participant.payment_due_at).getTime() < Date.now()) {
        return new Response(JSON.stringify({ error: 'The 24-hour payment window for this spot has expired.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      price = Number(participant.group_sessions.price_per_student);
      subject = participant.group_sessions.subject;
      currency = participant.group_sessions.currency || 'EUR';
      referenceId = group_participant_id;

      const token = await getToken();
      const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: referenceId,
            description: `UniSkilled tutoring session — ${subject || 'Session'}`,
            amount: { currency_code: currency, value: price.toFixed(2) },
          }],
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        console.error('PayPal order creation failed:', JSON.stringify(orderData));
        return new Response(JSON.stringify({ error: orderData.message || 'Could not start PayPal checkout' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ order_id: orderData.id, full_price: price, discount_applied: 0, charge_amount: price }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: session, error: sessErr } = await supabase.from('sessions')
      .select('id, price, status, payment_due_at, subject, currency, student_id')
      .eq('id', session_id).single();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (session.status !== 'awaiting_payment') {
      return new Response(JSON.stringify({ error: 'This booking is not currently awaiting payment.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (session.payment_due_at && new Date(session.payment_due_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'The 24-hour payment window for this booking has expired.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    price = Number(session.price);
    subject = session.subject;
    currency = session.currency || 'EUR';
    referenceId = session_id;
    studentId = session.student_id;

    // ── Discount: unused referral welcome credit first, then account credit ──
    // A discount can never exceed UniSkilled's platform fee on this booking, so no booking ever
    // costs the platform money (the tutor's 80% is always paid in full). Whatever isn't used here
    // stays as account credit for later bookings (capture-paypal-order converts welcome remainder).
    const feeRate = await getPlatformFeeRate(supabase);
    const maxDiscount = Math.max(0, Math.min(Math.floor(price * feeRate * 100) / 100, price - MIN_CHARGE));

    let discount = 0;
    let discountSource: 'referral_welcome' | 'credit_balance' | null = null;

    if (studentId) {
      const { data: referral } = await supabase.from('referrals')
        .select('id, invitee_discount_amount, invitee_discount_applied')
        .eq('invitee_id', studentId).eq('invitee_discount_applied', false).maybeSingle();

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
    }

    discount = discount > 0 ? Math.round(discount * 100) / 100 : 0;
    if (discount <= 0) discountSource = null;
    const chargeAmount = discount > 0 ? Math.round((price - discount) * 100) / 100 : price;

    // Lock the decision to the session row so capture-paypal-order applies exactly this,
    // never a value trusted from the client.
    await supabase.from('sessions').update({
      pending_discount_amount: discount > 0 ? discount : null,
      pending_discount_source: discount > 0 ? discountSource : null,
    }).eq('id', session_id);

    const token = await getToken();

    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: referenceId,
          description: `UniSkilled tutoring session — ${subject || 'Session'}`,
          amount: { currency_code: currency, value: chargeAmount.toFixed(2) },
        }],
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      console.error('PayPal order creation failed:', JSON.stringify(orderData));
      return new Response(JSON.stringify({ error: orderData.message || 'Could not start PayPal checkout' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      order_id: orderData.id, full_price: price, discount_applied: discount, discount_source: discountSource, charge_amount: chargeAmount,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('create-paypal-order error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
