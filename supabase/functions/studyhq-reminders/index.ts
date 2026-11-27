import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

// Study Campus — the morning email. Runs every hour at :07 (pg_cron job "studyhq-reminders").
//
// Only students who turned it on in Study Campus → Settings get it, at the hour they chose, in
// their own time zone, and only on days with something to do: tasks planned for today (or still
// open from earlier days), assignments due today or in the next two days, and exams in the next
// seven days. A day with nothing due sends nothing.
//
// Each student is "claimed" first (last_sent_on set to their local date only if it is not set
// yet), so a slow or repeated run can never send the same email twice.
//
// The Sunday summary (weekly_email): Sunday at 18:00 in the student's time zone, what they got done
// this week and what is coming next week. Same claim-first rule (weekly_sent_on), so never twice.
//
// Deployed 27 Nov 2026 after approval. The email is built here (same look as the other UniSkilled
// emails) and sent with Resend, so the booking and payment emails in send-email are not touched.
// Study Campus is in English, so is this email.

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'UniSkilled <info@uniskilled.com>';
const SUPPORT = 'info@uniskilled.com';
const SITE = 'https://uniskilled.com';
const STUDY = `${SITE}/studyhq.html`;
const DAY = 86400000;
const MAX_LINES = 8;

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function isTrustedCaller(req: Request, supabase: any): Promise<boolean> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (safeEqual(token, SERVICE_KEY)) return true;
  const cronSecret = req.headers.get('x-cron-secret') || '';
  if (!cronSecret) return false;
  const { data, error } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret });
  return !error && data === true;
}

// The student's local date (YYYY-MM-DD) and hour, in their own time zone.
function localNow(tz: string, now: Date): { date: string; hour: number } {
  let zone = tz;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); } catch { zone = 'Europe/Berlin'; }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
function localWeekday(tz: string, now: Date): number { // 0 = Sunday
  let zone = tz;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); } catch { zone = 'Europe/Berlin'; }
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(now));
}
const WEEKLY_HOUR = 18;
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
function localDate(iso: string, tz: string): string { return localNow(tz, new Date(iso)).date; }

// One line of the email: what it is and how many days from today. whenText() words it.
type Line = { kind: 'exam' | 'assignment' | 'task'; title: string; course: string | null; days: number; late: boolean };
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

async function linesFor(supabase: any, userId: string, tz: string, today: string): Promise<Line[]> {
  const out: Line[] = [];
  const { data: items } = await supabase.from('study_items')
    .select('kind, title, course_label, due_at, planned_for, status')
    .eq('user_id', userId).in('kind', ['task', 'assignment']).neq('status', 'done').limit(500);
  for (const i of items || []) {
    if (i.kind === 'assignment' && i.due_at) {
      const d = localDate(i.due_at, tz), n = daysBetween(today, d);
      if (n >= -7 && n <= 2) out.push({ kind: 'assignment', title: i.title, course: i.course_label, days: n, late: n < 0 });
    } else if (i.kind === 'task' && i.planned_for) {
      const n = daysBetween(today, i.planned_for);
      if (n >= -7 && n <= 0) out.push({ kind: 'task', title: i.title, course: i.course_label, days: n, late: n < 0 });
    }
  }
  const { data: courses } = await supabase.from('study_courses')
    .select('name, exam_date').eq('user_id', userId).eq('archived', false).not('exam_date', 'is', null);
  for (const c of courses || []) {
    const n = daysBetween(today, c.exam_date);
    if (n >= 0 && n <= 7) out.push({ kind: 'exam', title: c.name, course: null, days: n, late: false });
  }
  const rank = (l: Line) => (l.kind === 'exam' ? 0 : l.late ? 1 : l.days === 0 ? 2 : 3);
  return out.sort((x, y) => rank(x) - rank(y) || x.days - y.days);
}

