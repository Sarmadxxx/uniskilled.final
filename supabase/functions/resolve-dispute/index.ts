import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET') ?? '';
// PAYPAL_ENV secret: 'live' = real money; anything else (or unset) = PayPal sandbox
const PAYPAL_BASE = Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

// Identity comes from the verified login token, never from the request body.
async function getAuthedUserId(req: Request, supabase: any): Promise<string | null> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function getPaypalToken(): Promise<string> {
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

async function refundPaypalCapture(token: string, captureId: string, amount?: number, currency?: string): Promise<{ ok: boolean; error?: string }> {
  const body: any = {};
  if (amount) body.amount = { value: amount.toFixed(2), currency_code: currency || 'EUR' };
  const res = await fetch(`${PAYPAL_BASE}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error('PayPal refund failed:', JSON.stringify(data)); return { ok: false, error: data.message || 'Refund failed' }; }
  return { ok: true };
}

// Card payments are destination charges: the tutor's share sits in their Stripe account.
// Refunds must reverse that transfer (and our fee) proportionally, otherwise the platform
// pays the whole refund while the tutor keeps their share.
async function refundStripePayment(paymentIntentId: string, amount?: number): Promise<{ ok: boolean; error?: string; refundId?: string }> {
  const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
  });
  const pi = await piRes.json();
  if (!piRes.ok) { console.error('Stripe PI lookup failed:', JSON.stringify(pi)); return { ok: false, error: pi.error?.message || 'Could not load payment' }; }

  const params: Record<string, string> = { payment_intent: paymentIntentId };
  if (amount) params.amount = Math.round(amount * 100).toString();
  if (pi.transfer_data?.destination) {
    params.reverse_transfer = 'true';
    params.refund_application_fee = 'true';
  }
  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `refund_dispute_${paymentIntentId}_${params.amount || 'full'}` },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) { console.error('Stripe refund failed:', JSON.stringify(data)); return { ok: false, error: data.error?.message || 'Refund failed' }; }
  return { ok: true, refundId: data.id };
}

async function refundWhicheverMethodWasUsed(payment: any, amount?: number): Promise<{ ok: boolean; error?: string; refundId?: string }> {
  if (payment?.paypal_capture_id) {
    const token = await getPaypalToken();
    return refundPaypalCapture(token, payment.paypal_capture_id, amount, payment.currency);
  }
  if (payment?.stripe_payment_intent_id) {
    return refundStripePayment(payment.stripe_payment_intent_id, amount);
  }
  return { ok: false, error: 'No payment capture reference found — cannot process refund automatically.' };
}

// A full refund returns the money actually paid; any account credit used on the booking
// is given back as account credit.
async function restoreCreditUsed(supabase: any, payment: any, studentId: string, sessionId: string) {
  const used = Math.round(Number(payment?.discount_amount || 0) * 100) / 100;
  if (!(used > 0)) return;
  try {
    await supabase.rpc('add_credit_balance', { p_user_id: studentId, p_amount: used });
    await supabase.from('credit_transactions').insert({
      user_id: studentId, amount: used, type: 'credit_restored', reference_session_id: sessionId,
      description: 'Credit used on a refunded booking, returned to your account',
    });
  } catch (e) {
    console.error(`Credit restore FAILED — add ${used} manually for user ${studentId}:`, e);
  }
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

Deno.serve(withSentry('resolve-dispute', async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { dispute_id, resolution, resolution_notes, refund_amount } = await req.json();
    if (!dispute_id || !resolution) {
      return new Response(JSON.stringify({ error: 'dispute_id and resolution are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (!['released', 'refunded', 'partial'].includes(resolution)) {
      return new Response(JSON.stringify({ error: 'resolution must be released, refunded, or partial' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const admin_id = await getAuthedUserId(req, supabase);
    if (!admin_id) {
      return new Response(JSON.stringify({ error: 'Not signed in. Please log in again.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: adminUser } = await supabase.from('users').select('roles').eq('id', admin_id).single();
    if (!adminUser?.roles?.includes('admin')) {
      return new Response(JSON.stringify({ error: 'Only admins can resolve disputes.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: dispute, error: dErr } = await supabase.from('disputes').select('*, sessions(*)').eq('id', dispute_id).single();
    if (dErr || !dispute) {
      return new Response(JSON.stringify({ error: 'Dispute not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (dispute.status === 'resolved') {
      return new Response(JSON.stringify({ error: 'This dispute has already been resolved.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const session = dispute.sessions;
    const { data: payment } = await supabase.from('payments').select('*').eq('session_id', session.id).eq('status', 'paid').maybeSingle();

    let refundedAmount = 0;
    let releasedAmount = 0;
    let newTutorPayout: number | null = null;

    if (resolution === 'refunded' || resolution === 'partial') {
      if (!payment) {
        return new Response(JSON.stringify({ error: 'No payment record found for this session — cannot process automatically.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const amountToRefund = resolution === 'partial' ? Number(refund_amount) : Number(payment.amount);
      if (resolution === 'partial' && (!amountToRefund || amountToRefund <= 0 || amountToRefund > Number(payment.amount))) {
        return new Response(JSON.stringify({ error: 'Invalid partial refund amount.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // Claim the payment atomically so a double click can't refund twice or cut the tutor's payout twice.
      const { data: claimed } = await supabase.from('payments').update({ status: 'refund_processing' })
        .eq('id', payment.id).eq('status', 'paid').select('id');
      if (!claimed || claimed.length === 0) {
        return new Response(JSON.stringify({ error: 'This refund is already being processed. Refresh the page in a moment.' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      const result = await refundWhicheverMethodWasUsed(payment, resolution === 'partial' ? amountToRefund : undefined);
      if (!result.ok) {
        await supabase.from('payments').update({ status: 'refund_failed' }).eq('id', payment.id);
        return new Response(JSON.stringify({ error: 'Refund failed: ' + result.error }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      refundedAmount = amountToRefund;

      const paymentUpdate: Record<string, unknown> = { status: resolution === 'partial' ? 'partially_refunded' : 'refunded' };
      // stripe_refund_id lets each refund be matched to Stripe's records
      if (result.refundId) paymentUpdate.stripe_refund_id = result.refundId;

      if (resolution === 'partial') {
        const originalAmount = Number(payment.amount) || 0;
        const originalTutorPayout = Number(payment.tutor_payout) || 0;
        if (originalAmount > 0) {
          const payoutShare = originalTutorPayout / originalAmount;
          newTutorPayout = Math.max(0, Math.round((originalTutorPayout - amountToRefund * payoutShare) * 100) / 100);
          paymentUpdate.tutor_payout = newTutorPayout;
        }
      }

      await supabase.from('payments').update(paymentUpdate).eq('id', payment.id);

      if (resolution === 'refunded') {
        await supabase.from('sessions').update({ status: 'cancelled', refund_outcome: 'full_refund' }).eq('id', session.id);
        await restoreCreditUsed(supabase, payment, session.student_id, session.id);
      }
    }

    if (resolution === 'released') {
      releasedAmount = Number(payment?.tutor_payout || 0);
    } else if (resolution === 'partial') {
      releasedAmount = newTutorPayout ?? 0;
    }

    await supabase.from('disputes').update({
      status: 'resolved',
      resolution,
      resolution_notes: resolution_notes || null,
      admin_id,
      refund_amount: refundedAmount || null,
      release_amount: releasedAmount || null,
      resolved_at: new Date().toISOString(),
    }).eq('id', dispute_id);

    const outcomeText = resolution === 'released'
      ? 'The tutor will be paid as normal.'
      : resolution === 'refunded'
      ? 'The student has been fully refunded.'
      : `The student has been refunded ${refundedAmount.toFixed(2)} ${payment?.currency || 'EUR'}.`;

    await supabase.from('notifications').insert([
      {
        user_id: dispute.opened_by, type: 'dispute_resolved',
        title: '✅ Your dispute has been resolved',
        body: `We've reviewed the ${session.subject} session. ${outcomeText}`,
        link: dispute.opened_by === session.student_id ? 'student-dashboard.html' : 'tutor-dashboard.html', read: false,
      },
      {
        user_id: dispute.against, type: 'dispute_resolved',
        title: 'Dispute resolved',
        body: `We've reviewed the ${session.subject} session. ${outcomeText}`,
        link: dispute.against === session.student_id ? 'student-dashboard.html' : 'tutor-dashboard.html', read: false,
      },
    ]);

    try {
      const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
      const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
      const emailData = { subject: session.subject, outcome: outcomeText, notes: resolution_notes, refunded: resolution === 'refunded' || resolution === 'partial' };
      if (studentUser?.email) await sendEmail(supabaseUrl, 'dispute_resolved', studentUser.email, emailData);
      if (tutorUser?.email) await sendEmail(supabaseUrl, 'dispute_resolved', tutorUser.email, emailData);
    } catch (e) {
      console.error('Email dispatch failed (non-critical):', e);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('resolve-dispute error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}));
