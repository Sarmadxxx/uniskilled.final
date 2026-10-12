import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// A student who moves a session that is less than this many hours away loses the full refund
// on a later cancellation (closes the "reschedule, then cancel for a full refund" loophole).
// Must match CUTOFF_HOURS_BEFORE_SESSION in cancel-session.
const LATE_RESCHEDULE_HOURS = 24;

// Identity comes from the verified login token, never from the request body.
async function getAuthedUserId(req: Request, supabase: any): Promise<string | null> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function sendEmail(supabaseUrl: string, type: string, to: string, data: any) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}` },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (e) {
    console.error('Email dispatch failed (non-critical):', e);
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

  try {
    const { session_id, new_date, new_time } = await req.json();
    if (!session_id || !new_date || !new_time) return json({ error: 'session_id, new_date, and new_time are required' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(new_date)) || !/^\d{2}:\d{2}(:\d{2})?$/.test(String(new_time))) {
      return json({ error: 'Please choose a valid date and time.' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const requester_id = await getAuthedUserId(req, supabase);
    if (!requester_id) return json({ error: 'Not signed in. Please log in again.' }, 401);

    const { data: session, error: sessErr } = await supabase.from('sessions').select('*').eq('id', session_id).single();
    if (sessErr || !session) return json({ error: 'Session not found' }, 404);
    if (session.status !== 'confirmed') return json({ error: 'Only confirmed, paid sessions can be rescheduled this way.' }, 400);
    if (requester_id !== session.student_id && requester_id !== session.tutor_id) return json({ error: 'You are not part of this session.' }, 403);

    // Interpret the new wall-clock time in the session's own time zone (not the server's UTC).
    const { data: newStartIso, error: tzErr } = await supabase.rpc('local_to_utc', { p_date: new_date, p_time: new_time, p_tz: session.timezone || 'Europe/Berlin' });
    if (tzErr || !newStartIso) return json({ error: 'Please choose a valid date and time.' }, 400);
    const newStart = new Date(newStartIso);
    const newEnd = new Date(newStart.getTime() + (session.duration_minutes || 60) * 60000);
    if (newStart.getTime() <= Date.now() + 15 * 60000) return json({ error: 'Please choose a future date and time.' }, 400);

    const { data: blocks } = await supabase.from('tutor_blocked_slots').select('*').eq('tutor_id', session.tutor_id).eq('blocked_date', new_date);
    if ((blocks || []).find(b => b.all_day)) return json({ error: 'The tutor is unavailable on that date. Please choose a different day.' }, 400);
    if ((blocks || []).find(b => !b.all_day && new_time >= b.start_time && new_time < b.end_time)) {
      return json({ error: 'The tutor is unavailable at that time. Please choose a different time.' }, 400);
    }

    // Don't move onto another booked session of the same tutor.
    const { data: clashes } = await supabase.from('sessions').select('id')
      .eq('tutor_id', session.tutor_id).neq('id', session.id)
      .in('status', ['awaiting_payment', 'confirmed'])
      .lt('starts_at', newEnd.toISOString()).gt('ends_at', newStart.toISOString())
      .limit(1);
    if (clashes && clashes.length > 0) return json({ error: 'The tutor already has a session at that time. Please choose another time.' }, 400);

    const isTutor = requester_id === session.tutor_id;

    // A student moving a session that is already inside the no-refund window keeps that status:
    // the session is marked so a later cancellation is treated as a late cancellation.
    const update: Record<string, unknown> = { scheduled_date: new_date, scheduled_time: new_time };
    if (!isTutor && !session.late_reschedule_at) {
      const currentStart = session.starts_at ? new Date(session.starts_at) : new Date(session.scheduled_date + 'T' + session.scheduled_time);
      const hoursUntilCurrentStart = (currentStart.getTime() - Date.now()) / 3600000;
      if (hoursUntilCurrentStart < LATE_RESCHEDULE_HOURS) update.late_reschedule_at = new Date().toISOString();
    }

    await supabase.from('sessions').update(update).eq('id', session_id);

    const otherPartyId = isTutor ? session.student_id : session.tutor_id;
    const requesterName = isTutor ? session.tutor_name : session.student_name;
    const tzCity = String(session.timezone || 'Europe/Berlin').split('/').pop()!.replace(/_/g, ' ');
    const dateStr = new Date(new_date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = `${String(new_time).slice(0, 5)} (${tzCity} time)`;

    await supabase.from('notifications').insert({
      user_id: otherPartyId, type: 'session_rescheduled',
      title: '🔄 Session rescheduled',
      body: `${requesterName} moved your ${session.subject} session to ${dateStr} at ${timeStr}.`,
      link: isTutor ? 'student-dashboard.html' : 'tutor-dashboard.html', read: false,
    });

    try {
      const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
      const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
      const emailData = { studentName: session.student_name, tutorName: session.tutor_name, subject: session.subject, date: dateStr, time: timeStr };
      if (studentUser?.email) await sendEmail(supabaseUrl, 'session_rescheduled', studentUser.email, emailData);
      if (tutorUser?.email) await sendEmail(supabaseUrl, 'session_rescheduled', tutorUser.email, emailData);
    } catch (e) {
      console.error('Email dispatch failed (non-critical):', e);
    }

    return json({ success: true });

  } catch (err) {
    console.error('reschedule-session error:', err);
    return json({ error: String(err) }, 500);
  }
});