// One layout for every Study Campus email (same look as the other UniSkilled emails).
function shell(subject: string, pre: string, heading: string, body: string, note: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(pre)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:0 4px 16px;"><a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/uniskilled-logo.png" alt="UniSkilled" height="30" style="height:30px;width:auto;border:0;display:block;"></a></td></tr>
      <tr><td style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <div style="height:4px;background:#1a6bff;font-size:0;line-height:0;">&nbsp;</div>
        <div style="padding:30px 32px 8px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a6bff;">Study Campus</p>
          <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">${esc(heading)}</h1>
          ${body}
          <p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#64748b;">${note}</p>
        </div>
        <div style="padding:18px 32px 26px;border-top:1px solid #eef2f7;margin-top:8px;">
          <p style="margin:0;font-size:13px;line-height:1.55;color:#64748b;">Need help? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#1a6bff;text-decoration:none;">${SUPPORT}</a>.</p>
          <p style="margin:12px 0 0;font-size:13px;color:#334155;">Kind regards,<br><strong>The UniSkilled Team</strong></p>
        </div>
      </td></tr>
      <tr><td align="center" style="padding:20px 12px 8px;">
        <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;"><a href="${SITE}/legal.html#terms" style="color:#64748b;text-decoration:underline;">Terms</a> &nbsp;·&nbsp; <a href="${SITE}/legal.html#privacy" style="color:#64748b;text-decoration:underline;">Privacy</a></p>
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">UniSkilled · University-verified online tutoring · <a href="${SITE}" style="color:#94a3b8;">uniskilled.com</a></p>
        <p style="margin:0 0 4px;font-size:11px;color:#a8b4c4;">UNISKILLED LTD, registered in England and Wales, company number 17574736. Registered office: 65 London Wall, London EC2M 5TU, United Kingdom.</p>
        <p style="margin:0;font-size:11px;color:#a8b4c4;">A Study Campus email you turned on. Turn it off at any time in Study Campus settings.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function whenText(l: Line): string {
  const n = l.days;
  const day = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : n === -1 ? 'was due yesterday' : `was due ${-n} days ago`;
  if (l.kind === 'task') return n < 0 ? 'still open' : 'planned for today';
  if (l.kind === 'exam') return day;
  return n < 0 ? day : `due ${day}`;
}
export function renderEmail(name: string, lines: Line[], more: number) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const total = lines.length + more;
  const subject = total === 1 ? 'Today in Study Campus: 1 thing to do' : `Today in Study Campus: ${total} things to do`;
  const rows = lines.map((l, i) => {
    const what = l.kind === 'exam' ? `Exam: ${l.title}` : `${l.title}${l.course ? ` · ${l.course}` : ''}`;
    const b = i < lines.length - 1 ? 'border-bottom:1px solid #eef2f7;' : '';
    return `<tr><td style="padding:10px 16px;font-size:14px;color:#334155;vertical-align:top;${b}">${esc(what)}</td><td style="padding:10px 16px;font-size:14px;color:${l.late ? '#b45309' : '#0f172a'};font-weight:600;vertical-align:top;white-space:nowrap;${b}">${esc(whenText(l))}</td></tr>`;
  }).join('');
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${s}</p>`;
  const body = `
          ${p(`Hi ${esc(first)},`)}
          ${p('Here is what is coming up, from your own tasks, deadlines and exam dates.')}
          <p style="margin:8px 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">To do</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${more ? 10 : 22}px;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;background:#fbfdff;">${rows}</table>
          ${more ? `<p style="margin:0 0 22px;font-size:14px;color:#334155;">And ${more} more in Study Campus.</p>` : ''}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td style="border-radius:8px;background:#1a6bff;">
            <a href="${STUDY}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Open Study Campus</a>
          </td></tr></table>
`;
  const html = shell(subject, lines[0] ? (lines[0].kind === 'exam' ? 'Exam: ' : '') + lines[0].title + ' – ' + whenText(lines[0]) : 'Your plan for today', 'Your day at a glance', body,
    `You get this email because you turned on the morning email in Study Campus. You can turn it off or change the time in <a href="${STUDY}#/settings" style="color:#1a6bff;">Study Campus settings</a>. Days with nothing due send nothing.`);
  const text = [`Hi ${first},`, '', 'Here is what is coming up in Study Campus:', '',
    ...lines.map((l) => `- ${l.kind === 'exam' ? 'Exam: ' + l.title : l.title + (l.course ? ' · ' + l.course : '')}: ${whenText(l)}`),
    ...(more ? [`And ${more} more in Study Campus.`] : []), '', `Open Study Campus: ${STUDY}`, '',
    `Turn this email off or change the time: ${STUDY}#/settings`, '', 'The UniSkilled Team'].join('\n');
  return { subject, html, text };
}

// ---------------------------------------------------------------- the Sunday summary
type Week = { done: number; dueThisWeek: number; onTime: number; quiz: number; studyDays: number;
  next: { kind: 'exam' | 'assignment'; title: string; course: string | null; day: string }[]; tip: string | null };

