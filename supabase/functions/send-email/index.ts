import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { emailLang, makeT, localizeEnglishDate, localizeSentence, INTL, DIR, type Tx } from './i18n.ts';

// UniSkilled transactional email.
//
// Every email uses one professional layout: header, title, greeting, explanation,
// full session details (pulled from the database when a sessionId is given, so
// they are always accurate), a clear status box, "what happens next" steps,
// one action button, policy links, support contact and the booking reference.
// A plain-text version is sent alongside the HTML (better inbox placement).

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

type CalLinks = { google: string; ics: string } | null;

// ── Everything that writes text, in one language. English (t returns the text exactly as written)
// is the default; the recipient's chosen website language is used when we support it (i18n.ts).
function emailKit(t: Tx, lang: string) {
const intl = INTL[lang] || 'en-GB';
const rtl = DIR[lang] === 'rtl';
// Amounts stay in reading order (€30.00) inside right-to-left text.
const ltr = (v: string) => (rtl && v ? `\u200E${v}\u200E` : v);

// ── Dates & money
function tzLabel(tz: string) {
  const city = String(tz || 'Europe/Berlin').split('/').pop()!.replace(/_/g, ' ');
  return t`${city} time`;
}
function fmtDate(d: Date, tz: string) {
  try { return new Intl.DateTimeFormat(intl, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d); }
  catch { return d.toDateString(); }
}
function fmtTime(d: Date, tz: string) {
  try { return new Intl.DateTimeFormat(intl, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d); }
  catch { return d.toISOString().slice(11, 16); }
}
function fmtDateTime(iso: string | null | undefined, tz: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return t`${fmtDate(d, tz)} at ${fmtTime(d, tz)} (${tzLabel(tz)})`;
}
function money(amount: any, currency: any) {
  const n = Number(amount);
  if (!isFinite(n)) return '';
  const sym = String(currency || '').toUpperCase() === 'USD' || currency === '$' ? '$' : '€';
  return ltr(`${sym}${n.toFixed(2)}`);
}
function minutesLeft(iso: string | null | undefined) {
  if (!iso) return null;
  const m = Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
  return m > 0 ? m : null;
}
function humanDuration(mins: number | null) {
  if (mins === null) return '';
  if (mins < 90) return t`${mins} minutes`;
  const h = Math.round(mins / 60);
  return h === 1 ? t`${h} hour` : t`${h} hours`;
}

// Canonical, display-ready session facts (already HTML-escaped).
type Facts = {
  ref: string; subject: string; tutorName: string; studentName: string;
  date: string; time: string; duration: string; amount: string; due: string; dueLeft: string;
  status: string; kind: 'one-to-one' | 'group';
  examDate: string;
};

// A plain calendar date (YYYY-MM-DD) shown as "Monday 2 February 2027". Empty when missing or invalid.
function fmtPlainDate(v: any): string {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(s + 'T12:00:00Z');
  return isNaN(d.getTime()) ? '' : fmtDate(d, 'UTC');
}

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
    subject: s.subject || t`Tutoring session`,
    tutorName: s.tutor_name || '',
    studentName: s.student_name || '',
    date, time,
    duration: t`${dur} minutes`,
    amount: money(s.price ?? s.price_per_student, s.currency),
    due: fmtDateTime(s.payment_due_at, tz),
    dueLeft: left !== null ? humanDuration(left) : '',
    status: s.status || '',
    kind: s.price_per_student !== undefined ? 'group' : 'one-to-one',
    examDate: fmtPlainDate(s.exam_date),
  });
}

// Fallback when no session row is available (values from the caller, already escaped).
function factsFromData(d: any, sym: string): Facts {
  return {
    ref: d.sessionId ? String(d.sessionId).slice(0, 8).toUpperCase() : '',
    subject: d.subject || t`Tutoring session`,
    tutorName: d.tutorName || '', studentName: d.studentName || '',
    date: d.date || '', time: d.time || '',
    duration: d.duration ? t`${d.duration} minutes` : '',
    amount: ltr(d.amount ? `${sym}${d.amount}` : (d.price ? `${sym}${d.price}` : '')),
    due: '', dueLeft: '', status: '', kind: 'one-to-one',
    examDate: fmtPlainDate(d.examDate),
  };
}

// ── Calendar links (only for real one-to-one sessions with a start time)
// The .ics link carries a signature so only people who received the email can open it.
async function calendarToken(sessionId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('cal:' + sessionId));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
async function calendarLinks(s: any): Promise<CalLinks> {
  if (!s || !s.id || !s.starts_at || s.price_per_student !== undefined) return null;
  const start = new Date(s.starts_at);
  if (isNaN(start.getTime())) return null;
  const end = s.ends_at ? new Date(s.ends_at) : new Date(start.getTime() + (Number(s.duration_minutes) || 60) * 60000);
  const room = `${SITE}/classroom.html?session=${encodeURIComponent(s.id)}`;
  const g = new URLSearchParams({
    action: 'TEMPLATE',
    text: `UniSkilled lesson: ${s.subject || 'Tutoring session'}`,
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
    details: `Online lesson on UniSkilled.\nJoin here: ${room}`,
    location: room,
  });
  const token = await calendarToken(s.id);
  return {
    google: `https://calendar.google.com/calendar/render?${g.toString()}`,
    ics: `${Deno.env.get('SUPABASE_URL')}/functions/v1/session-calendar?s=${encodeURIComponent(s.id)}&t=${token}`,
  };
}
function calendarLine(cal: CalLinks): string {
  if (!cal) return t`Add the session to your calendar.`;
  return t`Add it to your calendar: <a href="${cal.google}" style="color:#1a6bff;font-weight:700;">Google Calendar</a> · <a href="${cal.ics}" style="color:#1a6bff;font-weight:700;">Apple / Outlook</a>.`;
}

// ── Layout
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
  label: string;
  title: string;
  greeting?: string;
  intro: string[];
  details?: [string, string][];
  detailsTitle?: string;
  callout?: { tone: Tone; title?: string; text: string };
  steps?: string[];
  stepsTitle?: string;
  cta?: { label: string; url: string };
  secondary?: string[];
  ref?: string;
  audience?: 'user' | 'admin';
};

