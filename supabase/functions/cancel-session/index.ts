import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET') ?? '';
// PAYPAL_ENV secret: 'live' = real money; anything else (or unset) = PayPal sandbox
const PAYPAL_BASE = Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const GRACE_PERIOD_MINUTES = 30;
const CUTOFF_HOURS_BEFORE_SESSION = 24;

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

async function refundPaypalCapture(token: string, captureId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${PAYPAL_BASE}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) { console.error('PayPal refund failed:', JSON.stringify(data)); return { ok: false, error: data.message || 'Refund failed' }; }
  return { ok: true };
}

// Card payments are destination charges: the tutor's share was transferred to their Stripe
// account at checkout. A refund must pull that share (and our fee) back, otherwise the
// platform pays the entire refund while the tutor keeps their 80%.
async function refundStripePayment(paymentIntentId: string): Promise<{ ok: boolean; error?: string; refundId?: string }> {
  const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
  });
  const pi = await piRes.json();
  if (!piRes.ok) { console.error('Stripe PI lookup failed:', JSON.stringify(pi)); return { ok: false, error: pi.error?.message || 'Could not load payment' }; }

  const params: Record<string, string> = { payment_intent: paymentIntentId };
  if (pi.transfer_data?.destination) {
    params.reverse_transfer = 'true';
    params.refund_application_fee = 'true';
  }
  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `refund_full_${paymentIntentId}` },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) { console.error('Stripe refund failed:', JSON.stringify(data)); return { ok: false, error: data.error?.message || 'Refund failed' }; }
  return { ok: true, refundId: data.id };
}

async function refundWhicheverMethodWasUsed(payment: any): Promise<{ ok: boolean; error?: string; refundId?: string }> {
  if (payment?.paypal_capture_id) {
    const token = await getPaypalToken();
    return refundPaypalCapture(token, payment.paypal_capture_id);
  }
  if (payment?.stripe_payment_intent_id) {
    return refundStripePayment(payment.stripe_payment_intent_id);
  }
  return { ok: false, error: 'No payment capture reference found — cannot process refund automatically.' };
}

// A full refund returns the money actually paid; any account credit (referral welcome credit
// or credit balance) used on the booking is given back as account credit.
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

