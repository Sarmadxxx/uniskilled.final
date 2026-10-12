import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FROM = 'UniSkilled <info@uniskilled.com>';
const LOGO_URL = 'https://uniskilled.com/uniskilled-logo.png';
const ALWAYS_ALLOWED = ['info@uniskilled.com'];
// The only emails a signed-in user may trigger from the browser, and only to their own session partner.
const USER_SENDABLE_TYPES = ['booking_request', 'awaiting_payment', 'booking_declined'];

const signature = `
  <div style="text-align:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid #e5e7eb;">
    <img src="${LOGO_URL}" alt="UniSkilled" style="height:28px;width:auto;margin-bottom:0.5rem;">
    <p style="color:#9ca3af;font-size:0.75rem;margin:0;">University-verified tutoring</p>
  </div>`;

function wrap(bodyHtml: string) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem 1rem;">${bodyHtml}${signature}</div>`;
}

// Escape every text value so nobody can inject HTML or links into our emails
function esc(v: any): any {
  if (typeof v === 'string') return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (Array.isArray(v)) return v.map(esc);
  if (v && typeof v === 'object') { const o: any = {}; for (const k of Object.keys(v)) o[k] = esc(v[k]); return o; }
  return v;
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
    const header = req.headers.get('Authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const isServer = safeEqual(bearer, SERVICE_KEY);

    let callerId: string | null = null;
    if (!isServer) {
      if (!bearer) return json({ error: 'Not signed in.' }, 401);
      const { data: authData, error: authErr } = await sb.auth.getUser(bearer);
      if (authErr || !authData?.user) return json({ error: 'Not signed in.' }, 401);
      callerId = authData.user.id;
    }

    const parsed = await req.json();
    const type = parsed.type;
    const data: any = esc(parsed.data || {});
    const sym = ['€', '$'].includes(String(parsed.data?.currencySymbol)) ? String(parsed.data.currencySymbol) : '€';
    let to = '';

    if (isServer) {
      to = String(parsed.to || '').trim().toLowerCase();
      if (!to && parsed.to_user_id) {
        const { data: ru } = await sb.from('users').select('email').eq('id', String(parsed.to_user_id)).maybeSingle();
        to = String(ru?.email || '').trim().toLowerCase();
      }
    } else {
      // Browser callers: fixed set of booking emails, recipient by user id only, and only
      // someone who shares a session with the caller.
      if (!USER_SENDABLE_TYPES.includes(type)) return json({ error: 'Not allowed' }, 403);
      const recipientId = String(parsed.to_user_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(recipientId) || recipientId === callerId) return json({ error: 'Not allowed' }, 403);
      const { data: shared } = await sb.from('sessions').select('id')
        .or(`and(student_id.eq.${callerId},tutor_id.eq.${recipientId}),and(tutor_id.eq.${callerId},student_id.eq.${recipientId})`)
        .limit(1);
      if (!shared || shared.length === 0) return json({ error: 'Not allowed' }, 403);
      const { data: ru } = await sb.from('users').select('email').eq('id', recipientId).maybeSingle();
      to = String(ru?.email || '').trim().toLowerCase();
    }

    if (!to) return json({ error: 'Recipient not found' }, 404);
    if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(to)) return json({ error: 'Invalid recipient' }, 400);
    if (!ALWAYS_ALLOWED.includes(to)) {
      const { data: u } = await sb.from('users').select('id').ilike('email', to).limit(1);
      if (!u || u.length === 0) return json({ error: 'Recipient not allowed' }, 403);
    }

    let subject = '';
    let body = '';

    if (type === 'booking_request') {
      subject = `📅 New session request — ${data.subject} (${sym}${data.price || ''})`;
      const isNegotiated = data.listedRate && data.price && Math.abs(Number(data.price) - Number(data.listedRate) * (Number(data.duration) / 60)) >= 0.5;
      body = `
        <div style="background:linear-gradient(135deg,#0b1f4a,#1a6bff);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">New Session Request</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">Hi <strong>${data.tutorName}</strong>,</p>
          <p style="color:#374151;"><strong>${data.studentName}</strong> has requested a tutoring session with you. No payment has been taken yet — the student will only be charged after you accept.</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0.3rem 0;"><strong>Subject:</strong> ${data.subject}</p>
            <p style="margin:0.3rem 0;"><strong>Date:</strong> ${data.date}</p>
            <p style="margin:0.3rem 0;"><strong>Time:</strong> ${data.time}</p>
            <p style="margin:0.3rem 0;"><strong>Duration:</strong> ${data.duration} minutes</p>
            <p style="margin:0.3rem 0;"><strong>Format:</strong> ${data.format}</p>
            ${data.notes ? `<p style="margin:0.3rem 0;"><strong>Notes:</strong> ${data.notes}</p>` : ''}
          </div>
          <div style="background:${isNegotiated ? '#fffbeb' : '#fff'};border:1px solid ${isNegotiated ? '#fcd34d' : '#e5e7eb'};border-radius:10px;padding:1.2rem;margin:1rem 0;">
            <p style="margin:0;font-size:1.1rem;"><strong>Offered price: ${sym}${data.price}</strong></p>
            ${isNegotiated ? `<p style="margin:0.4rem 0 0;font-size:0.85rem;color:#92400e;">🏷️ This is a negotiated price — different from your usual rate.</p>` : ''}
          </div>
          <a href="https://uniskilled.com/tutor-dashboard.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">View Request →</a>
        </div>`;
    }

    if (type === 'awaiting_payment') {
      // The payment window is 24 hours, or ends 1 hour before the session if that's sooner.
      // Read the real deadline from the booking so the email never promises more time than exists.
      let payWindowText = '24 hours';
      try {
        const sid = String(parsed.data?.sessionId || '');
        if (/^[0-9a-f-]{36}$/i.test(sid)) {
          const { data: ps } = await sb.from('sessions').select('payment_due_at').eq('id', sid).maybeSingle();
          const mins = ps?.payment_due_at ? Math.floor((new Date(ps.payment_due_at).getTime() - Date.now()) / 60000) : null;
          if (mins !== null && mins > 0) payWindowText = mins >= 90 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`;
        }
      } catch (_e) { /* keep the default wording */ }
      subject = `🎉 ${data.tutorName} accepted your request — complete payment to confirm`;
      body = `
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">Your tutor said yes! 🎉</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">Hi <strong>${data.studentName}</strong>,</p>
          <p style="color:#374151;"><strong>${data.tutorName}</strong> has accepted your request for <strong>${data.subject}</strong>. To lock in your session, complete payment within the next <strong>${payWindowText}</strong> — after that, this slot will be released.</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0.3rem 0;"><strong>Subject:</strong> ${data.subject}</p>
            <p style="margin:0.3rem 0;"><strong>Date:</strong> ${data.date}</p>
            <p style="margin:0.3rem 0;"><strong>Time:</strong> ${data.time}</p>
            <p style="margin:0.3rem 0;"><strong>Amount:</strong> ${sym}${data.amount}</p>
          </div>
          <a href="https://uniskilled.com/complete-payment.html?session=${encodeURIComponent(String(parsed.data?.sessionId || ''))}" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Complete Payment →</a>
        </div>`;
    }

    if (type === 'booking_confirmed') {
      subject = `✅ Session confirmed — ${data.subject} with ${data.tutorName}`;
      body = `
        <div style="background:linear-gradient(135deg,#059669,#0ea5e9);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">Session Confirmed! 🎉</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">Hi <strong>${data.studentName}</strong>,</p>
          <p style="color:#374151;">Your payment went through and your session with <strong>${data.tutorName}</strong> is confirmed.</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0.3rem 0;"><strong>Subject:</strong> ${data.subject}</p>
            <p style="margin:0.3rem 0;"><strong>Date:</strong> ${data.date}</p>
            <p style="margin:0.3rem 0;"><strong>Time:</strong> ${data.time}</p>
            <p style="margin:0.3rem 0;"><strong>Duration:</strong> ${data.duration} minutes</p>
          </div>
          <a href="https://uniskilled.com/student-dashboard.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Go to Dashboard →</a>
        </div>`;
    }

    if (type === 'payment_received') {
      subject = `💰 Payment received — ${data.subject} with ${data.studentName}`;
      body = `
        <p>Hi <strong>${data.tutorName}</strong>,</p>
        <p><strong>${data.studentName}</strong> has completed payment for your <strong>${data.subject}</strong> session. It's now confirmed on both ends.</p>
        <a href="https://uniskilled.com/tutor-dashboard.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">View Session →</a>`;
    }

    if (type === 'booking_declined') {
      subject = `Session request declined — ${data.subject}`;
      body = `
        <p>Hi <strong>${data.studentName}</strong>,</p>
        <p>Unfortunately your session request for <strong>${data.subject}</strong> on ${data.date} was not available. Please try booking a different time or finding another tutor.</p>
        <a href="https://uniskilled.com/find-tutors.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Find Another Tutor →</a>`;
    }

    if (type === 'payment_expired') {
      subject = `⏰ Payment window expired — ${data.subject}`;
      body = `
        <p>Hi <strong>${data.studentName}</strong>,</p>
        <p>Your window to complete payment for the <strong>${data.subject}</strong> session with <strong>${data.tutorName}</strong> has passed, so the slot has been released.</p>
        <a href="https://uniskilled.com/find-tutors.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Book Again →</a>`;
    }

    if (type === 'payment_expired_tutor') {
      subject = `Slot reopened — student did not complete payment`;
      body = `
        <p>Hi <strong>${data.tutorName}</strong>,</p>
        <p><strong>${data.studentName}</strong> did not complete payment in time for the <strong>${data.subject}</strong> session, so it has been automatically released.</p>`;
    }

    if (type === 'group_session_cancelled') {
      subject = `Group session cancelled — ${data.subject}`;
      body = `
        <p>Hi <strong>${data.studentName}</strong>,</p>
        <p>The <strong>${data.subject}</strong> group session with <strong>${data.tutorName}</strong> didn't reach the minimum of 2 paid students, so it's been cancelled.</p>
        ${data.refunded ? '<p><strong>Your payment has been fully refunded.</strong></p>' : '<p>Our team will process your refund manually and be in touch.</p>'}
        <a href="https://uniskilled.com/group-sessions.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Browse Other Group Sessions →</a>`;
    }

    if (type === 'group_session_cancelled_tutor') {
      subject = `Group session cancelled — ${data.subject}`;
      body = `
        <p>Hi <strong>${data.tutorName}</strong>,</p>
        <p>Your <strong>${data.subject}</strong> group session didn't reach the minimum of 2 paid students by 12 hours before the start time, so it's been automatically cancelled. Any students who had paid have been refunded.</p>
        <a href="https://uniskilled.com/tutor-dashboard.html?tab=groupSessions" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Create a New One →</a>`;
    }

    if (type === 'session_cancelled') {
      const cancellerLabel = data.cancelledBy === 'tutor' ? data.tutorName : data.studentName;
      subject = `❌ Session cancelled — ${data.subject}`;
      body = `
        <div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">Session Cancelled</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">The <strong>${data.subject}</strong> session between <strong>${data.studentName}</strong> and <strong>${data.tutorName}</strong> has been cancelled by ${cancellerLabel}.</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0;font-weight:700;color:${data.refunded ? '#059669' : '#b91c1c'};">${data.refunded ? '✅ A full refund has been issued.' : '⚠️ No refund applies to this cancellation.'}</p>
          </div>
          <a href="https://uniskilled.com/find-tutors.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Browse Tutors →</a>
        </div>`;
    }

    if (type === 'session_rescheduled') {
      subject = `🔄 Session rescheduled — ${data.subject}`;
      body = `
        <div style="background:linear-gradient(135deg,#0b1f4a,#1a6bff);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">Session Rescheduled</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">Your <strong>${data.subject}</strong> session has a new time:</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0.3rem 0;"><strong>New date:</strong> ${data.date}</p>
            <p style="margin:0.3rem 0;"><strong>New time:</strong> ${data.time}</p>
          </div>
          <p style="color:#6b7280;font-size:0.85rem;">No new payment is needed — your original payment carries over to the new time.</p>
          <a href="https://uniskilled.com/student-dashboard.html" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">View Details →</a>
        </div>`;
    }

    if (type === 'reschedule_requested') {
      const dash = data.dashboard === 'tutor-dashboard.html' ? 'tutor-dashboard.html' : 'student-dashboard.html';
      subject = `🔄 New time requested — ${data.subject}`;
      body = `
        <div style="background:linear-gradient(135deg,#0b1f4a,#1a6bff);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">A New Time Was Requested</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">Hi <strong>${data.recipientName}</strong>,</p>
          <p style="color:#374151;"><strong>${data.requesterName}</strong> asked to move your <strong>${data.subject}</strong> session to:</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0.3rem 0;"><strong>New date:</strong> ${data.date}</p>
            <p style="margin:0.3rem 0;"><strong>New time:</strong> ${data.time}</p>
          </div>
          <p style="color:#6b7280;font-size:0.85rem;">Nothing changes unless you accept. If you decline, or don't answer before the session starts, it stays at its current time.</p>
          <a href="https://uniskilled.com/${dash}" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">Accept or Decline →</a>
        </div>`;
    }

    if (type === 'reschedule_declined') {
      const dash = data.dashboard === 'tutor-dashboard.html' ? 'tutor-dashboard.html' : 'student-dashboard.html';
      subject = `New time declined — ${data.subject}`;
      body = `
        <p>Hi <strong>${data.recipientName}</strong>,</p>
        <p><strong>${data.responderName}</strong> couldn't make ${data.date} at ${data.time}, so your <strong>${data.subject}</strong> session stays at its current time.</p>
        <a href="https://uniskilled.com/${dash}" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">View Session →</a>`;
    }

    if (type === 'dispute_opened') {
      subject = `⚠️ An issue has been reported — ${data.subject}`;
      body = `
        <div style="background:linear-gradient(135deg,#92400e,#d97706);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">An Issue Has Been Reported</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;"><strong>${data.openerName}</strong> reported an issue with your <strong>${data.subject}</strong> session. Our team is reviewing it — this session's payout is on hold until it's resolved, usually within a few days.</p>
        </div>`;
    }

    if (type === 'dispute_opened_admin') {
      subject = `🚨 New dispute opened — ${data.subject} (#${String(data.disputeId || '').slice(0,8)})`;
      body = `
        <p><strong>${data.openerName}</strong> opened a dispute on session <strong>${data.subject}</strong>.</p>
        <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
          <p style="margin:0;white-space:pre-wrap;">${data.reason}</p>
        </div>
        <p style="color:#6b7280;font-size:0.85rem;">Dispute ID: ${data.disputeId}</p>
        <a href="https://uniskilled.com/admin.html" style="display:inline-block;margin-top:0.8rem;background:#1a6bff;color:#fff;padding:0.7rem 1.4rem;border-radius:8px;text-decoration:none;font-weight:700;">Review in Admin Console →</a>`;
    }

    if (type === 'dispute_resolved') {
      subject = `✅ Dispute resolved — ${data.subject}`;
      body = `
        <div style="background:linear-gradient(135deg,#059669,#0ea5e9);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">Dispute Resolved</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">The reported issue for your <strong>${data.subject}</strong> session has been reviewed and resolved.</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0;font-weight:700;color:${data.refunded ? '#059669' : '#1a6bff'};">${data.refunded ? '✅ A refund was issued to the student.' : "✅ No issue was found — the tutor's payout will proceed as normal."}</p>
          </div>
        </div>`;
    }

    if (type === 'referral_qualified') {
      subject = `🎁 You earned a €${data.amount} referral credit!`;
      body = `
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">You Just Earned Account Credit! 🎁</h1>
        </div>
        <div style="background:#f8fafc;padding:2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;">Hi <strong>${data.referrerName || 'there'}</strong>,</p>
          <p style="color:#374151;">Someone you referred to UniSkilled just completed their first session — so as a thank you, we've added <strong>€${data.amount}</strong> in account credit to your balance.</p>
          <div style="background:#fff;border-radius:10px;padding:1.2rem;margin:1rem 0;border:1px solid #e5e7eb;">
            <p style="margin:0;font-size:1.1rem;"><strong>+€${data.amount} credit</strong> — automatically applied to your next booking.</p>
          </div>
          <p style="color:#6b7280;font-size:0.85rem;">Keep sharing your referral link — there's no limit on how many friends you can refer.</p>
          <a href="https://uniskilled.com/student-dashboard.html?tab=referrals" style="display:inline-block;background:#1a6bff;color:#fff;padding:0.8rem 1.6rem;border-radius:8px;text-decoration:none;font-weight:700;">View Your Referrals →</a>
        </div>`;
    }

    if (type === 'admin_transaction_alert') {
      subject = `💰 New payment — ${data.currency}${data.amount} — ${data.subject}`;
      body = `
        <div style="background:linear-gradient(135deg,#0b1f4a,#1a6bff);padding:1.8rem 2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.3rem;">💰 New Payment Received</h1>
        </div>
        <div style="background:#f8fafc;padding:1.8rem 2rem;border-radius:0 0 12px 12px;">
          <div style="background:#fff;border-radius:10px;padding:1.1rem;border:1px solid #e5e7eb;">
            <p style="margin:0.3rem 0;"><strong>Amount:</strong> ${data.currency}${data.amount}</p>
            <p style="margin:0.3rem 0;"><strong>From:</strong> ${data.payerName}</p>
            <p style="margin:0.3rem 0;"><strong>Session:</strong> ${data.subject} (${data.sessionKind})</p>
          </div>
          <a href="https://uniskilled.com/admin.html" style="display:inline-block;margin-top:0.9rem;background:#1a6bff;color:#fff;padding:0.7rem 1.4rem;border-radius:8px;text-decoration:none;font-weight:700;">View in Admin Console →</a>
        </div>`;
    }

    if (type === 'admin_payout_summary') {
      subject = `💸 ${data.count} tutor payout${data.count === 1 ? '' : 's'} released — ${data.currency}${data.total}`;
      body = `
        <div style="background:linear-gradient(135deg,#0b1f4a,#1a6bff);padding:1.8rem 2rem;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.3rem;">💸 Tutor Payouts Released</h1>
        </div>
        <div style="background:#f8fafc;padding:1.8rem 2rem;border-radius:0 0 12px 12px;">
          <p style="color:#374151;"><strong>${data.count}</strong> payout${data.count === 1 ? '' : 's'} totaling <strong>${data.currency}${data.total}</strong> ${data.count === 1 ? 'was' : 'were'} just released to tutors after the 48-hour hold.</p>
          <a href="https://uniskilled.com/admin.html" style="display:inline-block;margin-top:0.9rem;background:#1a6bff;color:#fff;padding:0.7rem 1.4rem;border-radius:8px;text-decoration:none;font-weight:700;">View in Admin Console →</a>
        </div>`;
    }

    if (!subject) return json({ error: 'Unknown email type' }, 400);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: wrap(body) }),
    });
    const result = await res.json();
    console.log('Resend response:', res.status, JSON.stringify(result));

    return json({ ok: res.ok }, res.ok ? 200 : 500);
  } catch (err) {
    console.error('Email error:', String(err));
    return json({ error: 'Email could not be sent' }, 500);
  }
});
