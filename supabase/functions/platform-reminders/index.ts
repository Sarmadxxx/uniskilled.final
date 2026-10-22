import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

// UniSkilled — reminders and nudges. Runs every 15 minutes (pg_cron job "platform-reminders").
//
//  1. Lesson reminders: 24 hours and 1 hour before every confirmed one-to-one lesson, to both sides.
//  2. Unanswered requests: the tutor gets one nudge; a request with no answer is released after
//     48 hours, or earlier when the lesson is too close to accept (the database only lets a tutor
//     accept up to 70 minutes before the start, so the student still has time to pay).
//  3. Course requests: one summary email to admins for new requests, and one email to the student
//     when a tutor who teaches the requested course joins.
//
// Every step "claims" its row first (sets the *_sent_at / *_notified_at column only if it is still
// empty), so a slow or repeated run can never send the same email twice.

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const MIN = 60000, HOUR = 60 * MIN;

const NUDGE_AFTER_HOURS = 12;          // nudge the tutor this long after the request…
const NUDGE_BEFORE_RELEASE_HOURS = 6;  // …or this long before it would be released, whichever is first
const RELEASE_AFTER_HOURS = 48;        // unanswered requests are released after this
const ACCEPT_CUTOFF_MIN = 70;          // matches the database rule in a_guard_sessions
const MATCH_LOOKBACK_DAYS = 60;        // course requests older than this don't get "tutor found" emails

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// SERVER-ONLY: the pg_cron job (x-cron-secret, checked inside the database) or the service-role key.
async function isTrustedCaller(req: Request, supabase: any): Promise<boolean> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (safeEqual(token, SERVICE_KEY)) return true;
  const cronSecret = req.headers.get('x-cron-secret') || '';
  if (!cronSecret) return false;
  const { data, error } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret });
  return !error && data === true;
}

async function sendEmail(type: string, toUserId: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ type, to_user_id: toUserId, data }),
    });
    if (!res.ok) console.error(`Email ${type} failed (non-critical): HTTP ${res.status}`);
    await res.body?.cancel();
    return res.ok;
  } catch (e) {
    console.error(`Email ${type} failed (non-critical):`, e);
    return false;
  }
}

async function notify(supabase: any, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.from('notifications').insert(rows.map(r => ({ read: false, ...r })));
  if (error) console.error('Notification insert failed (non-critical):', error.message);
}

function fmtDeadline(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
      + ` (${String(tz || 'Europe/Berlin').split('/').pop()!.replace(/_/g, ' ')} time)`;
  } catch { return d.toISOString(); }
}

// When an unanswered request stops being acceptable.
function releaseTime(s: any): number {
  const byAge = new Date(s.created_at).getTime() + RELEASE_AFTER_HOURS * HOUR;
  const byStart = s.starts_at ? new Date(s.starts_at).getTime() - ACCEPT_CUTOFF_MIN * MIN : Infinity;
  return Math.min(byAge, byStart);
}

const norm = (s: unknown) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
function teaches(subjects: unknown, wanted: string): boolean {
  const w = norm(wanted);
  if (w.length < 2 || !Array.isArray(subjects)) return false;
  return subjects.some((s) => {
    const t = norm(s);
    if (!t) return false;
    if (t === w) return true;
    return Math.min(t.length, w.length) >= 4 && (t.includes(w) || w.includes(t));
  });
}

