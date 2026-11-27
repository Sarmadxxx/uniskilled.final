import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

// Study Campus — the student's private calendar feed.
//
//   /functions/v1/studyhq-calendar?t=<cal_token>
//
// The student creates the link in Study Campus → Settings and adds it once to Google Calendar,
// Apple Calendar or Outlook ("subscribe"). Their calendar app then fetches it every few hours, so
// new tasks, deadlines and exam dates appear by themselves, each with a reminder.
// The link holds a random secret (study_reminders.cal_token). Resetting it in Settings stops the
// old link at once. The feed shows only titles, course names and times: never note contents.
//
// Deployed 27 Nov 2026 after approval (needs the 20261127120000 migration).

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE = 'https://uniskilled.com';
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const ymd = (s: string) => String(s).slice(0, 10).replace(/-/g, '');
const nextDay = (s: string) => new Date(Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
const icsText = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function alarm(trigger: string, text: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

Deno.serve(withSentry('studyhq-calendar', async (req: Request) => {
  const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405);
  const token = new URL(req.url).searchParams.get('t') || '';
  if (!TOKEN.test(token)) return text('This calendar link is not valid.', 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
  const { data: owner } = await supabase.from('study_reminders').select('user_id').eq('cal_token', token).maybeSingle();
  if (!owner) return text('This calendar link was reset or turned off. Create a new one in Study Campus settings.', 404);
  const uid = owner.user_id;

  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: items }, { data: courses }] = await Promise.all([
    supabase.from('study_items').select('id, kind, title, course_label, due_at, planned_for, status, updated_at')
      .eq('user_id', uid).in('kind', ['task', 'assignment']).neq('status', 'done').limit(1000),
    supabase.from('study_courses').select('id, name, exam_date').eq('user_id', uid).eq('archived', false).not('exam_date', 'is', null),
  ]);

  const now = stamp(new Date());
  const ev: string[] = [];
  for (const i of items || []) {
    const name = `${i.title}${i.course_label ? ` (${i.course_label})` : ''}`;
    if (i.kind === 'assignment' && i.due_at && i.due_at >= since) {
      const due = new Date(i.due_at);
      ev.push('BEGIN:VEVENT', `UID:study-${i.id}@uniskilled.com`, `DTSTAMP:${now}`,
        `DTSTART:${stamp(new Date(due.getTime() - 30 * 60000))}`, `DTEND:${stamp(due)}`,
        `SUMMARY:${icsText('Due: ' + name)}`, `DESCRIPTION:${icsText('Deadline from your Study Campus.\n' + SITE + '/studyhq.html#/assignments')}`,
        `URL:${SITE}/studyhq.html#/assignments`, 'TRANSP:TRANSPARENT',
        ...alarm('-P1D', 'Due tomorrow: ' + name), ...alarm('-PT3H', 'Due in 3 hours: ' + name), 'END:VEVENT');
    } else if (i.kind === 'task' && i.planned_for && i.planned_for >= since.slice(0, 10)) {
      ev.push('BEGIN:VEVENT', `UID:study-${i.id}@uniskilled.com`, `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${ymd(i.planned_for)}`, `DTEND;VALUE=DATE:${nextDay(i.planned_for)}`,
        `SUMMARY:${icsText('To do: ' + name)}`, `DESCRIPTION:${icsText('Task from your Study Campus planner.\n' + SITE + '/studyhq.html#/planner')}`,
        `URL:${SITE}/studyhq.html#/planner`, 'TRANSP:TRANSPARENT', ...alarm('PT8H', 'To do today: ' + name), 'END:VEVENT');
    }
  }
  for (const c of courses || []) {
    if (!c.exam_date || c.exam_date < since.slice(0, 10)) continue;
    ev.push('BEGIN:VEVENT', `UID:study-exam-${c.id}@uniskilled.com`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${ymd(c.exam_date)}`, `DTEND;VALUE=DATE:${nextDay(c.exam_date)}`,
      `SUMMARY:${icsText('Exam: ' + c.name)}`, `URL:${SITE}/studyhq.html#/exams`,
      ...alarm('-P7D', 'Exam in one week: ' + c.name), ...alarm('-P1D', 'Exam tomorrow: ' + c.name), 'END:VEVENT');
  }

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniSkilled//Study Campus//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Study Campus', 'X-PUBLISHED-TTL:PT3H', 'REFRESH-INTERVAL;VALUE=DURATION:PT3H', ...ev, 'END:VCALENDAR'];
  const body = lines.map(fold).join('\r\n') + '\r\n';
  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="study-campus.ics"', 'Cache-Control': 'private, max-age=900', 'X-Robots-Tag': 'noindex' },
  });
}));