async function weekFor(supabase: any, userId: string, tz: string, today: string): Promise<Week> {
  const from = addDays(today, -6), nextFrom = addDays(today, 1), nextTo = addDays(today, 7);
  const inWeek = (iso: string | null) => !!iso && localDate(iso, tz) >= from && localDate(iso, tz) <= today;
  const { data: items } = await supabase.from('study_items')
    .select('kind, title, course_label, due_at, planned_for, status, done_at, created_at, estimate_min')
    .eq('user_id', userId).in('kind', ['task', 'assignment', 'note']).limit(2000);
  const { data: log } = await supabase.from('study_activity').select('type, n, at').eq('user_id', userId)
    .gte('at', new Date(Date.parse(from + 'T00:00:00Z') - 2 * DAY).toISOString()).limit(2000);
  const { data: courses } = await supabase.from('study_courses').select('name, exam_date')
    .eq('user_id', userId).eq('archived', false).not('exam_date', 'is', null);
  const all = items || [];
  const work = all.filter((i: any) => i.kind === 'task' || i.kind === 'assignment');
  const days = new Set<string>();
  const done = work.filter((i: any) => i.status === 'done' && inWeek(i.done_at));
  done.forEach((i: any) => days.add(localDate(i.done_at, tz)));
  all.filter((i: any) => i.kind === 'note' && inWeek(i.created_at)).forEach((i: any) => days.add(localDate(i.created_at, tz)));
  let quiz = 0;
  (log || []).forEach((l: any) => { if (!inWeek(l.at)) return; days.add(localDate(l.at, tz)); if (l.type === 'review') quiz += Number(l.n) || 0; });
  const due = work.filter((i: any) => i.kind === 'assignment' && inWeek(i.due_at));
  const onTime = due.filter((i: any) => i.status === 'done' && i.done_at && Date.parse(i.done_at) <= Date.parse(i.due_at)).length;
  const next: Week['next'] = [];
  work.forEach((i: any) => {
    if (i.kind !== 'assignment' || i.status === 'done' || !i.due_at) return;
    const d = localDate(i.due_at, tz);
    if (d >= nextFrom && d <= nextTo) next.push({ kind: 'assignment', title: i.title, course: i.course_label, day: d });
  });
  (courses || []).forEach((c: any) => { if (c.exam_date >= nextFrom && c.exam_date <= nextTo) next.push({ kind: 'exam', title: c.name, course: null, day: c.exam_date }); });
  next.sort((a, b) => a.day.localeCompare(b.day));
  // One suggestion: the biggest piece of work due next week, or an exam two weeks out, or nothing.
  let tip: string | null = null;
  const big = work.filter((i: any) => i.kind === 'assignment' && i.status !== 'done' && i.due_at && localDate(i.due_at, tz) >= nextFrom && localDate(i.due_at, tz) <= nextTo)
    .sort((a: any, b: any) => (Number(b.estimate_min) || 240) - (Number(a.estimate_min) || 240))[0];
  if (big) tip = `Start “${big.title}” on Monday. It is due ${dayName(localDate(big.due_at, tz))}, and starting early keeps the week calm.`;
  else {
    const exam = (courses || []).filter((c: any) => c.exam_date > nextTo && c.exam_date <= addDays(today, 14))[0];
    if (exam) tip = `Your ${exam.name} exam is in ${daysBetween(today, exam.exam_date)} days. Plan one revision step for each day next week.`;
  }
  return { done: done.length, dueThisWeek: due.length, onTime, quiz, studyDays: days.size, next: next.slice(0, 8), tip };
}
function dayName(ymd: string): string {
  const d = new Date(Date.parse(ymd + 'T12:00:00Z'));
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
}

