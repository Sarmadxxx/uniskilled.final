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
// NOT DEPLOYED. Deploy only after approval, after the 20261127120000 migration.

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
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
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
function localDate(iso: string, tz: string): string { return localNow(tz, new Date(iso)).date; }

// One line of the email. The email template words it (and translates it): kind + days from today.
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

Deno.serve(withSentry('studyhq-reminders', async (req: Request) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await isTrustedCaller(req, supabase))) return json({ error: 'Not allowed' }, 401);

  const now = new Date();
  const { data: rows, error } = await supabase.from('study_reminders')
    .select('user_id, email_hour, tz, last_sent_on').eq('email_daily', true).limit(5000);
  if (error) { console.error('studyhq-reminders: could not read settings', error.message); return json({ error: 'read failed' }, 500); }

  let sent = 0, empty = 0;
  for (const r of rows || []) {
    const { date, hour } = localNow(r.tz, now);
    if (hour !== r.email_hour || r.last_sent_on === date) continue;
    // Claim this student for today. Only one run can win.
    const { data: claimed } = await supabase.from('study_reminders').update({ last_sent_on: date })
      .eq('user_id', r.user_id).or(`last_sent_on.is.null,last_sent_on.neq.${date}`).select('user_id');
    if (!claimed || !claimed.length) continue;

    const lines = await linesFor(supabase, r.user_id, r.tz, date);
    if (!lines.length) { empty++; continue; }
    const { data: u } = await supabase.from('users').select('full_name').eq('id', r.user_id).maybeSingle();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ type: 'study_daily', to_user_id: r.user_id, data: { recipientName: u?.full_name || '', lines: lines.slice(0, MAX_LINES), more: Math.max(0, lines.length - MAX_LINES), total: lines.length } }),
      });
      await res.body?.cancel();
      if (res.ok) sent++; else console.error(`studyhq-reminders: email failed (non-critical): HTTP ${res.status}`);
    } catch (e) { console.error('studyhq-reminders: email failed (non-critical):', e); }
  }
  return json({ ok: true, sent, empty });
}));