function strip(html: string) {
  return unesc(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
}

const hi = (g: string) => (lang !== 'en' && g === 'there' ? t`Hello,` : t`Hi ${g},`);

function renderHtml(e: Email): string {
  const tn = TONES[e.tone];
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
        <tr><td style="background:${c.bg};border:1px solid ${c.border};border-${rtl ? 'right' : 'left'}:4px solid ${c.bar};border-radius:8px;padding:14px 16px;">
          ${e.callout!.title ? `<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${c.text};">${e.callout!.title}</p>` : ''}
          <p style="margin:0;font-size:14px;line-height:1.55;color:${c.text};">${e.callout!.text}</p>
        </td></tr>
      </table>`;
  })() : '';
  const steps = e.steps && e.steps.length ? `
      <p style="margin:8px 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">${e.stepsTitle || t`What happens next`}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
        ${e.steps.map((s, i) => `
        <tr>
          <td style="width:30px;vertical-align:top;padding:2px 0 10px;">
            <div style="width:22px;height:22px;line-height:22px;border-radius:11px;background:${tn.bar};color:#fff;font-size:12px;font-weight:700;text-align:center;">${i + 1}</div>
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
            <a href="${SITE}/legal.html#terms" style="color:#64748b;text-decoration:underline;">${t`Terms`}</a> &nbsp;·&nbsp;
            <a href="${SITE}/legal.html#refund" style="color:#64748b;text-decoration:underline;">${t`Refund Policy`}</a> &nbsp;·&nbsp;
            <a href="${SITE}/legal.html#payment" style="color:#64748b;text-decoration:underline;">${t`Payment Terms`}</a> &nbsp;·&nbsp;
            <a href="${SITE}/legal.html#privacy" style="color:#64748b;text-decoration:underline;">${t`Privacy`}</a>
          </p>`;

  return `<!doctype html>
<html lang="${lang}"${rtl ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e.subject}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" ${rtl ? 'dir="rtl" ' : ''}style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td${rtl ? ' dir="ltr" align="left"' : ''} style="padding:0 4px 16px;">
          <a href="${SITE}" style="text-decoration:none;"><img src="${LOGO_URL}" alt="UniSkilled" height="30" style="height:30px;width:auto;border:0;display:block;"></a>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <div style="height:4px;background:${tn.bar};font-size:0;line-height:0;">&nbsp;</div>
          <div style="padding:30px 32px 8px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${tn.bar};">${e.label}</p>
            <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">${e.title}</h1>
            ${e.greeting ? p(hi(e.greeting)) : ''}
            ${e.intro.map(p).join('')}
            ${callout}
            ${rows ? `
            <p style="margin:8px 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">${e.detailsTitle || t`Session details`}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;background:#fbfdff;">${rows}</table>` : ''}
            ${steps}
            ${cta}
            ${secondary}
          </div>
          <div style="padding:18px 32px 26px;border-top:1px solid #eef2f7;margin-top:8px;">
            <p style="margin:0;font-size:13px;line-height:1.55;color:#64748b;">${e.ref ? t`Need help? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#1a6bff;text-decoration:none;">${SUPPORT}</a> and quote booking reference <strong style="color:#334155;">#${e.ref}</strong>.` : t`Need help? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#1a6bff;text-decoration:none;">${SUPPORT}</a>.`}</p>
            <p style="margin:12px 0 0;font-size:13px;color:#334155;">${t`Kind regards,`}<br><strong>${t`The UniSkilled Team`}</strong></p>
          </div>
        </td></tr>
        <tr><td align="center" style="padding:20px 12px 8px;">
          ${footerLinks}
          <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">${t`UniSkilled · University-verified online tutoring`} · <a href="${SITE}" style="color:#94a3b8;">uniskilled.com</a></p>
          <p style="margin:0;font-size:11px;color:#a8b4c4;">${e.audience === 'admin' ? 'This is a service email about platform activity. You receive it because it concerns a booking or payment you are part of.' : t`This is a service email about your UniSkilled account and bookings. You receive it because it concerns a booking or payment you are part of.`}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderText(e: Email): string {
  const out: string[] = [];
  out.push(strip(e.label).toUpperCase(), strip(e.title), '');
  if (e.greeting) out.push(hi(strip(e.greeting)), '');
  e.intro.forEach(s => out.push(strip(s), ''));
  if (e.callout) out.push((e.callout.title ? strip(e.callout.title) + ' — ' : '') + strip(e.callout.text), '');
  const rows = (e.details || []).filter(([, v]) => v);
  if (rows.length) {
    out.push((e.detailsTitle || t`Session details`).toUpperCase());
    rows.forEach(([k, v]) => out.push(`${strip(k)}: ${strip(v)}`));
    out.push('');
  }
  if (e.steps && e.steps.length) {
    out.push((e.stepsTitle || t`What happens next`).toUpperCase());
    e.steps.forEach((s, i) => out.push(`${i + 1}. ${strip(s)}`));
    out.push('');
  }
  if (e.cta) out.push(`${strip(e.cta.label)}: ${e.cta.url}`, '');
  (e.secondary || []).forEach(s => out.push(strip(s), ''));
  out.push(e.ref ? t`Need help? Reply to this email or write to ${SUPPORT} and quote booking reference #${e.ref}.` : t`Need help? Reply to this email or write to ${SUPPORT}.`, '');
  out.push(t`Kind regards,`, t`The UniSkilled Team`, SITE);
  return out.join('\n');
}

// ── Reusable copy
const POLICY_SHORT = t`Free cancellation up to 24 hours before the session, or within 30 minutes of paying. Cancellations later than that are not refunded. If your tutor cancels or moves the session, you can always get a full refund. <a href="${SITE}/legal.html#refund" style="color:#1a6bff;">Read the Refund Policy</a>.`;
const RESCHEDULE_SHORT = t`Each session can be moved up to 2 times, to a new time within 30 days and at least 2 hours ahead. Both of you must agree to the new time.`;
const REFUND_TIMING = t`Refunds go back to the original payment method. Card refunds usually appear within 5–10 business days, depending on your bank.`;
const PAYOUT_SHORT = t`Your earnings for a session are released 48 hours after it has taken place, provided no issue has been reported.`;

function sessionRows(f: Facts, opts: { who?: 'tutor' | 'student' | 'both'; amountLabel?: string; extra?: [string, string][]; noAmount?: boolean } = {}): [string, string][] {
  const who = opts.who || 'both';
  const rows: [string, string][] = [[t`Subject`, f.subject]];
  if ((who === 'tutor' || who === 'both') && f.tutorName) rows.push([t`Tutor`, f.tutorName]);
  if ((who === 'student' || who === 'both') && f.studentName) rows.push([t`Student`, f.studentName]);
  rows.push([t`Date`, f.date], [t`Time`, f.time], [t`Duration`, f.duration], [t`Format`, t`Online lesson in the UniSkilled classroom`]);
  if (f.examDate) rows.push([t`Exam date`, f.examDate]);
  if (!opts.noAmount && f.amount) rows.push([opts.amountLabel || t`Price`, f.amount]);
  (opts.extra || []).forEach(r => rows.push(r));
  if (f.ref) rows.push([t`Booking reference`, `#${f.ref}`]);
  return rows;
}

// ── Templates
function build(type: string, d: any, f: Facts, role: 'student' | 'tutor' | null, raw: any, cal: CalLinks = null): Email | null {
  const studentDash = `${SITE}/student-dashboard.html`;
  const tutorDash = `${SITE}/tutor-dashboard.html`;
  const sessionsLink = role === 'tutor' ? `${tutorDash}?tab=sessions` : studentDash;
  const payLink = `${SITE}/complete-payment.html?session=${encodeURIComponent(String(raw?.sessionId || ''))}`;
  const roomLink = raw?.sessionId ? `${SITE}/classroom.html?session=${encodeURIComponent(String(raw.sessionId))}` : '';
  const roomStep = roomLink
    ? t`At the lesson time, open your <a href="${roomLink}" style="color:#1a6bff;font-weight:700;">lesson room</a>. It opens 10 minutes before the start, and you can also join from your dashboard.`
    : t`At the lesson time, join the lesson from your dashboard.`;
  const rateLink = raw?.sessionId ? `${SITE}/rate-lesson.html?session=${encodeURIComponent(String(raw.sessionId))}` : `${SITE}/student-dashboard.html`;
  const when = f.date ? `${f.date}${f.time ? t`, ` + f.time : ''}` : t`the agreed time`;
  const shortDate = f.date ? f.date.replace(/, \d{4}$/, '').replace(/ \d{4}$/, '') : '';

  switch (type) {
    case 'booking_request': {
      const isNegotiated = d.listedRate && d.price && Math.abs(Number(raw.price) - Number(raw.listedRate) * (Number(raw.duration) / 60)) >= 0.5;
      return {
        subject: t`New booking request: ${f.subject} with ${f.studentName}${shortDate ? t` on ` + shortDate : ''}`,
        preheader: t`${f.studentName} would like to book a ${f.subject} session. Review and respond from your dashboard.`,
        tone: 'info', label: t`New booking request`, title: t`${f.studentName} would like to book a session with you`,
        greeting: first(f.tutorName),
        intro: [
          t`You have a new booking request for <strong>${f.subject}</strong>. Please review the details below and accept or decline it from your dashboard.`,
          ...(d.notes ? [t`<strong>Message from ${first(f.studentName)}:</strong> “${d.notes}”`] : []),
        ],
        details: sessionRows(f, { who: 'student', amountLabel: t`Offered price` }),
        callout: isNegotiated
          ? { tone: 'warning', title: t`Negotiated price`, text: t`The student has offered a price that differs from your usual rate. Accepting the request means you agree to ${f.amount} for this session.` }
          : { tone: 'info', title: t`No payment has been taken yet`, text: t`The student is only charged after you accept the request.` },
        steps: [
          t`Accept or decline the request from your dashboard.`,
          t`If you accept, the student receives a payment link. They have up to 24 hours to pay, and the window always closes 1 hour before the session.`,
          t`Once payment is complete, the session is confirmed and we email you both.`,
        ],
        cta: { label: t`Review the request`, url: `${tutorDash}?tab=requests` },
        secondary: [t`Responding quickly helps students plan and makes them more likely to book with you again.`],
        ref: f.ref,
      };
    }
    case 'booking_request_sent':
      return {
        subject: t`Booking request sent: ${f.subject} with ${f.tutorName}${shortDate ? t` on ` + shortDate : ''}`,
        preheader: t`We sent your request to ${f.tutorName}. You have not been charged.`,
        tone: 'info', label: t`Request received`, title: t`Your request has been sent to ${f.tutorName}`,
        greeting: first(f.studentName),
        intro: [t`Thank you for booking with UniSkilled. We have sent your request for a <strong>${f.subject}</strong> session to <strong>${f.tutorName}</strong>.`],
        callout: { tone: 'info', title: t`You have not been charged`, text: t`Payment is only requested after your tutor accepts.` },
        details: sessionRows(f, { who: 'tutor', amountLabel: t`Price offered` }),
        steps: [
          t`${first(f.tutorName)} reviews your request and accepts or declines it. We email you either way.`,
          t`If accepted, you receive a secure payment link. You have up to 24 hours to pay, and the window always closes 1 hour before the session.`,
          t`As soon as payment is complete, your session is confirmed.`,
        ],
        cta: { label: t`View my bookings`, url: studentDash },
        secondary: [POLICY_SHORT],
        ref: f.ref,
      };

    case 'awaiting_payment':
      return {
        subject: t`Action required: complete payment for ${f.subject} with ${f.tutorName}`,
        preheader: t`${f.tutorName} accepted your request. Pay${f.due ? t` by ` + strip(f.due) : ''} to confirm your session.`,
        tone: 'warning', label: t`Request accepted · payment required`, title: t`${f.tutorName} accepted your request`,
        greeting: first(f.studentName),
        intro: [t`Good news: <strong>${f.tutorName}</strong> has accepted your <strong>${f.subject}</strong> session. To confirm it, please complete payment.`],
        callout: {
          tone: 'warning', title: f.due ? t`Please pay by ${f.due}` : t`Please pay within the payment window`,
          text: t`${f.dueLeft ? t`You have about <strong>${f.dueLeft}</strong> left. ` : ''}Your session is not confirmed until payment is complete. If it isn’t paid in time, the booking is released automatically and you will not be charged.`,
        },
        details: sessionRows(f, { who: 'tutor', amountLabel: t`Amount due` }),
        steps: [
          t`Click the button below and pay securely by card (processed by Stripe).`,
          t`You receive a confirmation email with your receipt straight away.`,
          t`At the lesson time, join the lesson room from your dashboard.`,
        ],
        cta: { label: t`Pay ${f.amount || t`now`} and confirm`, url: payLink },
        secondary: [POLICY_SHORT],
        ref: f.ref,
      };
    case 'booking_accepted_tutor':
      return {
        subject: t`You accepted: ${f.subject} with ${f.studentName}, waiting for payment`,
        preheader: t`${f.studentName} has been asked to pay. The session is confirmed once they do.`,
        tone: 'info', label: t`Request accepted`, title: t`Waiting for ${first(f.studentName)} to pay`,
        greeting: first(f.tutorName),
        intro: [t`You accepted <strong>${f.studentName}</strong>’s request for <strong>${f.subject}</strong>. We have sent them a secure payment link.`],
        callout: { tone: 'info', title: f.due ? t`Payment deadline: ${f.due}` : t`Waiting for payment`, text: t`The session is only confirmed once the student pays. If they don’t pay in time, the slot is released automatically and we let you know.` },
        details: sessionRows(f, { who: 'student' }),
        steps: [t`We email you as soon as the student pays.`, t`At the lesson time, join the lesson room from your dashboard.`, PAYOUT_SHORT],
        cta: { label: t`View my sessions`, url: `${tutorDash}?tab=sessions` },
        secondary: [t`If something urgent comes up, you can cancel or ask to move the booking from your dashboard. The student is notified immediately.`],
        ref: f.ref,
      };
    case 'payment_reminder':
      return {
        subject: t`Reminder: your ${f.subject} booking is released ${f.dueLeft ? t`in ` + strip(f.dueLeft) : t`soon`} unless paid`,
        preheader: t`Complete payment${f.due ? t` by ` + strip(f.due) : ''} to keep your session with ${f.tutorName}.`,
        tone: 'warning', label: t`Payment reminder`, title: t`Your session isn’t confirmed yet`,
        greeting: first(f.studentName),
        intro: [t`This is a friendly reminder that your <strong>${f.subject}</strong> session with <strong>${f.tutorName}</strong> is still waiting for payment.`],
        callout: { tone: 'warning', title: f.due ? t`Pay by ${f.due}` : t`Payment due soon`, text: t`After this deadline the booking is released automatically and the time slot becomes available to other students. You will not be charged.` },
        details: sessionRows(f, { who: 'tutor', amountLabel: t`Amount due` }),
        cta: { label: t`Pay ${f.amount || t`now`} and confirm`, url: payLink },
        secondary: [t`If you no longer need this session, you can cancel it from your dashboard. Nothing is charged.`],
        ref: f.ref,
      };

    case 'booking_confirmed':
      return {
        subject: t`Booking confirmed: ${f.subject} with ${f.tutorName}${shortDate ? t` on ` + shortDate : ''}`,
        preheader: t`Payment received${f.amount ? ' (' + strip(f.amount) + ')' : ''}. Your session is confirmed.`,
        tone: 'success', label: t`Payment received · booking confirmed`, title: t`Your session is confirmed`,
        greeting: first(f.studentName),
        intro: [t`Thank you for your payment. Your <strong>${f.subject}</strong> session with <strong>${f.tutorName}</strong> is confirmed for <strong>${when}</strong>.`],
        callout: { tone: 'success', title: t`Payment received${f.amount ? ': ' + f.amount : ''}`, text: t`Keep this email as your receipt. Your card statement will show the charge from UniSkilled.` },
        details: sessionRows(f, { who: f.kind === 'group' ? 'tutor' : 'tutor', amountLabel: t`Amount paid` }),
        steps: [
          calendarLine(cal),
          roomStep,
          t`After the session you can leave a review. If something went wrong, report it within 48 hours.`,
        ],
        cta: { label: t`View my session`, url: studentDash },
        secondary: [POLICY_SHORT, RESCHEDULE_SHORT],
        ref: f.ref,
      };
    case 'payment_received':
      return {
        subject: t`Session confirmed: ${f.studentName} paid for ${f.subject}${shortDate ? t` on ` + shortDate : ''}`,
        preheader: t`${f.studentName} completed payment. The session is confirmed.`,
        tone: 'success', label: t`Payment received · session confirmed`, title: t`${first(f.studentName)} has paid. The session is confirmed`,
        greeting: first(f.tutorName),
        intro: [t`<strong>${f.studentName}</strong> has completed payment for your <strong>${f.subject}</strong> session on <strong>${when}</strong>. It is now confirmed on both sides.`],
        details: sessionRows(f, { who: 'student', amountLabel: t`Session price` }),
        steps: [t`Prepare any materials you need for the lesson. You can share files in the lesson chat.`, calendarLine(cal), roomStep, PAYOUT_SHORT],
        cta: { label: t`View session`, url: `${tutorDash}?tab=sessions` },
        secondary: [t`If something urgent comes up, ask to move the session or cancel it from your dashboard. If you cancel, the student is refunded in full.`],
        ref: f.ref,
      };

    case 'booking_declined':
      return {
        subject: t`Booking request not accepted: ${f.subject}${shortDate ? t` on ` + shortDate : ''}`,
        preheader: t`${f.tutorName || t`The tutor`} couldn’t take this session. You have not been charged.`,
        tone: 'neutral', label: t`Request declined`, title: t`${f.tutorName || t`Your tutor`} can’t take this session`,
        greeting: first(f.studentName),
        intro: [t`Unfortunately, your request for a <strong>${f.subject}</strong> session on <strong>${when}</strong> was not accepted. This is usually because the tutor is unavailable at that time.`],
        callout: { tone: 'success', title: t`You have not been charged`, text: t`No payment was taken for this request.` },
        details: sessionRows(f, { who: 'tutor' }),
        steps: [t`Try another time with the same tutor, or`, t`Browse other university-verified tutors for this subject.`],
        stepsTitle: t`What you can do`,
        cta: { label: t`Find a tutor`, url: `${SITE}/find-tutors.html` },
        ref: f.ref,
      };
    case 'payment_expired':
      return {
        subject: t`Booking released: payment window ended for ${f.subject}`,
        preheader: t`The payment deadline passed, so the booking was released. You have not been charged.`,
        tone: 'neutral', label: t`Booking released`, title: t`Your booking has been released`,
        greeting: first(f.studentName),
        intro: [t`The payment window for your <strong>${f.subject}</strong> session with <strong>${f.tutorName}</strong> has ended, so the booking was released automatically.`],
        callout: { tone: 'success', title: t`You have not been charged`, text: t`No payment was taken.` },
        details: sessionRows(f, { who: 'tutor' }),
        steps: [t`If you still want the session, send a new request. The tutor may still be available.`],
        stepsTitle: t`What you can do`,
        cta: { label: t`Book again`, url: `${SITE}/find-tutors.html` },
        ref: f.ref,
      };
    case 'payment_expired_tutor':
      return {
        subject: t`Booking released: ${f.studentName} did not pay for ${f.subject}`,
        preheader: t`The student did not pay in time, so the slot is free again.`,
        tone: 'neutral', label: t`Booking released`, title: t`The slot is available again`,
        greeting: first(f.tutorName),
        intro: [t`<strong>${f.studentName}</strong> did not complete payment before the deadline, so the <strong>${f.subject}</strong> booking was released automatically. The time slot is free again in your calendar.`],
        details: sessionRows(f, { who: 'student', noAmount: true }),
        cta: { label: t`Open dashboard`, url: tutorDash },
        ref: f.ref,
      };

    case 'session_cancelled': {
      const by = d.cancelledBy === 'tutor' ? 'tutor' : 'student';
      const byMe = role === by;
      const canceller = by === 'tutor' ? f.tutorName : f.studentName;
      const unpaid = !!raw.unpaid, refunded = !!raw.refunded;
      let callout: Email['callout'];
      if (role === 'tutor') {
        callout = unpaid ? { tone: 'neutral', title: t`No payment involved`, text: t`The booking had not been paid yet, so there is nothing to pay out or refund.` }
          : refunded ? { tone: 'neutral', title: t`Student refunded in full`, text: t`The student has been refunded${f.amount ? ' ' + f.amount : ''}, so there is no payout for this session.` }
          : { tone: 'success', title: t`You will still be paid for this session`, text: t`The student cancelled less than 24 hours before the session, so it is not refunded. Under our policy your earnings are released after the usual 48-hour hold.` };
      } else {
        callout = unpaid ? { tone: 'success', title: t`Nothing was charged`, text: t`The booking had not been paid yet, so no payment was taken.` }
          : refunded ? { tone: 'success', title: t`Full refund issued${f.amount ? ': ' + f.amount : ''}`, text: t`${REFUND_TIMING} Any account credit you used has been restored to your balance.` }
          : { tone: 'danger', title: t`This cancellation is not refundable`, text: t`The session was cancelled less than 24 hours before it started (or after a late reschedule), so under our Refund Policy no refund applies.` };
      }
      return {
        subject: t`Session cancelled: ${f.subject}${shortDate ? t` on ` + shortDate : ''}${role === 'student' && !unpaid ? (refunded ? t` (full refund issued)` : t` (no refund)`) : ''}`,
        preheader: byMe ? t`You cancelled your ${strip(f.subject)} session.` : t`${strip(canceller)} cancelled your ${strip(f.subject)} session.`,
        tone: 'danger', label: unpaid ? t`Booking cancelled` : t`Session cancelled`,
        title: byMe ? t`You cancelled your session` : t`${canceller} cancelled your session`,
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [
          byMe ? t`This confirms that you cancelled your <strong>${f.subject}</strong> session${role === 'student' ? t` with <strong>${f.tutorName}</strong>` : t` with <strong>${f.studentName}</strong>`}, which was scheduled for <strong>${when}</strong>.`
               : t`We’re sorry: <strong>${canceller}</strong> has cancelled your <strong>${f.subject}</strong> session, which was scheduled for <strong>${when}</strong>.`,
          ...(d.reason ? [t`<strong>Reason given:</strong> “${d.reason}”`] : []),
        ],
        callout,
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', amountLabel: unpaid ? t`Price` : t`Amount paid` }),
        steps: role === 'tutor' ? [t`The time slot is free again in your calendar.`] : [t`Book another session with the same tutor, or`, t`Find another university-verified tutor for this subject.`],
        stepsTitle: role === 'tutor' ? t`What happens next` : t`What you can do`,
        cta: role === 'tutor' ? { label: t`Open dashboard`, url: tutorDash } : { label: t`Find a tutor`, url: `${SITE}/find-tutors.html` },
        secondary: role === 'student' && !unpaid ? [POLICY_SHORT] : [],
        ref: f.ref,
      };
    }

    case 'reschedule_requested': {
      const dash = d.dashboard === 'tutor-dashboard.html' ? tutorDash : studentDash;
      return {
        subject: t`New time requested for ${f.subject}: ${strip(String(d.date || ''))}, ${strip(String(d.time || ''))}`,
        preheader: t`${d.requesterName} asked to move your session. Please accept or decline.`,
        tone: 'info', label: t`Reschedule request`, title: t`${d.requesterName} asked to move your session`,
        greeting: first(d.recipientName),
        intro: [t`<strong>${d.requesterName}</strong> would like to move your <strong>${f.subject}</strong> session to a new time. Please accept or decline the request from your dashboard.`],
        callout: { tone: 'info', title: t`Proposed new time: ${d.date}, ${d.time}`, text: t`Currently scheduled: ${when}. Nothing changes unless you accept. If you decline, or don’t answer before the session starts, it stays at its current time.` },
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', noAmount: true, extra: [[t`Requested new time`, t`${d.date}, ${d.time}`]] }),
        detailsTitle: t`Current session details`,
        cta: { label: t`Accept or decline`, url: dash },
        secondary: [RESCHEDULE_SHORT, ...(role === 'student' && raw.requesterRole === 'tutor' ? [t`Because your tutor asked for this change, you can still cancel for a full refund if the new time doesn’t suit you.`] : [])],
        ref: f.ref,
      };
    }
    case 'reschedule_request_sent': {
      const dash = role === 'tutor' ? tutorDash : studentDash;
      return {
        subject: t`Reschedule request sent for ${f.subject}`,
        preheader: t`We asked ${strip(String(d.recipientName || ''))} to confirm the new time.`,
        tone: 'info', label: t`Reschedule request sent`, title: t`Your request to move the session has been sent`,
        greeting: first(d.requesterName),
        intro: [t`We have asked <strong>${d.recipientName}</strong> to confirm a new time for your <strong>${f.subject}</strong> session. We will email you as soon as they reply.`],
        callout: { tone: 'info', title: t`Requested new time: ${d.date}, ${d.time}`, text: t`Until it is accepted, the session stays at its current time: ${when}.` },
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', noAmount: true }),
        detailsTitle: t`Current session details`,
        cta: { label: t`View or withdraw request`, url: dash },
        secondary: [
          RESCHEDULE_SHORT,
          ...(raw.isLate ? [t`Because this request was made less than 24 hours before the session, the session will no longer be refundable if you later cancel it.`] : []),
        ],
        ref: f.ref,
      };
    }
    case 'reschedule_declined': {
      const dash = d.dashboard === 'tutor-dashboard.html' ? tutorDash : studentDash;
      return {
        subject: t`Reschedule request declined: ${f.subject} stays at its current time`,
        preheader: t`${strip(String(d.responderName || ''))} couldn’t make the new time.`,
        tone: 'neutral', label: t`Reschedule declined`, title: t`Your session stays at its current time`,
        greeting: first(d.recipientName),
        intro: [t`<strong>${d.responderName}</strong> couldn’t make <strong>${d.date}, ${d.time}</strong>, so your <strong>${f.subject}</strong> session has not been moved.`],
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', noAmount: true }),
        detailsTitle: t`Your session (unchanged)`,
        steps: [t`Attend at the current time, or`, t`Suggest a different time from your dashboard, or message the other person to find one that works.`],
        stepsTitle: t`What you can do`,
        cta: { label: t`View session`, url: dash },
        ref: f.ref,
      };
    }
    case 'session_rescheduled': {
      const unpaid = !!raw.unpaid;
      return {
        subject: t`Session moved: ${f.subject} is now on ${shortDate || strip(String(d.date || ''))}`,
        preheader: t`New time: ${strip(when)}.`,
        tone: 'success', label: t`Session rescheduled`, title: t`Your session has a new time`,
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [t`Both sides have agreed, and your <strong>${f.subject}</strong> session has been moved.`],
        callout: { tone: 'success', title: t`New time: ${when}`, text: d.prevWhen ? t`Previously: ${d.prevWhen}.` : t`Please update your calendar.` },
        details: sessionRows(f, { who: role === 'tutor' ? 'student' : 'tutor', amountLabel: unpaid ? t`Amount due` : t`Amount paid` }),
        detailsTitle: t`Updated session details`,
        steps: unpaid
          ? (role === 'student'
              ? [t`The booking still needs to be paid to be confirmed${f.due ? t`. Please pay by <strong>${f.due}</strong>` : ''}.`, t`Join the lesson room from your dashboard at the new time.`]
              : [t`The student still needs to pay before the session is confirmed. We email you when they do.`])
          : [role === 'student' ? t`No new payment is needed. Your original payment covers the new time.` : t`No action needed. The payment carries over to the new time.`, t`Join the lesson room from your dashboard at the new time.`],
        cta: unpaid && role === 'student' ? { label: t`Complete payment`, url: payLink } : { label: t`View session`, url: sessionsLink },
        secondary: [RESCHEDULE_SHORT],
        ref: f.ref,
      };
    }

    case 'group_session_cancelled':
      return {
        subject: t`Group session cancelled: ${f.subject}${raw.refunded ? t` (full refund issued)` : ''}`,
        preheader: t`The group session did not reach the minimum number of students.`,
        tone: 'danger', label: t`Group session cancelled`, title: t`Your group session has been cancelled`,
        greeting: first(f.studentName),
        intro: [t`The <strong>${f.subject}</strong> group session with <strong>${f.tutorName}</strong> did not reach the minimum of 2 paid students, so it has been cancelled.`],
        callout: raw.refunded
          ? { tone: 'success', title: t`Full refund issued`, text: REFUND_TIMING }
          : { tone: 'warning', title: t`Refund in progress`, text: t`Our team is processing your refund manually and will confirm by email.` },
        details: sessionRows(f, { who: 'tutor', amountLabel: t`Amount paid` }),
        cta: { label: t`Browse group sessions`, url: `${SITE}/group-sessions.html` },
        ref: f.ref,
      };
    case 'group_session_cancelled_tutor':
      return {
        subject: t`Group session cancelled: ${f.subject} (minimum not reached)`,
        preheader: t`Fewer than 2 students paid by 12 hours before the start.`,
        tone: 'danger', label: t`Group session cancelled`, title: t`Your group session has been cancelled`,
        greeting: first(f.tutorName),
        intro: [t`Your <strong>${f.subject}</strong> group session did not reach the minimum of 2 paid students by 12 hours before the start time, so it was cancelled automatically. Every student who paid has been refunded.`],
        details: sessionRows(f, { who: 'tutor', noAmount: true }),
        cta: { label: t`Create a new group session`, url: `${tutorDash}?tab=groupSessions` },
        ref: f.ref,
      };

    case 'dispute_opened':
      return {
        subject: t`An issue was reported with your ${f.subject} session`,
        preheader: t`${strip(String(d.openerName || ''))} reported an issue. Our team is reviewing it.`,
        tone: 'warning', label: t`Issue reported`, title: t`An issue has been reported`,
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [t`<strong>${d.openerName}</strong> has reported an issue with your <strong>${f.subject}</strong> session. Our team will review it fairly, looking at both sides.`],
        callout: { tone: 'warning', title: t`Payment on hold during the review`, text: t`Any payout or refund for this session is paused until the review is finished, usually within a few business days.` },
        details: sessionRows(f, { who: 'both' }),
        steps: [t`Our team reviews the session and the report.`, t`We may contact you for your side of the story. Please reply promptly.`, t`We email you both with the outcome.`],
        cta: { label: t`Open dashboard`, url: role === 'tutor' ? tutorDash : studentDash },
        ref: f.ref,
      };
    case 'dispute_submitted':
      return {
        subject: t`We received your report about ${f.subject}`,
        preheader: t`Our team is reviewing your report and will follow up by email.`,
        tone: 'info', label: t`Report received`, title: t`Thank you, we’ve received your report`,
        greeting: first(role === 'tutor' ? f.tutorName : f.studentName),
        intro: [t`We have received your report about the <strong>${f.subject}</strong> session and opened a case.`, ...(d.reason ? [t`<strong>Your report:</strong> “${d.reason}”`] : [])],
        callout: { tone: 'info', title: t`Payment on hold during the review`, text: t`Any payout or refund for this session is paused until the review is finished, usually within a few business days.` },
        details: sessionRows(f, { who: 'both', extra: d.disputeId ? [[t`Case number`, `#${String(d.disputeId).slice(0, 8).toUpperCase()}`]] : [] }),
        steps: [t`Our team reviews the session and your report.`, t`We may contact you or the other person for more details.`, t`We email you with the outcome and any refund.`],
        cta: { label: t`Open dashboard`, url: role === 'tutor' ? tutorDash : studentDash },
        secondary: [t`You can add more information at any time by replying to this email.`],
        ref: f.ref,
      };
    case 'dispute_resolved':
      return {
        subject: t`Issue resolved: ${f.subject}${raw.refunded ? t` (refund issued)` : ''}`,
        preheader: t`Our team has finished reviewing the reported issue.`,
        tone: 'success', label: t`Issue resolved`, title: t`The reported issue has been resolved`,
        greeting: role ? first(role === 'tutor' ? f.tutorName : f.studentName) : undefined,
        intro: [
          t`Our team has reviewed the issue reported for the <strong>${f.subject}</strong> session and the case is now closed.`,
          ...(d.notes ? [t`<strong>Notes from our team:</strong> ${d.notes}`] : []),
        ],
        callout: d.outcome
          ? { tone: raw.refunded ? 'success' : 'info', title: t`Outcome`, text: `${d.outcome}${raw.refunded && role !== 'tutor' ? ' ' + REFUND_TIMING : ''}` }
          : raw.refunded
          ? { tone: 'success', title: t`Outcome: refund issued to the student`, text: role === 'tutor' ? t`Because the student was refunded, there is no payout for this session.` : REFUND_TIMING }
          : { tone: 'info', title: t`Outcome: no refund`, text: role === 'tutor' ? t`Your payout for this session will now be released as normal.` : t`After reviewing the session, no refund applies. The tutor’s payout will be released as normal.` },
        details: f.date ? sessionRows(f, { who: 'both' }) : undefined,
        cta: { label: t`Open dashboard`, url: role === 'tutor' ? tutorDash : studentDash },
        secondary: [t`If you have new information about this case, reply to this email within 7 days.`],
        ref: f.ref,
      };

    case 'rate_lesson': {
      const stars = [1, 2, 3, 4, 5].map((n) =>
        `<a href="${rateLink}&stars=${n}" style="display:inline-block;margin:0 3px;font-size:34px;line-height:1;color:#f59e0b;text-decoration:none;" aria-label="${n > 1 ? t`${n} stars` : t`${n} star`}">&#9733;</a>`).join('');
      return {
        subject: t`How was your ${f.subject} lesson with ${f.tutorName}?`,
        preheader: t`Rate your lesson in 20 seconds. It helps other students choose the right tutor.`,
        tone: 'info', label: t`Rate your lesson`, title: t`How was your lesson with ${f.tutorName}?`,
        greeting: first(f.studentName),
        intro: [
          t`We hope your <strong>${f.subject}</strong> lesson went well. Tap a star to rate it. It takes about 20 seconds and helps other students find the right tutor.`,
          t`<div style="text-align:center;margin:6px 0 4px;">${stars}</div><div style="text-align:center;font-size:12px;color:#64748b;">1 = poor &nbsp;·&nbsp; 5 = excellent</div>`,
        ],
        details: sessionRows(f, { who: 'tutor', noAmount: true }),
        detailsTitle: t`Your lesson`,
        cta: { label: t`Rate your lesson`, url: rateLink },
        secondary: [
          t`You can also leave private feedback that only UniSkilled sees. If something went wrong, you can report an issue from your dashboard within 48 hours of the lesson.`,
        ],
        ref: f.ref,
      };
    }

    case 'referral_qualified':
      return {
        subject: t`You earned €${d.amount} in UniSkilled credit`,
        preheader: t`Someone you referred just completed their first session.`,
        tone: 'success', label: t`Referral reward`, title: t`€${d.amount} credit added to your account`,
        greeting: first(d.referrerName),
        intro: [t`Someone you referred to UniSkilled has just completed their first session. Thank you for spreading the word. We have added credit to your account.`],
        callout: { tone: 'success', title: t`+€${d.amount} account credit`, text: t`It is applied automatically to your next booking.` },
        cta: { label: t`View my referrals`, url: `${studentDash}?tab=referrals` },
        secondary: [t`There is no limit on how many friends you can refer.`],
      };

    case 'payout_sent':
      return {
        subject: t`Payout sent: ${d.payoutAmount} for ${f.subject || t`your session`}`,
        preheader: t`Your earnings are on their way to your bank account.`,
        tone: 'success', label: t`Payout sent`, title: t`${d.payoutAmount} is on its way to you`,
        greeting: first(f.tutorName || d.tutorName),
        intro: [t`The 48-hour hold for your <strong>${f.subject || t`session`}</strong> has ended with no issue reported, so we have released your earnings.`],
        callout: { tone: 'success', title: t`${d.payoutAmount} paid out`, text: t`Banks usually take 1 to 3 business days to show the money in your account. You can follow it in your Stripe Express dashboard.` },
        details: f.date ? sessionRows(f, { who: 'student', noAmount: true, extra: [[t`Your payout`, String(d.payoutAmount)]] }) : [[t`Subject`, f.subject || ''], [t`Your payout`, String(d.payoutAmount)]],
        cta: { label: t`View my dashboard`, url: `${tutorDash}?tab=overview` },
        ref: f.ref,
      };

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
    // ── Lesson reminders (sent to both sides, 24 hours and 1 hour before the start)
    case 'session_reminder': {
      const soon = raw.window === '1h';
      const isTutor = role === 'tutor';
      const other = isTutor ? f.studentName : f.tutorName;
      const lessonDay = shortDate ? t` on ${shortDate}` : '';
      return {
        subject: soon
          ? t`Starts in 1 hour: your ${f.subject} lesson with ${other}`
          : t`Coming up${lessonDay}: your ${f.subject} lesson with ${other}`,
        preheader: soon
          ? t`Your lesson starts at ${strip(f.time.split(' – ')[0] || '')}. The lesson room opens 10 minutes before.`
          : t`A reminder of your lesson with ${strip(other)}${lessonDay}.`,
        tone: 'info', label: soon ? t`Starting soon` : t`Lesson reminder`,
        title: soon ? t`Your lesson starts in 1 hour` : t`Your lesson is coming up`,
        greeting: first(isTutor ? f.tutorName : f.studentName),
        intro: [soon
          ? t`Your <strong>${f.subject}</strong> lesson with <strong>${other}</strong> starts in about an hour. The lesson room opens 10 minutes before the start.`
          : t`This is a reminder of your <strong>${f.subject}</strong> lesson with <strong>${other}</strong> on <strong>${when}</strong>.`],
        callout: soon
          ? { tone: 'info', title: t`Before you join`, text: t`Use a laptop or phone with a camera and microphone, and a stable internet connection. Have your notes and questions ready.` }
          : isTutor
            ? { tone: 'info', title: t`Prepare for the lesson`, text: t`${f.examDate ? t`${first(f.studentName)}'s exam is on <strong>${f.examDate}</strong>. ` : ''}Check the booking notes and prepare any materials. You can share files in the lesson chat.` }
            : { tone: 'info', title: t`Need to change something?`, text: t`You can ask to move the lesson from your dashboard. Free cancellation ends 24 hours before the start.` },
        details: sessionRows(f, { who: isTutor ? 'student' : 'tutor', noAmount: true }),
        detailsTitle: t`Your lesson`,
        steps: soon ? [roomStep] : [calendarLine(cal), roomStep],
        stepsTitle: soon ? t`How to join` : t`Before the lesson`,
        cta: soon && roomLink ? { label: t`Open the lesson room`, url: roomLink } : { label: t`View my lesson`, url: sessionsLink },
        secondary: isTutor ? [PAYOUT_SHORT] : [t`If something goes wrong during the lesson, you can report it from your dashboard within 48 hours.`],
        ref: f.ref,
      };
    }

    // ── A tutor has not answered a request yet
    case 'request_nudge_tutor':
      return {
        subject: t`Reminder: ${f.studentName} is waiting for your answer (${f.subject})`,
        preheader: t`Please accept or decline ${strip(f.studentName)}'s request. Unanswered requests are released automatically.`,
        tone: 'warning', label: t`Waiting for your answer`, title: t`${first(f.studentName)} is still waiting for your answer`,
        greeting: first(f.tutorName),
        intro: [t`You have not answered <strong>${f.studentName}</strong>’s request for a <strong>${f.subject}</strong> session yet. Please accept or decline it, so they can plan.`],
        callout: { tone: 'warning', title: d.releaseAt ? t`Please answer by ${d.releaseAt}` : t`Please answer soon`, text: t`If a request gets no answer in time, it is released automatically and the student is told to choose another tutor.` },
        details: sessionRows(f, { who: 'student', amountLabel: t`Offered price` }),
        cta: { label: t`Answer the request`, url: `${tutorDash}?tab=requests` },
        secondary: [t`Can’t take it? Declining is fine and takes one click. It is better for the student than no answer. To stop requests at times you can’t teach, block them in your availability settings.`],
        ref: f.ref,
      };

    // ── A request got no answer and was released
    case 'request_expired_student':
      return {
        subject: t`No answer from ${f.tutorName}: your ${f.subject} request was released`,
        preheader: t`Your tutor did not answer in time. You have not been charged.`,
        tone: 'neutral', label: t`Request released`, title: t`${f.tutorName || t`Your tutor`} didn’t answer in time`,
        greeting: first(f.studentName),
        intro: [t`We are sorry. <strong>${f.tutorName}</strong> did not answer your request for a <strong>${f.subject}</strong> session in time, so we released it. You can book another tutor straight away.`],
        callout: { tone: 'success', title: t`You have not been charged`, text: t`No payment was taken for this request.` },
        details: sessionRows(f, { who: 'tutor', noAmount: true }),
        steps: [t`Book another university-verified tutor for the same subject, or`, t`Send the same tutor a message and request a new time.`],
        stepsTitle: t`What you can do`,
        cta: { label: t`Find a ${f.subject} tutor`, url: `${SITE}/find-tutors.html?q=${encodeURIComponent(String(raw?.subject || ''))}` },
        ref: f.ref,
      };
    case 'request_expired_tutor':
      return {
        subject: t`Request released: ${f.studentName}'s ${f.subject} request got no answer`,
        preheader: t`The request was not answered in time, so it was released.`,
        tone: 'neutral', label: t`Request released`, title: t`A request was released without an answer`,
        greeting: first(f.tutorName),
        intro: [t`<strong>${f.studentName}</strong>’s request for a <strong>${f.subject}</strong> session was not answered in time, so it was released and the student was told to choose another tutor.`],
        details: sessionRows(f, { who: 'student', noAmount: true }),
        cta: { label: t`Open dashboard`, url: tutorDash },
        secondary: [t`Students book tutors who answer quickly. Keep your availability up to date so you only get requests at times you can teach.`],
        ref: f.ref,
      };

    // ── Course requests
    case 'admin_course_requests': {
      const list = Array.isArray(d.requests) ? d.requests : [];
      return {
        subject: `[Admin] ${list.length} new course request${list.length === 1 ? '' : 's'} with no tutor yet`,
        preheader: 'Students asked for courses. Recruit tutors for these.',
        tone: 'info', label: 'Admin · course requests', title: `${list.length} new course request${list.length === 1 ? '' : 's'}`,
        intro: ['Students asked for help with these courses. Each one is a tutor to recruit.'],
        details: list.slice(0, 25).map((r: any) => [
          `${r.subject || 'Course'}${r.university ? ' · ' + r.university : ''}`,
          [r.studentName, r.level, r.language].filter(Boolean).join(' · ') || '—',
        ]) as [string, string][],
        detailsTitle: 'Requested courses',
        cta: { label: 'Open admin console', url: `${SITE}/admin.html` },
        audience: 'admin',
      };
    }
    case 'course_request_match':
      return {
        subject: t`A tutor for ${d.subject} just joined UniSkilled`,
        preheader: t`You asked for help with ${strip(String(d.subject || ''))}. A tutor who teaches it is now available.`,
        tone: 'success', label: t`Tutor found`, title: t`A tutor for ${d.subject} is now available`,
        greeting: first(d.studentName),
        intro: [t`You asked for help with <strong>${d.subject}</strong>. A university-verified tutor who teaches it has just joined UniSkilled.`],
        cta: { label: t`See tutors`, url: `${SITE}/find-tutors.html?q=${encodeURIComponent(String(raw?.subject || ''))}` },
        secondary: [t`You only get this email once for each request.`],
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

// ── Sending
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

return { factsFromSession, factsFromData, build, deliver, calendarLinks, money };
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

    let session: any = null;
    const sid = String(raw.sessionId || '');
    const gid = String(raw.groupSessionId || '');
    if (UUID.test(sid)) {
      const { data: s } = await sb.from('sessions').select('*').eq('id', sid).maybeSingle();
      if (s && (isServer || ((s.student_id === callerId && s.tutor_id === recipientId) || (s.tutor_id === callerId && s.student_id === recipientId)))) session = s;
    } else if (isServer && UUID.test(gid)) {
      const { data: g } = await sb.from('group_sessions').select('*').eq('id', gid).maybeSingle();
      if (g) session = { ...g, student_name: raw.studentName || '' };
    }

    // The language each person chose on the website; English when none is chosen or it isn't supported yet.
    const isAdminType = type.startsWith('admin_') || type === 'dispute_opened_admin';
    const langOf = async (uid: string | null): Promise<string> => {
      if (!uid || isAdminType) return 'en';
      try {
        const { data: au } = await sb.auth.admin.getUserById(uid);
        return emailLang(au?.user?.user_metadata?.ui_locale);
      } catch { return 'en'; }
    };
    const DATE_FIELDS = ['date', 'time', 'prevWhen', 'releaseAt'];
    const prepare = (lang: string) => {
      const t = makeT(lang);
      const kit = emailKit(t, lang);
      const d: any = lang === 'en' ? data : { ...data };
      if (lang !== 'en') for (const k of DATE_FIELDS) if (typeof d[k] === 'string') d[k] = localizeEnglishDate(d[k], lang, t);
      if (DIR[lang] === 'rtl' && typeof d.payoutAmount === 'string') d.payoutAmount = `\u200E${d.payoutAmount}\u200E`;
      if (lang !== 'en' && typeof d.outcome === 'string') d.outcome = localizeSentence(d.outcome, lang, t);
      const f = session ? kit.factsFromSession(session) : kit.factsFromData(d, sym);
      if (!f.studentName && d.studentName) f.studentName = d.studentName;
      if (!f.tutorName && d.tutorName) f.tutorName = d.tutorName;
      if (!f.date && d.date) f.date = d.date;
      if (!f.time && d.time) f.time = d.time;
      if (role !== 'tutor' && raw.amountPaid !== undefined && raw.amountPaid !== null && isFinite(Number(raw.amountPaid))) {
        f.amount = esc(kit.money(raw.amountPaid, session?.currency || (sym === '$' ? 'USD' : 'EUR')));
      }
      return { kit, f, d };
    };

    let role: 'student' | 'tutor' | null = raw.role === 'tutor' || raw.role === 'student' ? raw.role : null;
    if (!role && session && recipientId) role = recipientId === session.tutor_id ? 'tutor' : recipientId === session.student_id ? 'student' : null;
    if (!role) {
      if (['booking_request', 'payment_received', 'payout_sent', 'payment_expired_tutor', 'group_session_cancelled_tutor', 'booking_accepted_tutor', 'request_nudge_tutor', 'request_expired_tutor'].includes(type)) role = 'tutor';
      else if (['booking_request_sent', 'awaiting_payment', 'booking_confirmed', 'booking_declined', 'payment_expired', 'payment_reminder', 'group_session_cancelled', 'rate_lesson', 'request_expired_student', 'course_request_match'].includes(type)) role = 'student';
    }

    const main = prepare(await langOf(recipientId));
    let cal: CalLinks = null;
    if (session && ['booking_confirmed', 'payment_received', 'session_reminder'].includes(type)) {
      try { cal = await main.kit.calendarLinks(session); } catch (e) { console.error('calendar links failed (non-critical):', String(e)); }
    }

    const email = main.kit.build(type, main.d, main.f, role, raw, cal);
    if (!email) return json({ error: 'Unknown email type' }, 400);
    const ok = await main.kit.deliver(type, to, email);

    if (ok && !isServer && callerId) {
      const copyType = type === 'booking_request' ? 'booking_request_sent' : type === 'awaiting_payment' ? 'booking_accepted_tutor' : '';
      if (copyType) {
        const { data: cu } = await sb.from('users').select('email').eq('id', callerId).maybeSingle();
        const callerEmail = String(cu?.email || '').trim().toLowerCase();
        if (callerEmail) {
          const mine = prepare(await langOf(callerId));
          const copy = mine.kit.build(copyType, mine.d, mine.f, copyType === 'booking_request_sent' ? 'student' : 'tutor', raw);
          if (copy) { try { await mine.kit.deliver(copyType, callerEmail, copy); } catch (e) { console.error('copy email failed:', String(e)); } }
        }
      }
    }

    return json({ ok }, ok ? 200 : 500);
  } catch (err) {
    console.error('Email error:', String(err));
    return json({ error: 'Email could not be sent' }, 500);
  }
});
