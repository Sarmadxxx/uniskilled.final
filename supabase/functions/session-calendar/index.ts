import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

// UniSkilled — "Add to calendar" file (.ics) for one confirmed lesson.
//
// Linked from the confirmation and reminder emails as
//   /functions/v1/session-calendar?s=<session id>&t=<signature>
// The signature is made by send-email with the same secret, so only someone who received the
// email can open the file. It shows only the subject, the time and the lesson room link.

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE = 'https://uniskilled.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function calendarToken(sessionId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('cal:' + sessionId));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// RFC 5545 text escaping
const icsText = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lines longer than 75 octets must be folded
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

Deno.serve(withSentry('session-calendar', async (req: Request) => {
  const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405);

  const url = new URL(req.url);
  const sid = url.searchParams.get('s') || '';
  const token = url.searchParams.get('t') || '';
  if (!UUID.test(sid) || !token) return text('This calendar link is not valid.', 400);
  if (!safeEqual(token, await calendarToken(sid))) return text('This calendar link is not valid.', 403);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
  const { data: s } = await supabase.from('sessions')
    .select('id, subject, tutor_name, student_name, starts_at, ends_at, duration_minutes, status')
    .eq('id', sid).maybeSingle();
  if (!s || !s.starts_at) return text('This lesson could not be found.', 404);
  if (s.status !== 'confirmed' && s.status !== 'completed') {
    return text('This lesson is no longer confirmed, so it was not added to your calendar. Check your UniSkilled dashboard for details.', 410);
  }

  const start = new Date(s.starts_at);
  const end = s.ends_at ? new Date(s.ends_at) : new Date(start.getTime() + (Number(s.duration_minutes) || 60) * 60000);
  const room = `${SITE}/classroom.html?session=${s.id}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UniSkilled//Lessons//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${s.id}@uniskilled.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsText('UniSkilled lesson: ' + (s.subject || 'Tutoring session'))}`,
    `DESCRIPTION:${icsText(`Online lesson with ${s.tutor_name || 'your tutor'} and ${s.student_name || 'your student'}.\nJoin the lesson room: ${room}\nThe room opens 10 minutes before the start.`)}`,
    `LOCATION:${icsText(room)}`,
    `URL:${room}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:UniSkilled lesson starts in 15 minutes',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const body = lines.map(fold).join('\r\n') + '\r\n';
  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="uniskilled-lesson-${s.id.slice(0, 8)}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}));