Deno.serve(withSentry('cancel-session', async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Only the dashboards' POST requests are valid. Anything else (bots and scanners probing the URL
  // with GET/HEAD, often with no body) is refused here instead of crashing on an empty body.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json', 'Allow': 'POST, OPTIONS' } });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { session_id, reason, confirm_no_refund } = body || {};
    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const requester_id = await getAuthedUserId(req, supabase);
    if (!requester_id) {
      return new Response(JSON.stringify({ error: 'Not signed in. Please log in again.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: session, error: sessErr } = await supabase.from('sessions').select('*').eq('id', session_id).single();
    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (session.status !== 'confirmed' && session.status !== 'awaiting_payment') {
      return new Response(JSON.stringify({ error: 'This session can no longer be cancelled.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const isStudent = requester_id === session.student_id;
    const isTutor = requester_id === session.tutor_id;
    if (!isStudent && !isTutor) {
      return new Response(JSON.stringify({ error: 'You are not part of this session.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Accepted but not paid yet: nothing was charged, so cancelling just releases the booking. ──
    if (session.status === 'awaiting_payment') {
      // Only cancel if it is still unpaid (a payment may be confirming at this very moment).
      const { data: released } = await supabase.from('sessions').update({
        status: 'cancelled',
        cancelled_by: isTutor ? 'tutor' : 'student',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || null,
        payment_due_at: null,
      }).eq('id', session_id).eq('status', 'awaiting_payment').or('payment_status.is.null,payment_status.neq.paid').select('id');
      if (!released || released.length === 0) {
        return new Response(JSON.stringify({ error: 'This booking was just paid, so it can\'t be cancelled this way. Please refresh the page and cancel the confirmed session.' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await supabase.from('reschedule_requests').update({ status: 'cancelled', responded_at: new Date().toISOString() })
        .eq('session_id', session_id).eq('status', 'pending');

      const otherId = isTutor ? session.student_id : session.tutor_id;
      const cancellerName = isTutor ? session.tutor_name : session.student_name;
      await supabase.from('notifications').insert([
        {
          user_id: otherId, type: 'session_cancelled', title: '❌ Booking cancelled',
          body: `${cancellerName} cancelled the ${session.subject} booking before it was paid. Nothing was charged.`,
          link: isTutor ? 'find-tutors.html' : 'tutor-dashboard.html', read: false,
        },
        {
          user_id: requester_id, type: 'session_cancelled', title: 'Booking cancelled',
          body: `You cancelled the ${session.subject} booking. Nothing was charged.`,
          link: isTutor ? 'tutor-dashboard.html' : 'student-dashboard.html', read: false,
        },
      ]);
      try {
        const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
        const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
        const emailData = { sessionId: session.id, reason: reason || '', studentName: session.student_name, tutorName: session.tutor_name, subject: session.subject, refunded: false, unpaid: true, cancelledBy: isTutor ? 'tutor' : 'student' };
        if (studentUser?.email) await sendEmail(supabaseUrl, 'session_cancelled', studentUser.email, emailData);
        if (tutorUser?.email) await sendEmail(supabaseUrl, 'session_cancelled', tutorUser.email, emailData);
      } catch (e) {
        console.error('Email dispatch failed (non-critical):', e);
      }
      return new Response(JSON.stringify({ success: true, outcome: 'not_paid', refunded: false }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: payment } = await supabase.from('payments')
      .select('*').eq('session_id', session_id).eq('status', 'paid').maybeSingle();

    let outcome: 'full_refund' | 'no_refund_reschedule_offered' | 'no_refund';

    if (isTutor) {
      outcome = 'full_refund';
    } else {
      const paidMinutesAgo = payment?.paid_at ? (Date.now() - new Date(payment.paid_at).getTime()) / 60000 : Infinity;
      // starts_at is the real start instant in the session's own time zone (computed by the database).
      const sessionStart = session.starts_at ? new Date(session.starts_at) : new Date(session.scheduled_date + 'T' + session.scheduled_time);
      const hoursUntilSession = (sessionStart.getTime() - Date.now()) / 3600000;
      // Set by reschedule-session when the student moved a session that was already less than
      // 24 h away: the new, later date doesn't reopen the full-refund window.
      const lateRescheduled = !!session.late_reschedule_at;
      // Set by reschedule-session when the TUTOR moved this session: the student didn't choose the
      // new time, so they can always cancel it for a full refund.
      const tutorMoved = !!session.tutor_rescheduled_at;

      if (paidMinutesAgo <= GRACE_PERIOD_MINUTES) {
        outcome = 'full_refund';
      } else if (tutorMoved) {
        outcome = 'full_refund';
      } else if (hoursUntilSession >= CUTOFF_HOURS_BEFORE_SESSION && !lateRescheduled) {
        outcome = 'full_refund';
      } else {
        if (!confirm_no_refund) {
          return new Response(JSON.stringify({
            requires_confirmation: true,
            message: lateRescheduled
              ? `This session was rescheduled when it was less than ${CUTOFF_HOURS_BEFORE_SESSION} hours away, so cancelling it won't get a refund. You can reschedule instead, or cancel anyway with no refund.`
              : `This session is less than ${CUTOFF_HOURS_BEFORE_SESSION} hours away, so cancelling now won't get a refund. You can reschedule instead, or cancel anyway with no refund.`,
          }), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        outcome = 'no_refund';
      }
    }

    if (outcome === 'full_refund') {
      if (!payment) {
        return new Response(JSON.stringify({ error: 'No payment record found for this session — cannot process automatically. Please contact support.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // Claim the payment atomically: only one request may move it out of 'paid'. Without this a
      // double click (or two tabs) ran the refund twice and gave the student their used credit back twice.
      const { data: claimed } = await supabase.from('payments').update({ status: 'refund_processing' })
        .eq('id', payment.id).eq('status', 'paid').select('id');
      if (!claimed || claimed.length === 0) {
        return new Response(JSON.stringify({ error: 'This cancellation is already being processed. Please refresh the page in a moment.' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      const result = await refundWhicheverMethodWasUsed(payment);
      if (!result.ok) {
        await supabase.from('payments').update({ status: 'refund_failed' }).eq('id', payment.id);
        return new Response(JSON.stringify({ error: 'Could not process the refund automatically: ' + result.error }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // stripe_refund_id lets each refund be matched to Stripe's records
      await supabase.from('payments').update({ status: 'refunded', ...(result.refundId ? { stripe_refund_id: result.refundId } : {}) }).eq('id', payment.id);
      await restoreCreditUsed(supabase, payment, session.student_id, session_id);
    }

    // Only a still-confirmed session is cancelled here, so a repeated request can't cancel it twice
    // (duplicate notifications and emails). A refunded payment is already claimed above.
    // After a refund the session is always marked cancelled, whatever its status now.
    let cancelQuery = supabase.from('sessions').update({
      status: 'cancelled',
      cancelled_by: isTutor ? 'tutor' : 'student',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
      refund_outcome: outcome,
    }).eq('id', session_id);
    if (outcome !== 'full_refund') cancelQuery = cancelQuery.eq('status', 'confirmed');
    const { data: cancelledRows, error: cancelErr } = await cancelQuery.select('id');
    if (cancelErr) console.error('cancel-session: could not mark session cancelled:', cancelErr.message);
    if (outcome !== 'full_refund' && (!cancelledRows || cancelledRows.length === 0)) {
      return new Response(JSON.stringify({ error: 'This session was already cancelled. Please refresh the page.' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // A cancelled session can't be rescheduled: close any request still waiting for a reply.
    await supabase.from('reschedule_requests').update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('session_id', session_id).eq('status', 'pending');

    const otherPartyId = isTutor ? session.student_id : session.tutor_id;
    const cancellerName = isTutor ? session.tutor_name : session.student_name;
    const refundText = outcome === 'full_refund' ? ' A full refund has been issued.' : ' No refund applies for this cancellation.';

    await supabase.from('notifications').insert([
      {
        user_id: otherPartyId, type: 'session_cancelled',
        title: '❌ Session cancelled',
        body: `${cancellerName} cancelled the ${session.subject} session.${refundText}`,
        link: isTutor ? 'student-dashboard.html' : 'tutor-dashboard.html', read: false,
      },
      {
        user_id: requester_id, type: 'session_cancelled',
        title: 'Session cancelled',
        body: `You cancelled the ${session.subject} session.${refundText}`,
        link: isTutor ? 'tutor-dashboard.html' : 'student-dashboard.html', read: false,
      },
    ]);

    try {
      const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
      const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
      const emailData = { sessionId: session.id, reason: reason || '', studentName: session.student_name, tutorName: session.tutor_name, subject: session.subject, refunded: outcome === 'full_refund', cancelledBy: isTutor ? 'tutor' : 'student' };
      if (studentUser?.email) await sendEmail(supabaseUrl, 'session_cancelled', studentUser.email, emailData);
      if (tutorUser?.email) await sendEmail(supabaseUrl, 'session_cancelled', tutorUser.email, emailData);
    } catch (e) {
      console.error('Email dispatch failed (non-critical):', e);
    }

    return new Response(JSON.stringify({ success: true, outcome, refunded: outcome === 'full_refund' }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('cancel-session error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}));
