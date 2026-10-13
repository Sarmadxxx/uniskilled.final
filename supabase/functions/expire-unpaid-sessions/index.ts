import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HOUR = 3600000;
// Students get one reminder when their payment deadline is this close (runs hourly).
const REMINDER_WINDOW_HOURS = 3;

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

async function sendEmail(type: string, to: string, data: any) {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ type, to, data }),
  });
}

Deno.serve(async (req: Request) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);

    if (!(await isTrustedCaller(req, supabase))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: expired, error } = await supabase.from('sessions')
      .select('*')
      .eq('status', 'awaiting_payment')
      .lt('payment_due_at', new Date().toISOString());

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];

    for (const session of expired || []) {
      const { error: updErr } = await supabase.from('sessions').update({
        status: 'payment_expired',
      }).eq('id', session.id).eq('status', 'awaiting_payment');

      if (updErr) {
        results.push({ session_id: session.id, success: false, error: updErr.message });
        continue;
      }

      await supabase.from('notifications').insert([
        {
          user_id: session.student_id, type: 'payment_expired',
          title: '⏰ Payment window expired',
          body: `Your window to pay for the ${session.subject} session with ${session.tutor_name} has passed.`,
          link: 'student-dashboard.html', read: false,
        },
        {
          user_id: session.tutor_id, type: 'payment_expired',
          title: 'Slot reopened',
          body: `${session.student_name} did not complete payment in time for the ${session.subject} session.`,
          link: 'tutor-dashboard.html', read: false,
        },
      ]);

      try {
        const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
        const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
        const emailData = { sessionId: session.id, studentName: session.student_name, tutorName: session.tutor_name, subject: session.subject };
        if (studentUser?.email) await sendEmail('payment_expired', studentUser.email, emailData);
        if (tutorUser?.email) await sendEmail('payment_expired_tutor', tutorUser.email, emailData);
      } catch (e) {
        console.error('Expiry email failed (non-critical):', e);
      }

      results.push({ session_id: session.id, success: true });
    }

    // ── PAYMENT REMINDERS: one reminder per booking when the deadline is close ──
    // Skips bookings accepted in the last 45 minutes (the "accepted, please pay" email is still fresh).
    const now = Date.now();
    const { data: dueSoon } = await supabase.from('sessions')
      .select('*')
      .eq('status', 'awaiting_payment')
      .gt('payment_due_at', new Date(now + 20 * 60000).toISOString())
      .lte('payment_due_at', new Date(now + REMINDER_WINDOW_HOURS * HOUR).toISOString());

    for (const session of dueSoon || []) {
      if (session.payment_status === 'paid') continue;
      const link = `complete-payment.html?session=${session.id}`;
      const { data: already } = await supabase.from('notifications').select('id')
        .eq('user_id', session.student_id).eq('type', 'payment_reminder').eq('link', link).limit(1);
      if (already && already.length > 0) continue;
      const { data: fresh } = await supabase.from('notifications').select('id')
        .eq('user_id', session.student_id).eq('type', 'awaiting_payment').eq('link', link)
        .gt('created_at', new Date(now - 45 * 60000).toISOString()).limit(1);
      if (fresh && fresh.length > 0) continue;

      await supabase.from('notifications').insert({
        user_id: session.student_id, type: 'payment_reminder',
        title: '⏳ Payment due soon',
        body: `Your ${session.subject} session with ${session.tutor_name} isn't confirmed yet. Complete payment before the deadline to keep it.`,
        link, read: false,
      });
      try {
        const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
        if (studentUser?.email) await sendEmail('payment_reminder', studentUser.email, { sessionId: session.id });
      } catch (e) {
        console.error('Reminder email failed (non-critical):', e);
      }
      results.push({ session_id: session.id, reminded: true });
    }

    // ── RATING REMINDERS: one email the day after a lesson, only if it wasn't rated yet ──
    const { data: toRate } = await supabase.from('sessions')
      .select('id, student_id, subject, tutor_name, ends_at, status')
      .in('status', ['completed', 'confirmed'])
      .gte('ends_at', new Date(now - 26 * HOUR).toISOString())
      .lte('ends_at', new Date(now - 20 * HOUR).toISOString());

    for (const session of toRate || []) {
      const link = `rate-lesson.html?session=${session.id}`;
      const { data: reviewed } = await supabase.from('reviews').select('id').eq('session_id', session.id).limit(1);
      if (reviewed && reviewed.length > 0) continue;
      const { data: sent } = await supabase.from('notifications').select('id')
        .eq('user_id', session.student_id).eq('type', 'rate_reminder').eq('link', link).limit(1);
      if (sent && sent.length > 0) continue;
      // Only lessons that actually took place: marked completed, or both were in the classroom.
      if (session.status !== 'completed') {
        const { data: att } = await supabase.from('classroom_attendance').select('connected_seconds').eq('session_id', session.id);
        const connected = (att || []).reduce((a: number, r: any) => a + (r.connected_seconds || 0), 0);
        if (connected < 300) continue;
      }
      await supabase.from('notifications').insert({
        user_id: session.student_id, type: 'rate_reminder',
        title: '⭐ How was your lesson?',
        body: `Rate your ${session.subject} lesson with ${session.tutor_name}. It takes 20 seconds.`,
        link, read: false,
      });
      try {
        const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
        if (studentUser?.email) await sendEmail('rate_lesson', studentUser.email, { sessionId: session.id });
      } catch (e) {
        console.error('Rating reminder email failed (non-critical):', e);
      }
      results.push({ session_id: session.id, rate_reminder: true });
    }

    // ── GROUP SESSION SPOTS: same 24h unpaid-spot expiry, independent of the
    // 12h minimum-headcount check handled by check-group-session-minimums ──
    const { data: expiredSpots } = await supabase.from('group_session_participants')
      .select('*, group_sessions(*)')
      .eq('status', 'awaiting_payment')
      .lt('payment_due_at', new Date().toISOString());

    for (const spot of expiredSpots || []) {
      const { error: spotErr } = await supabase.from('group_session_participants').update({
        status: 'payment_expired',
      }).eq('id', spot.id).eq('status', 'awaiting_payment');

      if (spotErr) {
        results.push({ group_participant_id: spot.id, success: false, error: spotErr.message });
        continue;
      }

      const gs = spot.group_sessions;
      await supabase.from('notifications').insert({
        user_id: spot.student_id, type: 'payment_expired',
        title: '⏰ Payment window expired',
        body: `Your window to pay for the ${gs?.subject || 'group'} session spot has passed.`,
        link: 'group-sessions.html', read: false,
      });

      try {
        const { data: studentUser } = await supabase.from('users').select('email').eq('id', spot.student_id).single();
        if (studentUser?.email && gs) {
          await sendEmail('payment_expired', studentUser.email, { groupSessionId: gs.id, studentName: spot.student_name, tutorName: gs.tutor_name, subject: gs.subject });
        }
      } catch (e) {
        console.error('Group spot expiry email failed (non-critical):', e);
      }

      results.push({ group_participant_id: spot.id, success: true });
    }

    // ── HOUSEKEEPING: classroom attendance is kept 12 months (Privacy Policy), unless a dispute is open ──
    try {
      const cutoff = new Date(now - 365 * 24 * HOUR).toISOString();
      const { data: old } = await supabase.from('classroom_attendance').select('id, session_id').lt('joined_at', cutoff).limit(500);
      if (old && old.length) {
        const sids = [...new Set(old.map((r: any) => r.session_id))];
        const { data: open } = await supabase.from('disputes').select('session_id').in('session_id', sids).eq('status', 'open');
        const keep = new Set((open || []).map((d: any) => d.session_id));
        const ids = old.filter((r: any) => !keep.has(r.session_id)).map((r: any) => r.id);
        if (ids.length) await supabase.from('classroom_attendance').delete().in('id', ids);
      }
    } catch (e) { console.error('Attendance cleanup failed (non-critical):', e); }

    return new Response(JSON.stringify({ processed: results.length, results }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('expire-unpaid-sessions error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
