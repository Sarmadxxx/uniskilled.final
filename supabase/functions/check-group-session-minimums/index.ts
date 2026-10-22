import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET') ?? '';
// PAYPAL_ENV secret: 'live' = real money; anything else (or unset) = PayPal sandbox
const PAYPAL_BASE = Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MIN_STUDENTS = 2;
const CUTOFF_HOURS_BEFORE = 12;

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// SERVER-ONLY: callable by the pg_cron job (x-cron-secret, checked inside the database)
// or by server code holding the service-role key. Browsers are rejected.
async function isTrustedCaller(req: Request, supabase: any): Promise<boolean> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (safeEqual(token, SERVICE_KEY)) return true;
  const cronSecret = req.headers.get('x-cron-secret') || '';
  if (!cronSecret) return false;
  const { data, error } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret });
  return !error && data === true;
}

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

async function refundCapture(token: string, captureId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${PAYPAL_BASE}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Refund failed:', JSON.stringify(data));
    return { ok: false, error: data.message || 'Refund failed' };
  }
  return { ok: true };
}

// Card-paid spots used to be cancelled WITHOUT a refund. Refund them too, pulling back the
// tutor's transferred share and our fee when it was a destination charge.
async function refundStripe(paymentIntentId: string): Promise<{ ok: boolean; error?: string }> {
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
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `refund_group_min_${paymentIntentId}` },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) { console.error('Stripe refund failed:', JSON.stringify(data)); return { ok: false, error: data.error?.message || 'Refund failed' }; }
  return { ok: true };
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

Deno.serve(async (req: Request) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    if (!(await isTrustedCaller(req, supabase))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const cutoffTime = new Date(Date.now() + CUTOFF_HOURS_BEFORE * 60 * 60 * 1000);

    const { data: sessions, error } = await supabase.from('group_sessions')
      .select('*')
      .eq('status', 'open')
      .eq('min_check_done', false);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // starts_at is the real start instant in the session's own time zone (computed by the database).
    const dueForCheck = (sessions || []).filter(gs => {
      const startTime = gs.starts_at ? new Date(gs.starts_at) : new Date(gs.scheduled_date + 'T' + gs.scheduled_time);
      return startTime <= cutoffTime;
    });

    const results = [];

    for (const gs of dueForCheck) {
      const { data: participants } = await supabase.from('group_session_participants')
        .select('*').eq('group_session_id', gs.id);

      const confirmed = (participants || []).filter(p => p.status === 'confirmed');
      const pending = (participants || []).filter(p => p.status === 'awaiting_payment');

      if (confirmed.length >= MIN_STUDENTS) {
        await supabase.from('group_sessions').update({ min_check_done: true }).eq('id', gs.id);
        results.push({ group_session_id: gs.id, outcome: 'confirmed', confirmed_count: confirmed.length });
        continue;
      }

      await supabase.from('group_sessions').update({ status: 'cancelled', min_check_done: true }).eq('id', gs.id);

      let token: string | null = null;

      for (const p of confirmed) {
        const { data: payment } = await supabase.from('payments')
          .select('*').eq('group_session_id', gs.id).eq('payer_id', p.student_id).eq('status', 'paid').maybeSingle();

        let refundOk = false;
        if (payment?.paypal_capture_id) {
          if (!token) token = await getToken();
          refundOk = (await refundCapture(token, payment.paypal_capture_id)).ok;
        } else if (payment?.stripe_payment_intent_id) {
          refundOk = (await refundStripe(payment.stripe_payment_intent_id)).ok;
        }
        if (payment) {
          await supabase.from('payments').update({ status: refundOk ? 'refunded' : 'refund_failed' }).eq('id', payment.id);
          if (!refundOk) console.error(`Group refund FAILED — needs manual refund: payment ${payment.id}`);
        }

        await supabase.from('group_session_participants').update({ status: 'cancelled' }).eq('id', p.id);

        await supabase.from('notifications').insert({
          user_id: p.student_id, type: 'group_session_cancelled',
          title: refundOk ? '↩️ Group session cancelled — refunded' : '❌ Group session cancelled',
          body: `The ${gs.subject} group session didn't reach the minimum of ${MIN_STUDENTS} students, so it's been cancelled.${refundOk ? ' Your payment has been refunded.' : ' Our team will process your refund manually.'}`,
          link: 'group-sessions.html', read: false,
        });

        try {
          const { data: studentUser } = await supabase.from('users').select('email').eq('id', p.student_id).single();
          if (studentUser?.email) {
            await sendEmail(supabaseUrl, 'group_session_cancelled', studentUser.email, {
              studentName: p.student_name, tutorName: gs.tutor_name, subject: gs.subject, refunded: refundOk,
            });
          }
        } catch (e) { console.error('Email failed (non-critical):', e); }
      }

      for (const p of pending) {
        await supabase.from('group_session_participants').update({ status: 'cancelled' }).eq('id', p.id);
      }

      await supabase.from('notifications').insert({
        user_id: gs.tutor_id, type: 'group_session_cancelled',
        title: 'Group session cancelled',
        body: `Your ${gs.subject} group session didn't reach ${MIN_STUDENTS} paid students in time, so it's been automatically cancelled.`,
        link: 'tutor-dashboard.html?tab=groupSessions', read: false,
      });
      try {
        const { data: tutorUser } = await supabase.from('users').select('email').eq('id', gs.tutor_id).single();
        if (tutorUser?.email) {
          await sendEmail(supabaseUrl, 'group_session_cancelled_tutor', tutorUser.email, { tutorName: gs.tutor_name, subject: gs.subject });
        }
      } catch (e) { console.error('Email failed (non-critical):', e); }

      results.push({ group_session_id: gs.id, outcome: 'cancelled', refunded_count: confirmed.length });
    }

    return new Response(JSON.stringify({ checked: dueForCheck.length, results }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('check-group-session-minimums error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
