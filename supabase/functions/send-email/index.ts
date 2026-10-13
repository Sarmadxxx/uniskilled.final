import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// UniSkilled transactional email.
//
// Every email uses one professional layout: header, title, greeting, explanation,
// full session details (pulled from the database when a sessionId is given, so
// they are always accurate), a clear status box, "what happens next" steps,
// one action button, policy links, support contact and the booking reference.
// A plain-text version is sent alongside the HTML (better inbox placement).
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FROM = 'UniSkilled <info@uniskilled.com>';
const SUPPORT = 'info@uniskilled.com';
const SITE = 'https://uniskilled.com';
const LOGO_URL = `${SITE}/uniskilled-logo.png`;
const ALWAYS_ALLOWED = ['info@uniskilled.com'];
// The only emails a signed-in user may trigger from the browser, and only to their own session partner.
const USER_SENDABLE_TYPES = ['booking_request', 'awaiting_payment', 'booking_declined'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escape every text value so nobody can inject HTML or links into our emails
function esc(v: any): any {
  if (typeof v === 'string') return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (Array.isArray(v)) return v.map(esc);
  if (v && typeof v === 'object') { const o: any = {}; for (const k of Object.keys(v)) o[k] = esc(v[k]); return o; }
  return v;
}
function unesc(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function maskEmail(e: string): string {
  const [u, d] = e.split('@');
  return (u ? u.slice(0, 2) + '***' : '***') + '@' + (d || '');
}

const first = (name: any) => String(name || '').trim().split(/\s+/)[0] || 'there';

// ── Dates & money ────────────────────────────────────────────────────────────
function tzLabel(tz: string) {
  return String(tz || 'Europe/Berlin').split('/').pop()!.replace(/_/g, ' ') + ' time';
}
function fmtDate(d: Date, tz: string) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d); }
  catch { return d.toDateString(); }
}
function fmtTime(d: Date, tz: string) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d); }
  catch { return d.toISOString().slice(11, 16); }
}
function fmtDateTime(iso: string | null | undefined, tz: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${fmtDate(d, tz)} at ${fmtTime(d, tz)} (${tzLabel(tz)})`;
}
function money(amount: any, currency: any) {
  const n = Number(amount);
  if (!isFinite(n)) return '';
  const sym = String(currency || '').toUpperCase() === 'USD' || currency === '$' ? '$' : '€';
  return `${sym}${n.toFixed(2)}`;
}
function minutesLeft(iso: string | null | undefined) {
  if (!iso) return null;
  const m = Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
  return m > 0 ? m : null;
}
function humanDuration(mins: number | null) {
  if (mins === null) return '';
  if (mins < 90) return `${mins} minutes`;
  const h = Math.round(mins / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}

// Canonical, display-ready session facts (already HTML-escaped).
type Facts = {
  ref: string; subject: string; tutorName: string; studentName: string;
  date: string; time: string; duration: string; amount: string; due: string; dueLeft: string;
  status: string; kind: 'one-to-one' | 'group';
};

function factsFromSession(s: any): Facts {
  const tz = s.timezone || 'Europe/Berlin';
  let date = '', time = '';
  const start = s.starts_at ? new Date(s.starts_at) : null;
  const dur = Number(s.duration_minutes) || 60;
  if (start && !isNaN(start.getTime())) {
    const end = new Date(start.getTime() + dur * 60000);
    date = fmtDate(start, tz);
    time = `${fmtTime(start, tz)} – ${fmtTime(end, tz)} (${tzLabel(tz)})`;
  } else if (s.scheduled_date) {
    date = fmtDate(new Date(s.scheduled_date + 'T12:00:00Z'), 'UTC');
    time = s.scheduled_time ? `${String(s.scheduled_time).slice(0, 5)} (${tzLabel(tz)})` : '';
  }
  const left = minutesLeft(s.payment_due_at);
  return esc({
    ref: String(s.id || '').slice(0, 8).toUpperCase(),
    subject: s.subject || 'Tutoring session',
    tutorName: s.tutor_name || '',
    studentName: s.student_name || '',
    date, time,
    duration: `${dur} minutes`,
    amount: money(s.price ?? s.price_per_student, s.currency),
    due: fmtDateTime(s.payment_due_at, tz),
    dueLeft: left !== null ? humanDuration(left) : '',
    status: s.status || '',
    kind: s.price_per_student !== undefined ? 'group' : 'one-to-one',
  });
}

// Fallback when no session row is available (values from the caller, already escaped).
function factsFromData(d: any, sym: string): Facts {
  return {
    ref: d.sessionId ? String(d.sessionId).slice(0, 8).toUpperCase() : '',
    subject: d.subject || 'Tutoring session',
    tutorName: d.tutorName || '', studentName: d.studentName || '',
    date: d.date || '', time: d.time || '',
    duration: d.duration ? `${d.duration} minutes` : '',
    amount: d.amount ? `${sym}${d.amount}` : (d.price ? `${sym}${d.price}` : ''),
    due: '', dueLeft: '', status: '', kind: 'one-to-one',
  };
}

// ── Layout ───────────────────────────────────────────────────────────────────
type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
const TONES: Record<Tone, { bg: string; border: string; text: string; bar: string }> = {
  info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a', bar: '#1a6bff' },
  success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', bar: '#059669' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#78350f', bar: '#d97706' },
  danger:  { bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d', bar: '#dc2626' },
  neutral: { bg: '#f8fafc', border: '#e2e8f0', text: '#334155', bar: '#0b1f4a' },
};

type Email = {
  subject: string;
  preheader: string;
  tone: Tone;
  label: string;                 // small label above the title, e.g. "Booking confirmed"
  title: string;
  greeting?: string;             // first name
  intro: string[];               // paragraphs (may contain <strong>)
  details?: [string, string][];  // label/value rows
  detailsTitle?: string;
  callout?: { tone: Tone; title?: string; text: string };
  steps?: string[];
  stepsTitle?: string;
  cta?: { label: string; url: string };
  secondary?: string[];          // small print paragraphs
  ref?: string;
  audience?: 'user' | 'admin';
};

function strip(html: string) {
  return unesc(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
}

function renderHtml(e: Email): string {
  const t = TONES[e.tone];
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${s}</p>`;
  const rows = (e.details || []).filter(([, v]) => v).map(([k, v], i, arr) => `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#64748b;width:38%;vertical-align:top;${i < arr.length - 1 ? 'border-bottom:1px solid #eef2f7;' : ''}">${k}</td>
        <td style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600;vertical-align:top;${i < arr.length - 1 ? 'border-bottom:1px solid #eef2f7;' : ''}">${v}</td>
      </tr>`).join('');
  const callout = e.callout ? (() => {
    const c = TONES[e.callout!.tone];
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border-collapse:separate;">
        <tr><td style="background:${c.bg};border:1px solid ${c.border};border-left:4px solid ${c.bar};border-radius:8px;padding:14px 16px;">
          ${e.callout!.title ? `<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${c.text};">${e.callout!.title}</p>` : ''}
          <p style="margin:0;font-size:14px;line-height:1.55;color:${c.text};">${e.callout!.text}</p>
        </td></tr>
      </table>`;
  })() : '';
  const steps = e.steps && e.steps.length ? `
      <p style="margin:8px 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">${e.stepsTitle || 'What happens next'}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
        ${e.steps.map((s, i) => `
        <tr>
          <td style="width:30px;vertical-align:top;padding:2px 0 10px;">
            <div style="width:22px;height:22px;line-height:22px;border-radius:11px;background:${t.bar};color:#fff;font-size:12px;font-weight:700;text-align:center;">${i + 1}</div>
          </td>
          <td style="vertical-align:top;padding:2px 0 10px;font-size:14px;line-height:1.55;color:#334155;">${s}</td>
        </tr>`).join('')}
      </table>` : '';
  const cta = e.cta ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
        <tr><td style="border-radius:8px;background:#1a6bff;">
          <a href="${e.cta.url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${e.cta.label}</a>
        </td></tr>
      </table>` : '';
  const secondary = (e.secondary || []).map(s => `<p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#64748b;">${s}</p>`).join('');
  const footerLinks = e.audience === 'admin' ? '' : `
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
            <a href="${SITE}/legal.html#terms" style="color:#64748b;text-decoration:underline;">Terms</a> &nbsp;·&nbsp;
            <a href="${SITE}/legal.html#refund" style="color:#64748b;text-decoration:underline;">Refund Policy</a> &nbsp;·&nbsp;
            <a href="${SITE}/legal.html#payment" style="color:#64748b;text-decoration:underline;">Payment Terms</a> &nbsp;·&nbsp;
            <a href="${SITE}/legal.html#privacy" style="color:#64748b;text-decoration:underline;">Privacy</a>
          </p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e.subject}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:0 4px 16px;">
          <a href="${SITE}" style="text-decoration:none;"><img src="${LOGO_URL}" alt="UniSkilled" height="30" style="height:30px;width:auto;border:0;display:block;"></a>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <div style="height:4px;background:${t.bar};font-size:0;line-height:0;">&nbsp;</div>
          <div style="padding:30px 32px 8px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${t.bar};">${e.label}</p>
            <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">${e.title}</h1>
            ${e.greeting ? p(`Hi ${e.greeting},`) : ''}
            ${e.intro.map(p).join('')}
            ${callout}
            ${rows ? `
            <p style="margin:8px 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">${e.detailsTitle || 'Session details'}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;background:#fbfdff;">${rows}</table>` : ''}
            ${steps}
            ${cta}
            ${secondary}
          </div>
          <div style="padding:18px 32px 26px;border-top:1px solid #eef2f7;margin-top:8px;">
            <p style="margin:0;font-size:13px;line-height:1.55;color:#64748b;">Need help? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#1a6bff;text-decoration:none;">${SUPPORT}</a>${e.ref ? ` and quote booking reference <strong style="color:#334155;">#${e.ref}</strong>` : ''}.</p>
            <p style="margin:12px 0 0;font-size:13px;color:#334155;">Kind regards,<br><strong>The UniSkilled Team</strong></p>
          </div>
        </td></tr>
        <tr><td align="center" style="padding:20px 12px 8px;">
          ${footerLinks}
          <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">UniSkilled · University-verified online tutoring · <a href="${SITE}" style="color:#94a3b8;">uniskilled.com</a></p>
          <p style="margin:0;font-size:11px;color:#a8b4c4;">This is a service email about ${e.audience === 'admin' ? 'platform activity' : 'your UniSkilled account and bookings'}. You receive it because it concerns a booking or payment you are part of.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderText(e: Email): string {
  const out: string[] = [];
  out.push(strip(e.label).toUpperCase(), strip(e.title), '');
  if (e.greeting) out.push(`Hi ${strip(e.greeting)},`, '');
  e.intro.forEach(s => out.push(strip(s), ''));
  if (e.callout) out.push((e.callout.title ? strip(e.callout.title) + ' — ' : '') + strip(e.callout.text), '');
  const rows = (e.details || []).filter(([, v]) => v);
  if (rows.length) {
    out.push((e.detailsTitle || 'Session details').toUpperCase());
    rows.forEach(([k, v]) => out.push(`${strip(k)}: ${strip(v)}`));
    out.push('');
  }
  if (e.steps && e.steps.length) {
    out.push((e.stepsTitle || 'What happens next').toUpperCase());
    e.steps.forEach((s, i) => out.push(`${i + 1}. ${strip(s)}`));
    out.push('');
  }
  if (e.cta) out.push(`${strip(e.cta.label)}: ${e.cta.url}`, '');
  (e.secondary || []).forEach(s => out.push(strip(s), ''));
  out.push(`Need help? Reply to this email or write to ${SUPPORT}${e.ref ? ` and quote booking reference #${e.ref}` : ''}.`, '');
  out.push('Kind regards,', 'The UniSkilled Team', SITE);
  return out.join('\n');
}

// ── Reusable copy ────────────────────────────────────────────────────────────
const POLICY_SHORT = `Free cancellation up to 24 hours before the session, or within 30 minutes of paying. Cancellations later than that are not refunded. If your tutor cancels or moves the session, you can always get a full refund. <a href="${SITE}/legal.html#refund" style="color:#1a6bff;">Read the Refund Policy</a>.`;
const RESCHEDULE_SHORT = `Each session can be moved up to 2 times, to a new time within 30 days and at least 2 hours ahead. Both of you must agree to the new time.`;
const REFUND_TIMING = `Refunds go back to the original payment method. Card refunds usually appear within 5–10 business days, depending on your bank.`;
const PAYOUT_SHORT = `Your earnings for a session are released 48 hours after it has taken place, provided no issue has been reported.`;

function sessionRows(f: Facts, opts: { who?: 'tutor' | 'student' | 'both'; amountLabel?: string; extra?: [string, string][]; noAmount?: boolean } = {}): [string, string][] {
  const who = opts.who || 'both';
  const rows: [string, string][] = [['Subject', f.subject]];
  if ((who === 'tutor' || who === 'both') && f.tutorName) rows.push(['Tutor', f.tutorName]);
  if ((who === 'student' || who === 'both') && f.studentName) rows.push(['Student', f.studentName]);
  rows.push(['Date', f.date], ['Time', f.time], ['Duration', f.duration], ['Format', 'Online lesson in the UniSkilled classroom']);
  if (!opts.noAmount && f.amount) rows.push([opts.amountLabel || 'Price', f.amount]);
  (opts.extra || []).forEach(r => rows.push(r));
  if (f.ref) rows.push(['Booking reference', `#${f.ref}`]);
  return rows;
}

// ── Templates ────────────────────────────────────────────────────────────────
function build(type: string, d: any, f: Facts, role: 'student' | 'tutor' | null, raw: any): Email | null {
  const studentDash = `${SITE}/student-dashboard.html`;
  const tutorDash = `${SITE}/tutor-dashboard.html`;
  const sessionsLink = role === 'tutor' ? `${tutorDash}?tab=sessions` : studentDash;
  const payLink = `${SITE}/complete-payment.html?session=${encodeURIComponent(String(raw?.sessionId || ''))}`;
  const roomLink = raw?.sessionId ? `${SITE}/classroom.html?session=${encodeURIComponent(String(raw.sessionId))}` : '';
  const roomStep = roomLink
    ? `At the lesson time, open your <a href="${roomLink}" style="color:#1a6bff;font-weight:700;">lesson room</a>. It opens 10 minutes before the start, and you can also join from your dashboard.`
    : 'At the lesson time, join the lesson from your dashboard.';
  const rateLink = raw?.sessionId ? `${SITE}/rate-lesson.html?session=${encodeURIComponent(String(raw.sessionId))}` : `${SITE}/student-dashboard.html`;
  const when = f.date ? `${f.date}${f.time ? ', ' + f.time : ''}` : 'the agreed time';
  const shortDate = f.date ? f.date.replace(/, \d{4}$/, '').replace(/ \d{4}$/, '') : '';

  switch (type) {
    // ── Booking request ────────────────────────────────────────────────────
    case 'booking_request': {
      const isNegotiated = d.listedRate && d.price && Math.abs(Number(raw.price) - Number(raw.listedRate) * (Number(raw.duration) / 60)) >= 0.5;
      return {
        subject: `New booking request: ${f.subject} with ${f.studentName}${shortDate ? ' on ' + shortDate : ''}`,
        preheader: `${f.studentName} would like to book a ${f.subject} session. Review and respond from your dashboard.`,
        tone: 'info', label: 'New booking request', title: `${f.studentName} would like to book a session with you`,
        greeting: first(f.tutorName),
        intro: [
          `You have a new booking request for <strong>${f.subject}</strong>. Please review the details below and accept or decline it from your dashboard.`,
          ...(d.notes ? [`<strong>Message from ${first(f.studentName)}:</strong> “${d.notes}”`] : []),
        ],
        details: sessionRows(f, { who: 'student', amountLabel: 'Offered price' }),
        callout: isNegotiated
          ? { tone: 'warning', title: 'Negotiated price', text: `The student has offered a price that differs from your usual rate. Accepting the request means you agree to ${f.amount} for this session.` }
          : { tone: 'info', title: 'No payment has been taken yet', text: 'The student is only charged after you accept the request.' },
        steps: [
          'Accept or decline the request from your dashboard.',
          'If you accept, the student receives a payment link. They have up to 24 hours to pay, and the window always closes 1 hour before the session.',
          'Once payment is complete, the session is confirmed and we email you both.',
        ],
        cta: { label: 'Review the request', url: `${tutorDash}?tab=requests` },
        secondary: ['Responding quickly helps students plan and makes them more likely to book with you again.'],
        ref: f.ref,
      };
    }
    case 'booking_request_sent':
      return {
        subject: `Booking request sent: ${f.subject} with ${f.tutorName}${shortDate ? ' on ' + shortDate : ''}`,
        preheader: `We sent your request to ${f.tutorName}. You have not been charged.`,
        tone: 'info', label: 'Request received', title: `Your request has been sent to ${f.tutorName}`,
        greeting: first(f.studentName),
        intro: [`Thank you for booking with UniSkilled. We have sent your request for a <strong>${f.subject}</strong> session to <strong>${f.tutorName}</strong>.`],
        callout: { tone: 'info', title: 'You have not been charged', text: 'Payment is only requested after your tutor accepts.' },
        details: sessionRows(f, { who: 'tutor', amountLabel: 'Price offered' }),
        steps: [
          `${first(f.tutorName)} reviews your request and accepts or declines it. We email you either way.`,
          'If accepted, you receive a secure payment link. You have up to 24 hours to pay, and the window always closes 1 hour before the session.',
          'As soon as payment is complete, your session is confirmed.',
        ],
        cta: { label: 'View my bookings', url: studentDash },
        secondary: [POLICY_SHORT],
        ref: f.ref,
      };

    // ── Accepted, awaiting payment ─────────────────────────────────────────
    case 'awaiting_payment':
      return {
        subject: `Action required: complete payment for ${f.subject} with ${f.tutorName}`,
        preheader: `${f.tutorName} accepted your request. Pay${f.due ? ' by ' + strip(f.due) : ''} to confirm your session.`,
        tone: 'warning', label: 'Request accepted · payment required', title: `${f.tutorName} accepted your request`,
        greeting: first(f.studentName),
        intro: [`Good news: <strong>${f.tutorName}</strong> has accepted your <strong>${f.subject}</strong> session. To confirm it, please complete payment.`],
        callout: {
          tone: 'warning', title: f.due ? `Please pay by ${f.due}` : 'Please pay within the payment window',
          text: `${f.dueLeft ? `You have about <strong>${f.dueLeft}</strong> left. ` : ''}Your session is not confirmed until payment is complete. If it isn’t paid in time, the booking is released automatically and you will not be charged.`,
        },
        details: sessionRows(f, { who: 'tutor', amountLabel: 'Amount due' }),
        steps: [
          'Click the button below and pay securely by card (processed by Stripe).',
          'You receive a confirmation email with your receipt straight away.',
          'At the lesson time, join the lesson room from your dashboard.',
        ],
        cta: { label: `Pay ${f.amount || 'now'} and confirm`, url: payLink },
        secondary: [POLICY_SHORT],
        ref: f.ref,
      };
    case 'booking_accepted_tutor':
      return {
        subject: `You accepted: ${f.subject} with ${f.studentName}, waiting for payment`,
        preheader: `${f.studentName} has been asked to pay. The session is confirmed once they do.`,
        tone: 'info', label: 'Request accepted', title: `Waiting for ${first(f.studentName)} to pay`,
        greeting: first(f.tutorName),
        intro: [`You accepted <strong>${f.studentName}</strong>’s request for <strong>${f.subject}</strong>. We have sent them a secure payment link.`],
        callout: { tone: 'info', title: f.due ? `Payment deadline: ${f.due}` : 'Waiting for payment', text: 'The session is only confirmed once the student pays. If they don’t pay in time, the slot is released automatically and we let you know.' },
        details: sessionRows(f, { who: 'student' }),
        steps: ['We email you as soon as the student pays.', 'At the lesson time, join the lesson room from your dashboard.', PAYOUT_SHORT],
        cta: { label: 'View my sessions', url: `${tutorDash}?tab=sessions` },
        secondary: ['If something urgent comes up, you can cancel or ask to move the booking from your dashboard. The student is notified immediately.'],
        ref: f.ref,
      };
    case 'payment_reminder':
      return {
        subject: `Reminder: your ${f.subject} booking is released ${f.dueLeft ? 'in ' + strip(f.dueLeft) : 'soon'} unless paid`,
        preheader: `Complete payment${f.due ? ' by ' + strip(f.due) : ''} to keep your session with ${f.tutorName}.`,
        tone: 'warning', label: 'Payment reminder', title: 'Your session isn’t confirmed yet',
        greeting: first(f.studentName),
        intro: [`This is a friendly reminder that your <strong>${f.subject}</strong> session with <strong>${f.tutorName}</strong> is still waiting for payment.`],
        callout: { tone: 'warning', title: f.due ? `Pay by ${f.due}` : 'Payment due soon', text: 'After this deadline the booking is released automatically and the time slot becomes available to other students. You will not be charged.' },
        details: sessionRows(f, { who: 'tutor', amountLabel: 'Amount due' }),
        cta: { label: `Pay ${f.amount || 'now'} and confirm`, url: payLink },
        secondary: ['If you no longer need this session, you can cancel it from your dashboard. Nothing is charged.'],
        ref: f.ref,
      };

    // ── Paid & confirmed ───────────────────────────────────────────────────
    case 'booking_confirmed':
      return {
        subject: `Booking confirmed: ${f.subject} with ${f.tutorName}${shortDate ? ' on ' + shortDate : ''}`,
        preheader: `Payment received${f.amount ? ' (' + strip(f.amount) + ')' : ''}. Your session is confirmed.`,
        tone: 'success', label: 'Payment received · booking confirmed', title: 'Your session is confirmed',
        greeting: first(f.studentName),
        intro: [`Thank you for your payment. Your <strong>${f.subject}</strong> session with <strong>${f.tutorName}</strong> is confirmed for <strong>${when}</strong>.`],
        callout: { tone: 'success', title: `Payment received${f.amount ? ': ' + f.amount : ''}`, text: 'Keep this email as your receipt. Your card statement will show the charge from UniSkilled.' },
        details: sessionRows(f, { who: f.kind === 'group' ? 'tutor' : 'tutor', amountLabel: 'Amount paid' }),
        steps: [
          'Add the session to your calendar.',
          roomStep,
          'After the session you can leave a review. If something went wrong, report it within 48 hours.',
        ],
        cta: { label: 'View my session', url: studentDash },
        secondary: [POLICY_SHORT, RESCHEDULE_SHORT],
        ref: f.ref,
      };
    case 'payment_received':
      return {
        subject: `Session confirmed: ${f.studentName} paid for ${f.subject}${shortDate ? ' on ' + shortDate : ''}`,
        preheader: `${f.studentName} completed payment. The session is confirmed.`,
        tone: 'success', label: 'Payment received · session confirmed', title: `${first(f.studentName)} has paid. The session is confirmed`,
        greeting: first(f.tutorName),
        intro: [`<strong>${f.studentName}</strong> has completed payment for your <strong>${f.subject}</strong> session on <strong>${when}</strong>. It is now confirmed on both sides.`],
        details: sessionRows(f, { who: 'student', amountLabel: 'Session price' }),
        steps: ['Prepare any materials you need for the lesson. You can share files in the lesson chat.', roomStep, PAYOUT_SHORT],
        cta: { label: 'View session', url: `${tutorDash}?tab=sessions` },
        secondary: ['If something urgent comes up, ask to move the session or cancel it from your dashboard. If you cancel, the student is refunded in full.'],
        ref: f.ref,
      };

    // ── Declined / expired ─────────────────────────────────────────────────
    case 'booking_declined':
      return {
        subject: `Booking request not accepted: ${f.subject}${shortDate ? ' on ' + shortDate : ''}`,
        preheader: `${f.tutorName || 'The tutor'} couldn’t take this session. You have not been charged.`,
        tone: 'neutral', label: 'Request declined', title: `${f.tutorName || 'Your tutor'} can’t take this session`,
        greeting: first(f.studentName),
        intro: [`Unfortunately, your request for a <strong>${f.subject}</strong> session on <strong>${when}</strong> was not accepted. This is usually because the tutor is unavailable at that time.`],
        callout: { tone: 'success', title: 'You have not been charged', text: 'No payment was taken for this request.' },
        details: sessionRows(f, { who: 'tutor' }),
        steps: ['Try another time with the same tutor, or', 'Browse other university-verified tutors for this subject.'],
        stepsTitle: 'What you can do',
        cta: { label: 'Find a tutor', url: `${SITE}/find-tutors.html` },
        ref: f.ref,
      };
    case 'payment_expired':
      return {
        subject: `Booking released: payment window ended for ${f.subject}`,
        preheader: 'The payment deadline passed, so the booking was released. You have not been charged.',
        tone: 'neutral', label: 'Booking released', title: 'Your booking has been released',
        greeting: first(f.studentName),
        intro: [`The payment window for your <strong>${f.subject}</strong> session with <strong>${f.tutorName}</strong> has ended, so the booking was released automatically.`],
        callout: { tone: 'success', title: 'You have not been charged', text: 'No payment was taken.' },
        details: sessionRows(f, { who: 'tutor' }),
        steps: ['If you still want the session, send a new request. The tutor may still be available.'],
        stepsTitle: 'What you can do',
        cta: { label: 'Book again', url: `${SITE}/find-tutors.html` },
        ref: f.ref,
      };
    case 'payment_expired_tutor':
      return {
        subject: `Booking released: ${f.studentName} did not pay for ${f.subject}`,
        preheader: 'The student did not pay in time, so the slot is free again.',
        tone: 'neutral', label: 'Booking released', title: 'The slot is available again',
        greeting: first(f.tutorName),
        intro: [`<strong>${f.studentName}</strong> did not complete payment before the deadline, so the <strong>${f.subject}</strong> booking was released automatically. The time slot is free again in your calendar.`],
        details: sessionRows(f, { who: 'student', noAmount: true }),
        cta: { label: 'Open dashboard', url: tutorDash },
        ref: f.ref,
      };

    // ── Cancellation ───────────────────────────────────────────────────────
    case 'session_cancelled': {
      const by = d.cancelledBy === 'tutor' ? 'tutor' : 'student';
      const byMe = role === by;
      const canceller = by === 'tutor' ? f.tutorName : f.studentName;
      const unpaid = !!raw.unpaid, refunded = !!raw.refunded;
      let callout: Email['callout'];
      if (role === 'tutor') {
        callout = unpaid ? { tone: 'neutral', title: 'No payment involved', text: 'The booking had not been paid yet, so there is nothing to pay out or refund.' }
          : refunded ? { tone: 'neutral', title: 'Student refunded in full', text: `The student has been refunded${f.amount ? ' ' + f.amount : ''}, so there is no payout for this session.` }
          : { tone: 'success', title: 'You will still be paid for this session', text: `The student cancelled less than 24 hours before the session, so it is not refunded. Under our policy your earnings are released after the usual 48-hour hold.` };
      } else {
        callout = unpaid ? { tone: 'success', title: 'Nothing was charged', text: 'The booking had not been paid yet, so no payment was taken.' }
          : refunded ? { tone: 'success', title: `Full refund issued${f.amount ? ': ' + f.amount : ''}`, text: `${REFUND_TIMING} Any account credit you used has been restored to your balance.` }
          : { tone: 'danger', title: 'This cancellation is not refundable', text: 'The session was cancelled less than 24 hours before it started (or after a late reschedule), so under our Refund Policy no refund applies.' };
      }
      return {
        subject: `Session cancelled: ${f.subject}${shortDate ? ' on ' + shortDate : ''}${role === 'student' && !unpaid ? (refunded ? ' (full refund issued)' : ' (no refund)') : ''}`,
        preheader: byMe ? `You cancelled your ${strip(f.subject)} session.` : `${strip(canceller)} cancelled your ${strip(f.subject)} session.`,
        tone: 'danger', label: unpaid ? 'Booking cancelled' : 'Session cancelled',
        title: byMe ? 'You cancelled your session' : `${canceller} cancelled your session`,
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [
          byMe ? `This confirms that you cancelled your <strong>${f.subject}</strong> session${role === 'student' ? ` with <strong>${f.tutorName}</strong>` : ` with <strong>${f.studentName}</strong>`}, which was scheduled for <strong>${when}</strong>.`
               : `We’re sorry: <strong>${canceller}</strong> has cancelled your <strong>${f.subject}</strong> session, which was scheduled for <strong>${when}</strong>.`,
          ...(d.reason ? [`<strong>Reason given:</strong> “${d.reason}”`] : []),
        ],
        callout,
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', amountLabel: unpaid ? 'Price' : 'Amount paid' }),
        steps: role === 'tutor' ? ['The time slot is free again in your calendar.'] : ['Book another session with the same tutor, or', 'Find another university-verified tutor for this subject.'],
        stepsTitle: role === 'tutor' ? 'What happens next' : 'What you can do',
        cta: role === 'tutor' ? { label: 'Open dashboard', url: tutorDash } : { label: 'Find a tutor', url: `${SITE}/find-tutors.html` },
        secondary: role === 'student' && !unpaid ? [POLICY_SHORT] : [],
        ref: f.ref,
      };
    }

    // ── Rescheduling ───────────────────────────────────────────────────────
    case 'reschedule_requested': {
      const dash = d.dashboard === 'tutor-dashboard.html' ? tutorDash : studentDash;
      return {
        subject: `New time requested for ${f.subject}: ${strip(String(d.date || ''))}, ${strip(String(d.time || ''))}`,
        preheader: `${d.requesterName} asked to move your session. Please accept or decline.`,
        tone: 'info', label: 'Reschedule request', title: `${d.requesterName} asked to move your session`,
        greeting: first(d.recipientName),
        intro: [`<strong>${d.requesterName}</strong> would like to move your <strong>${f.subject}</strong> session to a new time. Please accept or decline the request from your dashboard.`],
        callout: { tone: 'info', title: `Proposed new time: ${d.date}, ${d.time}`, text: `Currently scheduled: ${when}. Nothing changes unless you accept. If you decline, or don’t answer before the session starts, it stays at its current time.` },
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', noAmount: true, extra: [['Requested new time', `${d.date}, ${d.time}`]] }),
        detailsTitle: 'Current session details',
        cta: { label: 'Accept or decline', url: dash },
        secondary: [RESCHEDULE_SHORT, ...(role === 'student' && raw.requesterRole === 'tutor' ? ['Because your tutor asked for this change, you can still cancel for a full refund if the new time doesn’t suit you.'] : [])],
        ref: f.ref,
      };
    }
    case 'reschedule_request_sent': {
      const dash = role === 'tutor' ? tutorDash : studentDash;
      return {
        subject: `Reschedule request sent for ${f.subject}`,
        preheader: `We asked ${strip(String(d.recipientName || ''))} to confirm the new time.`,
        tone: 'info', label: 'Reschedule request sent', title: 'Your request to move the session has been sent',
        greeting: first(d.requesterName),
        intro: [`We have asked <strong>${d.recipientName}</strong> to confirm a new time for your <strong>${f.subject}</strong> session. We will email you as soon as they reply.`],
        callout: { tone: 'info', title: `Requested new time: ${d.date}, ${d.time}`, text: `Until it is accepted, the session stays at its current time: ${when}.` },
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', noAmount: true }),
        detailsTitle: 'Current session details',
        cta: { label: 'View or withdraw request', url: dash },
        secondary: [
          RESCHEDULE_SHORT,
          ...(raw.isLate ? ['Because this request was made less than 24 hours before the session, the session will no longer be refundable if you later cancel it.'] : []),
        ],
        ref: f.ref,
      };
    }
    case 'reschedule_declined': {
      const dash = d.dashboard === 'tutor-dashboard.html' ? tutorDash : studentDash;
      return {
        subject: `Reschedule request declined: ${f.subject} stays at its current time`,
        preheader: `${strip(String(d.responderName || ''))} couldn’t make the new time.`,
        tone: 'neutral', label: 'Reschedule declined', title: 'Your session stays at its current time',
        greeting: first(d.recipientName),
        intro: [`<strong>${d.responderName}</strong> couldn’t make <strong>${d.date}, ${d.time}</strong>, so your <strong>${f.subject}</strong> session has not been moved.`],
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', noAmount: true }),
        detailsTitle: 'Your session (unchanged)',
        steps: ['Attend at the current time, or', 'Suggest a different time from your dashboard, or message the other person to find one that works.'],
        stepsTitle: 'What you can do',
        cta: { label: 'View session', url: dash },
        ref: f.ref,
      };
    }
    case 'session_rescheduled': {
      const unpaid = !!raw.unpaid;
      return {
        subject: `Session moved: ${f.subject} is now on ${shortDate || strip(String(d.date || ''))}`,
        preheader: `New time: ${strip(when)}.`,
        tone: 'success', label: 'Session rescheduled', title: 'Your session has a new time',
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [`Both sides have agreed, and your <strong>${f.subject}</strong> session has been moved.`],
        callout: { tone: 'success', title: `New time: ${when}`, text: d.prevWhen ? `Previously: ${d.prevWhen}.` : 'Please update your calendar.' },
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', amountLabel: unpaid ? 'Amount due' : 'Amount paid' }),
        detailsTitle: 'Updated session details',
        steps: unpaid
          ? (role === 'student'
              ? [`The booking still needs to be paid to be confirmed${f.due ? `. Please pay by <strong>${f.due}</strong>` : ''}.`, 'Join the lesson room from your dashboard at the new time.']
              : ['The student still needs to pay before the session is confirmed. We email you when they do.'])
          : [role === 'student' ? 'No new payment is needed. Your original payment covers the new time.' : 'No action needed. The payment carries over to the new time.', 'Join the lesson room from your dashboard at the new time.'],
        cta: unpaid && role === 'student' ? { label: 'Complete payment', url: payLink } : { label: 'View session', url: sessionsLink },
        secondary: [RESCHEDULE_SHORT],
        ref: f.ref,
      };
    }

    // ── Group sessions ─────────────────────────────────────────────────────
    case 'group_session_cancelled':
      return {
        subject: `Group session cancelled: ${f.subject}${raw.refunded ? ' (full refund issued)' : ''}`,
        preheader: 'The group session did not reach the minimum number of students.',
        tone: 'danger', label: 'Group session cancelled', title: 'Your group session has been cancelled',
        greeting: first(f.studentName),
        intro: [`The <strong>${f.subject}</strong> group session with <strong>${f.tutorName}</strong> did not reach the minimum of 2 paid students, so it has been cancelled.`],
        callout: raw.refunded
          ? { tone: 'success', title: 'Full refund issued', text: REFUND_TIMING }
          : { tone: 'warning', title: 'Refund in progress', text: 'Our team is processing your refund manually and will confirm by email.' },
        details: sessionRows(f, { who: 'tutor', amountLabel: 'Amount paid' }),
        cta: { label: 'Browse group sessions', url: `${SITE}/group-sessions.html` },
        ref: f.ref,
      };
    case 'group_session_cancelled_tutor':
      return {
        subject: `Group session cancelled: ${f.subject} (minimum not reached)`,
        preheader: 'Fewer than 2 students paid by 12 hours before the start.',
        tone: 'danger', label: 'Group session cancelled', title: 'Your group session has been cancelled',
        greeting: first(f.tutorName),
        intro: [`Your <strong>${f.subject}</strong> group session did not reach the minimum of 2 paid students by 12 hours before the start time, so it was cancelled automatically. Every student who paid has been refunded.`],
        details: sessionRows(f, { who: 'tutor', noAmount: true }),
        cta: { label: 'Create a new group session', url: `${tutorDash}?tab=groupSessions` },
        ref: f.ref,
      };

    // ── Disputes ───────────────────────────────────────────────────────────
    case 'dispute_opened':
      return {
        subject: `An issue was reported with your ${f.subject} session`,
        preheader: `${strip(String(d.openerName || ''))} reported an issue. Our team is reviewing it.`,
        tone: 'warning', label: 'Issue reported', title: 'An issue has been reported',
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [`<strong>${d.openerName}</strong> has reported an issue with your <strong>${f.subject}</strong> session. Our team will review it fairly, looking at both sides.`],
        callout: { tone: 'warning', title: 'Payment on hold during the review', text: 'Any payout or refund for this session is paused until the review is finished, usually within a few business days.' },
        details: sessionRows(f, { who: 'both' }),
        steps: ['Our team reviews the session and the report.', 'We may contact you for your side of the story. Please reply promptly.', 'We email you both with the outcome.'],
        cta: { label: 'Open dashboard', url: role === 'tutor' ? tutorDash : studentDash },
        ref: f.ref,
      };
    case 'dispute_submitted':
      return {
        subject: `We received your report about ${f.subject}`,
        preheader: 'Our team is reviewing your report and will follow up by email.',
        tone: 'info', label: 'Report received', title: 'Thank you, we’ve received your report',
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [`We have received your report about the <strong>${f.subject}</strong> session and opened a case.`, ...(d.reason ? [`<strong>Your report:</strong> “${d.reason}”`] : [])],
        callout: { tone: 'info', title: 'Payment on hold during the review', text: 'Any payout or refund for this session is paused until the review is finished, usually within a few business days.' },
        details: sessionRows(f, { who: 'both', extra: d.disputeId ? [['Case number', `#${String(d.disputeId).slice(0, 8).toUpperCase()}`]] : [] }),
        steps: ['Our team reviews the session and your report.', 'We may contact you or the other person for more details.', 'We email you with the outcome and any refund.'],
        cta: { label: 'Open dashboard', url: role === 'tutor' ? tutorDash : studentDash },
        secondary: ['You can add more information at any time by replying to this email.'],
        ref: f.ref,
      };
    case 'dispute_resolved':
      return {
        subject: `Issue resolved: ${f.subject}${raw.refunded ? ' (refund issued)' : ''}`,
        preheader: 'Our team has finished reviewing the reported issue.',
        tone: 'success', label: 'Issue resolved', title: 'The reported issue has been resolved',
        greeting: role ? first(role === 'tutor' ? f.tutorName : f.studentName) : undefined,
        intro: [
          `Our team has reviewed the issue reported for the <strong>${f.subject}</strong> session and the case is now closed.`,
          ...(d.notes ? [`<strong>Notes from our team:</strong> ${d.notes}`] : []),
        ],
        callout: d.outcome
          ? { tone: raw.refunded ? 'success' : 'info', title: 'Outcome', text: `${d.outcome}${raw.refunded && role !== 'tutor' ? ' ' + REFUND_TIMING : ''}` }
          : raw.refunded
          ? { tone: 'success', title: 'Outcome: refund issued to the student', text: role === 'tutor' ? 'Because the student was refunded, there is no payout for this session.' : REFUND_TIMING }
          : { tone: 'info', title: 'Outcome: no refund', text: role === 'tutor' ? 'Your payout for this session will now be released as normal.' : 'After reviewing the session, no refund applies. The tutor’s payout will be released as normal.' },
        details: f.date ? sessionRows(f, { who: 'both' }) : undefined,
        cta: { label: 'Open dashboard', url: role === 'tutor' ? tutorDash : studentDash },
        secondary: ['If you have new information about this case, reply to this email within 7 days.'],
        ref: f.ref,
      };

    // ── Rating reminder (day after the lesson) ─────────────────────────────
    case 'rate_lesson': {
      const stars = [1, 2, 3, 4, 5].map((n) =>
        `<a href="${rateLink}&stars=${n}" style="display:inline-block;margin:0 3px;font-size:34px;line-height:1;color:#f59e0b;text-decoration:none;" aria-label="${n} star${n > 1 ? 's' : ''}">&#9733;</a>`).join('');
      return {
        subject: `How was your ${f.subject} lesson with ${f.tutorName}?`,
        preheader: 'Rate your lesson in 20 seconds. It helps other students choose the right tutor.',
        tone: 'info', label: 'Rate your lesson', title: `How was your lesson with ${f.tutorName}?`,
        greeting: first(f.studentName),
        intro: [
          `We hope your <strong>${f.subject}</strong> lesson went well. Tap a star to rate it. It takes about 20 seconds and helps other students find the right tutor.`,
          `<div style="text-align:center;margin:6px 0 4px;">${stars}</div><div style="text-align:center;font-size:12px;color:#64748b;">1 = poor &nbsp;·&nbsp; 5 = excellent</div>`,
        ],
        details: sessionRows(f, { who: 'tutor', noAmount: true }),
        detailsTitle: 'Your lesson',
        cta: { label: 'Rate your lesson', url: rateLink },
        secondary: [
          'You can also leave private feedback that only UniSkilled sees. If something went wrong, you can report an issue from your dashboard within 48 hours of the lesson.',
        ],
        ref: f.ref,
      };
    }

    // ── Referral ───────────────────────────────────────────────────────────
    case 'referral_qualified':
      return {
        subject: `You earned €${d.amount} in UniSkilled credit`,
        preheader: 'Someone you referred just completed their first session.',
        tone: 'success', label: 'Referral reward', title: `€${d.amount} credit added to your account`,
        greeting: first(d.referrerName),
        intro: ['Someone you referred to UniSkilled has just completed their first session. Thank you for spreading the word. We have added credit to your account.'],
        callout: { tone: 'success', title: `+€${d.amount} account credit`, text: 'It is applied automatically to your next booking.' },
        cta: { label: 'View my referrals', url: `${studentDash}?tab=referrals` },
        secondary: ['There is no limit on how many friends you can refer.'],
      };

    // ── Admin ──────────────────────────────────────────────────────────────
    case 'dispute_opened_admin':
      return {
        subject: `[Admin] New dispute #${String(d.disputeId || '').slice(0, 8)}: ${f.subject}`,
        preheader: `${strip(String(d.openerName || ''))} opened a dispute.`,
        tone: 'warning', label: 'Admin · dispute opened', title: 'A new dispute needs review',
        intro: [`<strong>${d.openerName}</strong> opened a dispute on the <strong>${f.subject}</strong> session.`, `<strong>Reason:</strong><br><span style="white-space:pre-wrap;">${d.reason}</span>`],
        details: [...(f.date ? sessionRows(f, { who: 'both' }) : []), ['Dispute ID', String(d.disputeId || '')]],
        cta: { label: 'Review in admin console', url: `${SITE}/admin.html` },
        audience: 'admin',
      };
    case 'admin_transaction_alert':
      return {
        subject: `[Admin] New payment ${d.currency}${d.amount}: ${d.subject}`,
        preheader: `${strip(String(d.payerName || ''))} paid ${strip(String(d.currency || ''))}${strip(String(d.amount || ''))}.`,
        tone: 'success', label: 'Admin · payment received', title: `New payment: ${d.currency}${d.amount}`,
        intro: ['A new payment has been completed on UniSkilled.'],
        details: [['Amount', `${d.currency}${d.amount}`], ['Paid by', d.payerName], ['Session', `${d.subject} (${d.sessionKind})`]],
        detailsTitle: 'Payment details',
        cta: { label: 'View in admin console', url: `${SITE}/admin.html` },
        audience: 'admin',
      };
    case 'admin_payout_summary':
      return {
        subject: `[Admin] ${d.count} tutor payout${String(d.count) === '1' ? '' : 's'} released: ${d.currency}${d.total}`,
        preheader: 'Payouts released after the 48-hour hold.',
        tone: 'info', label: 'Admin · payouts released', title: 'Tutor payouts released',
        intro: [`<strong>${d.count}</strong> payout${String(d.count) === '1' ? '' : 's'} totalling <strong>${d.currency}${d.total}</strong> ${String(d.count) === '1' ? 'was' : 'were'} released to tutors after the 48-hour hold.`],
        cta: { label: 'View in admin console', url: `${SITE}/admin.html` },
        audience: 'admin',
      };
  }
  return null;
}

// ── Sending ──────────────────────────────────────────────────────────────────
async function deliver(type: string, to: string, e: Email): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: SUPPORT, subject: unesc(e.subject), html: renderHtml(e), text: renderText(e) }),
  });
  let result: any = null;
  try { result = await res.json(); } catch { /* ignore */ }
  console.log(`email ${type} -> ${maskEmail(to)}: ${res.status} ${result?.id || JSON.stringify(result)}`);
  return res.ok;
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
    const type = String(parsed.type || '');
    const raw: any = parsed.data || {};
    const data: any = esc(raw);
    const sym = ['€', '$'].includes(String(raw.currencySymbol)) ? String(raw.currencySymbol) : '€';
    let to = '';
    let recipientId: string | null = null;

    if (isServer) {
      to = String(parsed.to || '').trim().toLowerCase();
      if (!to && parsed.to_user_id) {
        recipientId = String(parsed.to_user_id);
        const { data: ru } = await sb.from('users').select('email').eq('id', recipientId).maybeSingle();
        to = String(ru?.email || '').trim().toLowerCase();
      }
    } else {
      // Browser callers: fixed set of booking emails, recipient by user id only, and only
      // someone who shares a session with the caller.
      if (!USER_SENDABLE_TYPES.includes(type)) return json({ error: 'Not allowed' }, 403);
      recipientId = String(parsed.to_user_id || '');
      if (!UUID.test(recipientId) || recipientId === callerId) return json({ error: 'Not allowed' }, 403);
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
      if (!recipientId) recipientId = u[0].id;
    }

    // Load the real session so every email shows accurate, complete details.
    let session: any = null;
    const sid = String(raw.sessionId || '');
    const gid = String(raw.groupSessionId || '');
    if (UUID.test(sid)) {
      const { data: s } = await sb.from('sessions').select('*').eq('id', sid).maybeSingle();
      // A browser caller may only reference a session they are part of, with that recipient.
      if (s && (isServer || ((s.student_id === callerId && s.tutor_id === recipientId) || (s.tutor_id === callerId && s.student_id === recipientId)))) session = s;
    } else if (isServer && UUID.test(gid)) {
      const { data: g } = await sb.from('group_sessions').select('*').eq('id', gid).maybeSingle();
      if (g) session = { ...g, student_name: raw.studentName || '' };
    }

    // Fill names, dates and amounts from the database; fall back to what the caller sent.
    const f: Facts = session ? factsFromSession(session) : factsFromData(data, sym);
    if (!f.studentName && data.studentName) f.studentName = data.studentName;
    if (!f.tutorName && data.tutorName) f.tutorName = data.tutorName;
    if (!f.date && data.date) f.date = data.date;
    if (!f.time && data.time) f.time = data.time;
    // Who is reading: student or tutor (personalises the wording).
    let role: 'student' | 'tutor' | null = raw.role === 'tutor' || raw.role === 'student' ? raw.role : null;
    if (!role && session && recipientId) role = recipientId === session.tutor_id ? 'tutor' : recipientId === session.student_id ? 'student' : null;
    if (!role) {
      if (['booking_request', 'payment_received', 'payment_expired_tutor', 'group_session_cancelled_tutor', 'booking_accepted_tutor'].includes(type)) role = 'tutor';
      else if (['booking_request_sent', 'awaiting_payment', 'booking_confirmed', 'booking_declined', 'payment_expired', 'payment_reminder', 'group_session_cancelled', 'rate_lesson'].includes(type)) role = 'student';
    }

    // What the student actually paid (after any credit or discount). Tutors keep seeing the session price.
    if (role !== 'tutor' && raw.amountPaid !== undefined && raw.amountPaid !== null && isFinite(Number(raw.amountPaid))) {
      f.amount = esc(money(raw.amountPaid, session?.currency || (sym === '$' ? 'USD' : 'EUR')));
    }

    const email = build(type, data, f, role, raw);
    if (!email) return json({ error: 'Unknown email type' }, 400);
    const ok = await deliver(type, to, email);

    // Copies for the person who took the action, so both sides always have a record.
    if (ok && !isServer && callerId) {
      const copyType = type === 'booking_request' ? 'booking_request_sent' : type === 'awaiting_payment' ? 'booking_accepted_tutor' : '';
      if (copyType) {
        const { data: cu } = await sb.from('users').select('email').eq('id', callerId).maybeSingle();
        const callerEmail = String(cu?.email || '').trim().toLowerCase();
        if (callerEmail) {
          const copy = build(copyType, data, f, copyType === 'booking_request_sent' ? 'student' : 'tutor', raw);
          if (copy) { try { await deliver(copyType, callerEmail, copy); } catch (e) { console.error('copy email failed:', String(e)); } }
        }
      }
    }

    return json({ ok }, ok ? 200 : 500);
  } catch (err) {
    console.error('Email error:', String(err));
    return json({ error: 'Email could not be sent' }, 500);
  }
});