Deno.serve(withSentry('platform-reminders', async (req: Request) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await isTrustedCaller(req, supabase))) return json({ error: 'Forbidden' }, 403);

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const summary = { reminders_1h: 0, reminders_24h: 0, nudges: 0, released: 0, released_quietly: 0, admin_digest: 0, course_matches: 0 };

  // ── 1a. One-hour reminders ──
  const { data: soon, error: soonErr } = await supabase.from('sessions')
    .select('id, student_id, tutor_id, subject, starts_at')
    .eq('status', 'confirmed').is('reminder_1h_sent_at', null)
    .gt('starts_at', iso(now)).lte('starts_at', iso(now + ACCEPT_CUTOFF_MIN * MIN));
  if (soonErr) console.error('1h reminder query failed:', soonErr.message);
  for (const s of soon || []) {
    const { data: claimed } = await supabase.from('sessions').update({ reminder_1h_sent_at: iso(now) })
      .eq('id', s.id).is('reminder_1h_sent_at', null).select('id');
    if (!claimed || claimed.length === 0) continue;
    const room = `classroom.html?session=${s.id}`;
    await notify(supabase, [
      { user_id: s.student_id, type: 'session_reminder', title: '⏰ Your lesson starts in 1 hour', body: `Your ${s.subject} lesson starts soon. The lesson room opens 10 minutes before.`, link: room },
      { user_id: s.tutor_id, type: 'session_reminder', title: '⏰ Your lesson starts in 1 hour', body: `Your ${s.subject} lesson starts soon. The lesson room opens 10 minutes before.`, link: room },
    ]);
    await sendEmail('session_reminder', s.student_id, { sessionId: s.id, window: '1h' });
    await sendEmail('session_reminder', s.tutor_id, { sessionId: s.id, window: '1h' });
    summary.reminders_1h++;
  }

  // ── 1b. 24-hour reminders (skipped while the confirmation email is still fresh) ──
  const { data: tomorrow, error: tmErr } = await supabase.from('sessions')
    .select('id, student_id, tutor_id, subject, starts_at')
    .eq('status', 'confirmed').is('reminder_24h_sent_at', null)
    .gt('starts_at', iso(now + 150 * MIN)).lte('starts_at', iso(now + 24 * HOUR));
  if (tmErr) console.error('24h reminder query failed:', tmErr.message);
  for (const s of tomorrow || []) {
    const { data: pay } = await supabase.from('payments').select('paid_at').eq('session_id', s.id).order('paid_at', { ascending: false }).limit(1);
    const paidAt = pay && pay[0]?.paid_at ? new Date(pay[0].paid_at).getTime() : 0;
    if (paidAt && now - paidAt < 2 * HOUR) continue; // confirmed moments ago: the confirmation email already covers it
    const { data: claimed } = await supabase.from('sessions').update({ reminder_24h_sent_at: iso(now) })
      .eq('id', s.id).is('reminder_24h_sent_at', null).select('id');
    if (!claimed || claimed.length === 0) continue;
    await sendEmail('session_reminder', s.student_id, { sessionId: s.id, window: '24h' });
    await sendEmail('session_reminder', s.tutor_id, { sessionId: s.id, window: '24h' });
    summary.reminders_24h++;
  }

  // ── 2. Unanswered requests: release first, then nudge ──
  const { data: pending, error: pendErr } = await supabase.from('sessions')
    .select('id, student_id, tutor_id, subject, created_at, starts_at, timezone, tutor_nudged_at')
    .eq('status', 'pending');
  if (pendErr) console.error('Pending request query failed:', pendErr.message);

  for (const s of pending || []) {
    const releaseAt = releaseTime(s);
    if (now >= releaseAt) {
      const { data: released } = await supabase.from('sessions')
        .update({ status: 'declined', cancellation_reason: 'No answer from the tutor in time — released automatically' })
        .eq('id', s.id).eq('status', 'pending').select('id');
      if (!released || released.length === 0) continue;
      // Old backlog (the lesson time has already passed): release without telling anyone.
      if (s.starts_at && new Date(s.starts_at).getTime() <= now) { summary.released_quietly++; continue; }
      await notify(supabase, [
        { user_id: s.student_id, type: 'request_expired', title: 'Request released — no answer from the tutor', body: `Your ${s.subject} request got no answer in time, so we released it. You have not been charged. Book another tutor anytime.`, link: `find-tutors.html?q=${encodeURIComponent(s.subject || '')}` },
        { user_id: s.tutor_id, type: 'request_expired', title: 'Request released without an answer', body: `A ${s.subject} request was not answered in time and was released.`, link: 'tutor-dashboard.html?tab=requests' },
      ]);
      await sendEmail('request_expired_student', s.student_id, { sessionId: s.id, subject: s.subject });
      await sendEmail('request_expired_tutor', s.tutor_id, { sessionId: s.id });
      summary.released++;
      continue;
    }

    if (s.tutor_nudged_at) continue;
    const created = new Date(s.created_at).getTime();
    const dueForNudge = now >= created + NUDGE_AFTER_HOURS * HOUR || now >= releaseAt - NUDGE_BEFORE_RELEASE_HOURS * HOUR;
    if (!dueForNudge || now - created < 30 * MIN) continue;
    const { data: claimed } = await supabase.from('sessions').update({ tutor_nudged_at: iso(now) })
      .eq('id', s.id).eq('status', 'pending').is('tutor_nudged_at', null).select('id');
    if (!claimed || claimed.length === 0) continue;
    const deadline = fmtDeadline(new Date(releaseAt), s.timezone || 'Europe/Berlin');
    await notify(supabase, [
      { user_id: s.tutor_id, type: 'request_nudge', title: '⏳ A student is waiting for your answer', body: `Please accept or decline the ${s.subject} request by ${deadline}, or it is released automatically.`, link: 'tutor-dashboard.html?tab=requests' },
    ]);
    await sendEmail('request_nudge_tutor', s.tutor_id, { sessionId: s.id, releaseAt: deadline });
    summary.nudges++;
  }

  // ── 3a. New course requests → one summary email to admins ──
  const { data: fresh } = await supabase.from('subject_requests').select('id').is('admin_notified_at', null).limit(100);
  if (fresh && fresh.length > 0) {
    const { data: claimed } = await supabase.from('subject_requests').update({ admin_notified_at: iso(now) })
      .in('id', fresh.map((r: any) => r.id)).is('admin_notified_at', null)
      .select('subject, university, level, language, student_name, created_at');
    if (claimed && claimed.length > 0) {
      const { data: admins } = await supabase.from('users').select('id').contains('roles', ['admin']);
      const requests = claimed.map((r: any) => ({ subject: r.subject, university: r.university, level: r.level, language: r.language, studentName: r.student_name }));
      for (const a of admins || []) {
        await sendEmail('admin_course_requests', a.id, { requests });
        await notify(supabase, [{ user_id: a.id, type: 'course_request', title: `📚 ${claimed.length} new course request${claimed.length === 1 ? '' : 's'}`, body: requests.map((r: any) => r.subject).join(', ').slice(0, 240), link: 'admin.html' }]);
      }
      summary.admin_digest = claimed.length;
    }
  }

  // ── 3b. A tutor who teaches a requested course joined → tell the student once ──
  const { data: open } = await supabase.from('subject_requests')
    .select('id, student_id, student_name, subject, created_at')
    .eq('status', 'open').is('match_notified_at', null)
    .gte('created_at', iso(now - MATCH_LOOKBACK_DAYS * 24 * HOUR));
  if (open && open.length > 0) {
    const oldest = open.reduce((m: string, r: any) => (r.created_at < m ? r.created_at : m), open[0].created_at);
    const { data: tutors } = await supabase.from('tutor_profiles')
      .select('user_id, subjects, created_at, is_active').gt('created_at', oldest);
    for (const r of open) {
      const match = (tutors || []).find((t: any) => t.is_active !== false && t.user_id !== r.student_id
        && t.created_at > r.created_at && teaches(t.subjects, r.subject));
      if (!match) continue;
      const { data: claimed } = await supabase.from('subject_requests').update({ match_notified_at: iso(now) })
        .eq('id', r.id).is('match_notified_at', null).select('id');
      if (!claimed || claimed.length === 0) continue;
      await notify(supabase, [{ user_id: r.student_id, type: 'course_request_match', title: `🎓 A tutor for ${r.subject} just joined`, body: `You asked for help with ${r.subject}. A tutor who teaches it is now available.`, link: `find-tutors.html?q=${encodeURIComponent(r.subject || '')}` }]);
      await sendEmail('course_request_match', r.student_id, { subject: r.subject, studentName: r.student_name });
      summary.course_matches++;
    }
  }

  return json({ ok: true, ...summary });
}));
