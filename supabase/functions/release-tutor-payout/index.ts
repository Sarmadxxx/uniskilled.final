import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { choosePayoutRoute } from './payout-route.ts';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HOLD_HOURS = 48;
const REFERRAL_REWARD_AMOUNT = 10.00;
// Only these payment states may be paid out. Refunded / refund_processing / refund_failed never are.
const PAYABLE_STATUSES = ['paid', 'partially_refunded'];

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

async function qualifyReferralsForSession(supabase: any, supabaseUrl: string, session: { id: string; student_id: string; tutor_id: string }) {
  const candidateIds = [session.student_id, session.tutor_id].filter(Boolean);
  if (candidateIds.length === 0) return;

  const { data: pending } = await supabase.from('referrals')
    .select('id, referrer_id, invitee_id')
    .in('invitee_id', candidateIds)
    .eq('status', 'pending')
    .is('qualifying_session_id', null);

  for (const referral of pending || []) {
    // Claim the referral first so concurrent runs can never double-credit it.
    const { data: claimedRef } = await supabase.from('referrals').update({
      status: 'qualified',
      qualifying_session_id: session.id,
      referrer_reward_amount: REFERRAL_REWARD_AMOUNT,
      qualified_at: new Date().toISOString(),
    }).eq('id', referral.id).eq('status', 'pending').select('id');
    if (!claimedRef || claimedRef.length === 0) continue;

    await supabase.rpc('add_credit_balance', { p_user_id: referral.referrer_id, p_amount: REFERRAL_REWARD_AMOUNT });

    await supabase.from('credit_transactions').insert({
      user_id: referral.referrer_id, amount: REFERRAL_REWARD_AMOUNT, type: 'referral_reward',
      reference_referral_id: referral.id, reference_session_id: session.id,
      description: 'Referral reward — invitee completed their first session',
    });

    await supabase.from('notifications').insert({
      user_id: referral.referrer_id, type: 'referral_qualified',
      title: '🎁 You earned a €10 referral credit!',
      body: `The person you referred just completed their first session on UniSkilled. €10 has been added to your account credit.`,
      link: 'student-dashboard.html?tab=referrals', read: false,
    });

    try {
      const { data: referrerUser } = await supabase.from('users').select('email, full_name').eq('id', referral.referrer_id).single();
      if (referrerUser?.email) {
        await sendEmail(supabaseUrl, 'referral_qualified', referrerUser.email, { referrerName: referrerUser.full_name, amount: REFERRAL_REWARD_AMOUNT.toFixed(2) });
      }
    } catch (e) {
      console.error('Referral email dispatch failed (non-critical):', e);
    }
  }
}

/**
 * Pays one payment row out to its tutor. Shared by one-to-one and group sessions.
 * Claims the row atomically first (status -> 'releasing'), so concurrent runs can't both pay it;
 * Stripe payouts carry an idempotency key and PayPal batches a unique sender_batch_id.
 */