export function renderWeekly(name: string, w: Week) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const subject = w.next.length ? `Your week in Study Campus: ${w.done} done, ${w.next.length} coming up` : `Your week in Study Campus: ${w.done} done`;
  const stat = (big: string, label: string) => `<td align="center" style="padding:14px 6px;border:1px solid #e2e8f0;border-radius:8px;background:#fbfdff;width:25%;"><div style="font-size:22px;font-weight:700;color:#0f172a;">${esc(big)}</div><div style="font-size:12px;color:#64748b;margin-top:2px;">${esc(label)}</div></td>`;
  const stats = `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 0 18px;border-collapse:separate;"><tr>${stat(String(w.done), 'tasks done')}${stat(w.dueThisWeek ? `${w.onTime} of ${w.dueThisWeek}` : '–', 'deadlines on time')}${stat(`${w.studyDays} of 7`, 'days studied')}${stat(String(w.quiz), 'Quiz me answers')}</tr></table>`;
  const rows = w.next.map((n, i) => {
    const b = i < w.next.length - 1 ? 'border-bottom:1px solid #eef2f7;' : '';
    const what = n.kind === 'exam' ? `Exam: ${n.title}` : `${n.title}${n.course ? ` · ${n.course}` : ''}`;
    return `<tr><td style="padding:10px 16px;font-size:14px;color:#334155;${b}">${esc(what)}</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#0f172a;white-space:nowrap;${b}">${esc(dayName(n.day))}</td></tr>`;
  }).join('');
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${s}</p>`;
  const h = (s: string) => `<p style="margin:8px 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">${s}</p>`;
  const body = `${p(`Hi ${esc(first)},`)}${p('Here is your week, counted from what you did in Study Campus.')}${h('This week')}${stats}` +
    (rows ? `${h('Coming up next week')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;background:#fbfdff;">${rows}</table>` : p('Nothing is due next week. A good moment to get ahead.')) +
    (w.tip ? `<div style="margin:0 0 22px;padding:14px 16px;border-radius:8px;background:#eef4ff;font-size:14px;line-height:1.55;color:#1e3a8a;"><strong>One suggestion:</strong> ${esc(w.tip)}</div>` : '') +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td style="border-radius:8px;background:#1a6bff;"><a href="${STUDY}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Open Study Campus</a></td></tr></table>`;
  const html = shell(subject, w.next[0] ? `Next: ${w.next[0].kind === 'exam' ? 'Exam: ' : ''}${w.next[0].title}, ${dayName(w.next[0].day)}` : `${w.done} things done this week`, 'Your week at a glance', body,
    'You get this email because you turned on the Sunday summary in Study Campus. You can turn it off in <a href="' + STUDY + '#/settings" style="color:#1a6bff;">Study Campus settings</a>.');
  const text = [`Hi ${first},`, '', `This week: ${w.done} tasks done, ${w.dueThisWeek ? `${w.onTime} of ${w.dueThisWeek} deadlines on time, ` : ''}${w.studyDays} of 7 days studied, ${w.quiz} Quiz me answers.`, '',
    ...(w.next.length ? ['Coming up next week:', ...w.next.map((n) => `- ${n.kind === 'exam' ? 'Exam: ' + n.title : n.title + (n.course ? ' · ' + n.course : '')}: ${dayName(n.day)}`)] : ['Nothing is due next week.']),
    ...(w.tip ? ['', `One suggestion: ${w.tip}`] : []), '', `Open Study Campus: ${STUDY}`, '', `Turn this email off: ${STUDY}#/settings`, '', 'The UniSkilled Team'].join('\n');
  return { subject, html, text };
}

Deno.serve(withSentry('studyhq-reminders', async (req: Request) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await isTrustedCaller(req, supabase))) return json({ error: 'Not allowed' }, 401);

  const now = new Date();
  const { data: rows, error } = await supabase.from('study_reminders')
    .select('user_id, email_daily, email_hour, weekly_email, tz, last_sent_on, weekly_sent_on').or('email_daily.eq.true,weekly_email.eq.true').limit(5000);
  if (error) { console.error('studyhq-reminders: could not read settings', error.message); return json({ error: 'read failed' }, 500); }

  const send = async (userId: string, build: (name: string) => { subject: string; html: string; text: string }) => {
    const { data: u } = await supabase.from('users').select('full_name, email').eq('id', userId).maybeSingle();
    const to = String(u?.email || '').trim();
    if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(to)) return false;
    const e = build(u?.full_name || '');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: FROM, to: [to], reply_to: SUPPORT, subject: e.subject, html: e.html, text: e.text }),
      });
      await res.body?.cancel();
      if (!res.ok) console.error(`studyhq-reminders: email failed (non-critical): HTTP ${res.status}`);
      return res.ok;
    } catch (err) { console.error('studyhq-reminders: email failed (non-critical):', err); return false; }
  };

  let sent = 0, empty = 0, weekly = 0;
  for (const r of rows || []) {
    const { date, hour } = localNow(r.tz, now);

    // The morning email. Claim this student for today first: only one run can win.
    if (r.email_daily && hour === r.email_hour && r.last_sent_on !== date) {
      const { data: claimed } = await supabase.from('study_reminders').update({ last_sent_on: date })
        .eq('user_id', r.user_id).or(`last_sent_on.is.null,last_sent_on.neq.${date}`).select('user_id');
      if (claimed && claimed.length) {
        const lines = await linesFor(supabase, r.user_id, r.tz, date);
        if (!lines.length) empty++;
        else if (await send(r.user_id, (name) => renderEmail(name, lines.slice(0, MAX_LINES), Math.max(0, lines.length - MAX_LINES)))) sent++;
      }
    }

    // The Sunday summary, Sunday at 18:00 local. Sent only when there is something to report.
    if (r.weekly_email && hour === WEEKLY_HOUR && localWeekday(r.tz, now) === 0 && r.weekly_sent_on !== date) {
      const { data: claimed } = await supabase.from('study_reminders').update({ weekly_sent_on: date })
        .eq('user_id', r.user_id).or(`weekly_sent_on.is.null,weekly_sent_on.neq.${date}`).select('user_id');
      if (claimed && claimed.length) {
        const w = await weekFor(supabase, r.user_id, r.tz, date);
        if (w.done || w.quiz || w.studyDays || w.next.length) { if (await send(r.user_id, (name) => renderWeekly(name, w))) weekly++; }
      }
    }
  }
  return json({ ok: true, sent, empty, weekly });
}));