async function releasePayment(supabase: any, payment: any, tutorId: string, ref: { kind: string; id: string }): Promise<any> {
  const base = { [ref.kind]: ref.id, payment_id: payment.id };
  if (payment.released_at || payment.stripe_transfer_id) return null;
  if (!PAYABLE_STATUSES.includes(payment.status)) return { ...base, skipped: true, reason: `payment status '${payment.status}' is not payable` };
  if (!(Number(payment.tutor_payout) > 0)) return { ...base, skipped: true, reason: 'nothing to pay out' };

  const { data: tp, error: tpErr } = await supabase
    .from('tutor_profiles')
    .select('stripe_account_id, stripe_account_status, payout_method, paypal_email')
    .eq('user_id', tutorId)
    .single();
  // The route follows where the money is (card → tutor's Stripe balance, PayPal → our PayPal),
  // never the tutor's payout preference. See payout-route.ts.
  const route = choosePayoutRoute(payment, tpErr ? null : tp);
  if (route.method === 'skip') return { ...base, skipped: true, needs_attention: true, reason: route.reason };

  const { data: claimed } = await supabase.from('payments')
    .update({ status: 'releasing' })
    .eq('id', payment.id).eq('status', payment.status)
    .is('released_at', null).is('stripe_transfer_id', null)
    .select('id');
  if (!claimed || claimed.length === 0) return { ...base, skipped: true, reason: 'already being released by another run' };

  const originalStatus = payment.status;
  const restore = () => supabase.from('payments').update({ status: originalStatus }).eq('id', payment.id).eq('status', 'releasing');

  try {
    if (route.method === 'paypal') {
      const ppRes = await supabase.functions.invoke('create-paypal-payout', {
        body: {
          paypal_email: route.paypalEmail,
          amount: payment.tutor_payout,
          currency: (payment.currency || 'EUR').toUpperCase(),
          note: `UniSkilled tutoring payout (${ref.kind === 'group_session_id' ? 'group session' : 'session'} ${ref.id})`,
          // one-to-one keeps its original batch id format; group payouts are per student payment
          sender_batch_id: ref.kind === 'session_id' ? `session_${ref.id}` : `payment_${payment.id}`,
        },
      });
      if (ppRes.error || !ppRes.data?.success) {
        const errMsg = ppRes.error?.message || ppRes.data?.error || 'PayPal payout failed';
        console.error(`PayPal payout failed for payment ${payment.id}:`, errMsg);
        await restore();
        return { ...base, success: false, method: 'paypal', error: errMsg };
      }
      await supabase.from('payments').update({
        paypal_batch_id: ppRes.data.batch_id, released_at: new Date().toISOString(), status: 'released',
      }).eq('id', payment.id);
      return { ...base, success: true, method: 'paypal', batch_id: ppRes.data.batch_id, amount: payment.tutor_payout, currency: payment.currency || 'EUR' };
    }

    const body = new URLSearchParams({
      amount: Math.round(Number(payment.tutor_payout) * 100).toString(),
      currency: (payment.currency || 'eur').toLowerCase(),
      [`metadata[${ref.kind}]`]: ref.id,
      'metadata[payment_id]': payment.id,
    });
    const payoutRes = await fetch('https://api.stripe.com/v1/payouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': route.stripeAccountId,
        // Stripe returns the original payout instead of creating a second one on retry.
        'Idempotency-Key': `payout_${payment.id}`,
      },
      body: body.toString(),
    });
    const payout = await payoutRes.json();
    if (!payoutRes.ok) {
      console.error(`Stripe payout failed for payment ${payment.id}:`, JSON.stringify(payout));
      await restore();
      return { ...base, success: false, method: 'stripe', error: payout.error?.message || 'Payout failed' };
    }
    await supabase.from('payments').update({
      stripe_transfer_id: payout.id, released_at: new Date().toISOString(), status: 'released',
    }).eq('id', payment.id);
    return { ...base, success: true, method: 'stripe', transfer_id: payout.id, amount: payment.tutor_payout, currency: payment.currency || 'EUR' };
  } catch (err) {
    // Outcome unknown: leave it in 'releasing' for manual review rather than risk paying twice.
    console.error(`Payment ${payment.id} left in 'releasing' — check the provider dashboard before retrying:`, String(err));
    return { ...base, success: false, error: String(err) };
  }
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

  if (!(await isTrustedCaller(req, supabase))) return json({ error: 'Forbidden' }, 403);

  const cutoff = new Date(Date.now() - HOLD_HOURS * 60 * 60 * 1000).toISOString();
  const results: any[] = [];

  try {
    // ── One-to-one sessions ──
    const { data: sessions, error: sessErr } = await supabase
      .from('sessions')
      .select('id, tutor_id, student_id, subject, completed_at, status, payment_status')
      .eq('status', 'completed')
      .eq('payment_status', 'paid')
      .lte('completed_at', cutoff);
    if (sessErr) throw new Error(`Failed to query sessions: ${sessErr.message}`);

    const sessionIds = (sessions || []).map(s => s.id);
    const disputed = new Set<string>();
    if (sessionIds.length > 0) {
      const { data: openDisputes } = await supabase.from('disputes').select('session_id').in('session_id', sessionIds).in('status', ['open', 'under_review']);
      for (const d of openDisputes || []) disputed.add(d.session_id);
    }

    for (const session of sessions || []) {
      if (disputed.has(session.id)) {
        results.push({ session_id: session.id, skipped: true, reason: 'open dispute — payout paused' });
        continue;
      }
      try {
        await qualifyReferralsForSession(supabase, supabaseUrl, session);
      } catch (refErr) {
        console.error(`Referral qualification error for session ${session.id}:`, String(refErr));
      }
      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .select('id, status, tutor_payout, currency, stripe_transfer_id, released_at, stripe_payment_intent_id, paypal_capture_id, paypal_order_id')
        .eq('session_id', session.id)
        .maybeSingle();
      if (payErr || !payment) {
        results.push({ session_id: session.id, skipped: true, reason: payErr ? 'multiple/invalid payment records — check manually' : 'no payment record' });
        continue;
      }
      const r = await releasePayment(supabase, payment, session.tutor_id, { kind: 'session_id', id: session.id });
      if (r) results.push(r);
    }

    // ── Group sessions: each paid student's payment is released to the tutor ──
    const { data: groups, error: gErr } = await supabase
      .from('group_sessions')
      .select('id, tutor_id, subject, completed_at')
      .eq('status', 'completed')
      .lte('completed_at', cutoff);
    if (gErr) throw new Error(`Failed to query group sessions: ${gErr.message}`);

    if (groups && groups.length > 0) {
      const tutorByGroup = new Map<string, string>(groups.map((g: any) => [g.id, g.tutor_id]));
      const { data: groupPayments, error: gpErr } = await supabase
        .from('payments')
        .select('id, group_session_id, status, tutor_payout, currency, stripe_transfer_id, released_at, stripe_payment_intent_id, paypal_capture_id, paypal_order_id')
        .in('group_session_id', groups.map(g => g.id))
        .is('released_at', null)
        .is('stripe_transfer_id', null);
      if (gpErr) throw new Error(`Failed to query group payments: ${gpErr.message}`);

      for (const payment of groupPayments || []) {
        const tutorId = tutorByGroup.get(payment.group_session_id);
        if (!tutorId) continue;
        const r = await releasePayment(supabase, payment, tutorId, { kind: 'group_session_id', id: payment.group_session_id });
        if (r) results.push(r);
      }
    }

    // ── Admin summary ──
    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
      const byCurrency: Record<string, { count: number; total: number }> = {};
      for (const r of successful) {
        const cur = r.currency || 'EUR';
        if (!byCurrency[cur]) byCurrency[cur] = { count: 0, total: 0 };
        byCurrency[cur].count++;
        byCurrency[cur].total += Number(r.amount || 0);
      }
      const { data: admins } = await supabase.from('users').select('id, email').contains('roles', ['admin']);
      for (const [currency, summary] of Object.entries(byCurrency)) {
        const sym = currency === 'USD' ? '$' : '€';
        const totalStr = summary.total.toFixed(2);
        for (const admin of admins || []) {
          await supabase.from('notifications').insert({
            user_id: admin.id, type: 'payout_summary',
            title: `💸 ${summary.count} payout${summary.count === 1 ? '' : 's'} released — ${sym}${totalStr}`,
            body: `${summary.count} tutor payout${summary.count === 1 ? '' : 's'} totaling ${sym}${totalStr} just went out after the 48-hour hold.`,
            link: 'admin.html?tab=transactions', read: false,
          });
          if (admin.email) {
            await sendEmail(supabaseUrl, 'admin_payout_summary', admin.email, { count: summary.count, total: totalStr, currency: sym });
          }
        }
      }
    }

    // ── Admin alert for payouts that failed or need a human (previously only logged) ──
    // The job runs hourly, so an identical alert is sent at most once per 24 hours.
    const problems = results.filter(r => r.success === false || r.needs_attention);
    if (problems.length > 0) {
      try {
        const lines = problems.map(p => `• payment ${String(p.payment_id).slice(0, 8)}: ${p.error || p.reason}`).sort();
        const body = `${problems.length} tutor payout${problems.length === 1 ? '' : 's'} could not be released:\n${lines.join('\n')}`.slice(0, 1000);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: admins } = await supabase.from('users').select('id').contains('roles', ['admin']);
        for (const admin of admins || []) {
          const { data: recent } = await supabase.from('notifications').select('id')
            .eq('user_id', admin.id).eq('type', 'payout_attention').eq('body', body).gte('created_at', since).limit(1);
          if (recent && recent.length > 0) continue;
          await supabase.from('notifications').insert({
            user_id: admin.id, type: 'payout_attention',
            title: `⚠️ ${problems.length} payout${problems.length === 1 ? '' : 's'} need attention`,
            body, link: 'admin.html?tab=transactions', read: false,
          });
        }
      } catch (e) {
        console.error('Payout problem alert failed (non-critical):', e);
      }
    }

    return json({ processed: results.length, results });
  } catch (err) {
    console.error('Batch payout job error:', err);
    return json({ error: String(err) }, 500);
  }
});
