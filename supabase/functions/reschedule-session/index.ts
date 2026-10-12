import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Rescheduling is a request the other side must accept. The session keeps its current time
// until then. Actions:
//   request  { session_id, new_date, new_time }   — either participant proposes a new time
//   respond  { request_id, accept: true|false }   — the other participant accepts or declines
//   withdraw { request_id }                       — the requester takes the request back
// A body without `action` but with new_date/new_time is treated as `request` (older pages).

const MAX_RESCHEDULES = 2;              // accepted moves per session
const MAX_DAYS_FROM_ORIGINAL = 30;      // new time must be within this many days of the original
const MIN_HOURS_AHEAD = 2;              // new time at least this far from now (same as booking)
const NO_REQUESTS_WITHIN_HOURS = 2;     // no requests this close to the current start
const REQUEST_TTL_HOURS = 48;           // a request expires after this, or when the session starts
// A student who asks to move a session less than this many hours away keeps the no-refund status
// on a later cancellation. Must match CUTOFF_HOURS_BEFORE_SESSION in cancel-session.
const LATE_RESCHEDULE_HOURS = 24;

const HOUR = 3600000;

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

function sessionStart(s: any): Date {
  return s.starts_at ? new Date(s.starts_at) : new Date(s.scheduled_date + 'T' + s.scheduled_time);
}

function prettyWhen(dateStr: string, timeStr: string, tz: string | null) {
  const tzCity = String(tz || 'Europe/Berlin').split('/').pop()!.replace(/_/g, ' ');
  const date = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return { date, time: `${String(timeStr).slice(0, 5)} (${tzCity} time)` };
}

// Checks shared by request and accept: is the proposed time still possible for this session?
async function checkNewTime(supabase: any, session: any, newDate: string, newTime: string): Promise<{ ok: true; start: Date } | { ok: false; error: string }> {
  const { data: startIso, error: tzErr } = await supabase.rpc('local_to_utc', { p_date: newDate, p_time: newTime, p_tz: session.timezone || 'Europe/Berlin' });
  if (tzErr || !startIso) return { ok: false, error: 'Please choose a valid date and time.' };
  const start = new Date(startIso);
  const end = new Date(start.getTime() + (session.duration_minutes || 60) * 60000);

  if (start.getTime() < Date.now() + MIN_HOURS_AHEAD * HOUR) {
    return { ok: false, error: `Please choose a time at least ${MIN_HOURS_AHEAD} hours from now.` };
  }
  const original = session.original_starts_at ? new Date(session.original_starts_at) : sessionStart(session);
  if (start.getTime() > original.getTime() + MAX_DAYS_FROM_ORIGINAL * 24 * HOUR) {
    return { ok: false, error: `A session can only be moved to a date within ${MAX_DAYS_FROM_ORIGINAL} days of its original date.` };
  }
  if (Math.abs(start.getTime() - sessionStart(session).getTime()) < 60000) {
    return { ok: false, error: 'That is the current time of this session. Please choose a different time.' };
  }

  const { data: blocks } = await supabase.from('tutor_blocked_slots').select('*').eq('tutor_id', session.tutor_id).eq('blocked_date', newDate);
  if ((blocks || []).find((b: any) => b.all_day)) return { ok: false, error: 'The tutor is unavailable on that date. Please choose a different day.' };
  // A partial-day block overlaps if the session starts before the block ends and ends after it starts
  // (compared as wall-clock times in the session's time zone, as blocks are stored).
  const newEndStr = (() => {
    const [h, m] = String(newTime).slice(0, 5).split(':').map(Number);
    const mins = Math.min(h * 60 + m + (session.duration_minutes || 60), 24 * 60); // a block can't extend past midnight
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  })();
  if ((blocks || []).find((b: any) => !b.all_day && String(newTime).slice(0, 5) < String(b.end_time).slice(0, 5) && newEndStr > String(b.start_time).slice(0, 5))) {
    return { ok: false, error: 'The tutor is unavailable at that time. Please choose a different time.' };
  }

  const { data: clashes } = await supabase.from('sessions').select('id')
    .eq('tutor_id', session.tutor_id).neq('id', session.id)
    .in('status', ['awaiting_payment', 'confirmed'])
    .lt('starts_at', end.toISOString()).gt('ends_at', start.toISOString())
    .limit(1);
  if (clashes && clashes.length > 0) return { ok: false, error: 'The tutor already has a session at that time. Please choose another time.' };

  return { ok: true, start };
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
    const body = await req.json();
    const action = body.action || (body.new_date ? 'request' : '');
    if (!['request', 'respond', 'withdraw'].includes(action)) return json({ error: 'Unknown action.' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const userId = await getAuthedUserId(req, supabase);
    if (!userId) return json({ error: 'Not signed in. Please log in again.' }, 401);

    // ── Propose a new time ──
    if (action === 'request') {
      const { session_id, new_date, new_time } = body;
      if (!session_id || !new_date || !new_time) return json({ error: 'Please choose both a date and a time.' }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(new_date)) || !/^\d{2}:\d{2}(:\d{2})?$/.test(String(new_time))) {
        return json({ error: 'Please choose a valid date and time.' }, 400);
      }

      const { data: session } = await supabase.from('sessions').select('*').eq('id', session_id).maybeSingle();
      if (!session) return json({ error: 'Session not found' }, 404);
      if (userId !== session.student_id && userId !== session.tutor_id) return json({ error: 'You are not part of this session.' }, 403);
      if (session.status !== 'confirmed' || session.payment_status !== 'paid') return json({ error: 'Only confirmed, paid sessions can be rescheduled.' }, 400);
      if ((session.reschedule_count || 0) >= MAX_RESCHEDULES) {
        return json({ error: `This session has already been moved ${MAX_RESCHEDULES} times, which is the limit. You can still cancel it under the usual refund rules.` }, 400);
      }
      const currentStart = sessionStart(session);
      if (currentStart.getTime() - Date.now() < NO_REQUESTS_WITHIN_HOURS * HOUR) {
        return json({ error: `This session starts in less than ${NO_REQUESTS_WITHIN_HOURS} hours, so it can no longer be rescheduled.` }, 400);
      }

      const { data: open } = await supabase.from('reschedule_requests').select('id, requested_by, expires_at')
        .eq('session_id', session_id).eq('status', 'pending').maybeSingle();
      if (open && new Date(open.expires_at).getTime() > Date.now()) {
        return json({ error: open.requested_by === userId
          ? 'You already have a reschedule request waiting for a reply. Withdraw it first to propose a different time.'
          : 'The other person has already proposed a new time. Please accept or decline it first.' }, 400);
      }
      if (open) await supabase.from('reschedule_requests').update({ status: 'cancelled', responded_at: new Date().toISOString() }).eq('id', open.id).eq('status', 'pending');

      const check = await checkNewTime(supabase, session, String(new_date), String(new_time));
      if (!check.ok) return json({ error: check.error }, 400);

      const isTutor = userId === session.tutor_id;
      const isLate = !isTutor && (currentStart.getTime() - Date.now()) < LATE_RESCHEDULE_HOURS * HOUR;
      const expiresAt = new Date(Math.min(Date.now() + REQUEST_TTL_HOURS * HOUR, currentStart.getTime()));

      const { data: created, error: insErr } = await supabase.from('reschedule_requests').insert({
        session_id, requested_by: userId, requester_role: isTutor ? 'tutor' : 'student',
        new_date, new_time: String(new_time).slice(0, 5), new_starts_at: check.start.toISOString(),
        is_late: isLate, status: 'pending', expires_at: expiresAt.toISOString(),
      }).select('id').single();
      if (insErr) {
        if (String(insErr.code) === '23505') return json({ error: 'There is already a reschedule request waiting for this session.' }, 400);
        console.error('reschedule request insert failed:', insErr.message);
        return json({ error: 'Could not send the request. Please try again.' }, 500);
      }

      const otherId = isTutor ? session.student_id : session.tutor_id;
      const requesterName = isTutor ? session.tutor_name : session.student_name;
      const otherName = isTutor ? session.student_name : session.tutor_name;
      const when = prettyWhen(String(new_date), String(new_time), session.timezone);
      await supabase.from('notifications').insert({
        user_id: otherId, type: 'reschedule_requested',
        title: '🔄 New time requested',
        body: `${requesterName} asked to move your ${session.subject} session to ${when.date} at ${when.time}. Accept or decline it on your dashboard.`,
        link: isTutor ? 'student-dashboard.html' : 'tutor-dashboard.html', read: false,
      });
      try {
        const { data: other } = await supabase.from('users').select('email').eq('id', otherId).single();
        if (other?.email) {
          await sendEmail(supabaseUrl, 'reschedule_requested', other.email, {
            recipientName: otherName, requesterName, subject: session.subject,
            date: when.date, time: when.time,
            dashboard: isTutor ? 'student-dashboard.html' : 'tutor-dashboard.html',
          });
        }
      } catch (e) { console.error('Email failed (non-critical):', e); }

      return json({ success: true, pending: true, request_id: created.id, expires_at: expiresAt.toISOString() });
    }

    // ── Accept / decline / withdraw ──
    const { request_id } = body;
    if (!request_id) return json({ error: 'request_id required' }, 400);
    const { data: rr } = await supabase.from('reschedule_requests').select('*').eq('id', request_id).maybeSingle();
    if (!rr) return json({ error: 'Reschedule request not found.' }, 404);
    const { data: session } = await supabase.from('sessions').select('*').eq('id', rr.session_id).maybeSingle();
    if (!session) return json({ error: 'Session not found' }, 404);
    if (userId !== session.student_id && userId !== session.tutor_id) return json({ error: 'You are not part of this session.' }, 403);
    if (rr.status !== 'pending') return json({ error: 'This request has already been answered.' }, 400);

    const nowIso = new Date().toISOString();
    const close = (status: string) => supabase.from('reschedule_requests')
      .update({ status, responded_at: nowIso }).eq('id', rr.id).eq('status', 'pending').select('id');

    if (action === 'withdraw') {
      if (rr.requested_by !== userId) return json({ error: 'Only the person who asked can withdraw this request.' }, 403);
      await close('withdrawn');
      return json({ success: true, withdrawn: true });
    }

    // respond
    if (rr.requested_by === userId) return json({ error: 'You can\'t answer your own request.' }, 403);
    const requesterIsTutor = rr.requester_role === 'tutor';
    const requesterId = rr.requested_by;
    const responderName = requesterIsTutor ? session.student_name : session.tutor_name;
    const requesterName = requesterIsTutor ? session.tutor_name : session.student_name;
    const when = prettyWhen(String(rr.new_date), String(rr.new_time), session.timezone);

    const expired = new Date(rr.expires_at).getTime() <= Date.now();
    if (expired || session.status !== 'confirmed' || session.payment_status !== 'paid') {
      await close('cancelled');
      return json({ error: expired ? 'This request has expired, so the session stays at its current time.' : 'This session can no longer be rescheduled.' }, 400);
    }

    if (body.accept !== true) {
      const { data: closed } = await close('declined');
      if (!closed || closed.length === 0) return json({ error: 'This request has already been answered.' }, 400);
      await supabase.from('notifications').insert({
        user_id: requesterId, type: 'reschedule_declined',
        title: 'New time declined',
        body: `${responderName} couldn't make ${when.date} at ${when.time}. Your ${session.subject} session stays at its current time.`,
        link: requesterIsTutor ? 'tutor-dashboard.html' : 'student-dashboard.html', read: false,
      });
      try {
        const { data: ru } = await supabase.from('users').select('email').eq('id', requesterId).single();
        if (ru?.email) await sendEmail(supabaseUrl, 'reschedule_declined', ru.email, {
          recipientName: requesterName, responderName, subject: session.subject, date: when.date, time: when.time,
          dashboard: requesterIsTutor ? 'tutor-dashboard.html' : 'student-dashboard.html',
        });
      } catch (e) { console.error('Email failed (non-critical):', e); }
      return json({ success: true, declined: true });
    }

    if ((session.reschedule_count || 0) >= MAX_RESCHEDULES) {
      await close('cancelled');
      return json({ error: `This session has already been moved ${MAX_RESCHEDULES} times, which is the limit.` }, 400);
    }
    // Re-check the time: the tutor's calendar may have changed since the request was made.
    const check = await checkNewTime(supabase, session, String(rr.new_date), String(rr.new_time));
    if (!check.ok) {
      await close('cancelled');
      return json({ error: `${check.error} The session stays at its current time.` }, 400);
    }

    // Claim the request first so a double click can't apply it twice.
    const { data: claimed } = await close('accepted');
    if (!claimed || claimed.length === 0) return json({ error: 'This request has already been answered.' }, 400);

    const update: Record<string, unknown> = {
      scheduled_date: rr.new_date,
      scheduled_time: String(rr.new_time).slice(0, 5),
      reschedule_count: (session.reschedule_count || 0) + 1,
      original_starts_at: session.original_starts_at || sessionStart(session).toISOString(),
    };
    if (rr.is_late && !session.late_reschedule_at) update.late_reschedule_at = rr.created_at;
    if (requesterIsTutor && !session.tutor_rescheduled_at) update.tutor_rescheduled_at = nowIso;

    const { data: moved, error: updErr } = await supabase.from('sessions').update(update)
      .eq('id', session.id).eq('status', 'confirmed').eq('reschedule_count', session.reschedule_count || 0).select('id');
    if (updErr || !moved || moved.length === 0) {
      await supabase.from('reschedule_requests').update({ status: 'cancelled' }).eq('id', rr.id);
      console.error('reschedule apply failed:', updErr?.message);
      return json({ error: 'Could not move the session. It stays at its current time — please try again.' }, 500);
    }

    await supabase.from('notifications').insert([
      {
        user_id: requesterId, type: 'session_rescheduled', title: '🔄 Session rescheduled',
        body: `${responderName} accepted. Your ${session.subject} session is now on ${when.date} at ${when.time}.`,
        link: requesterIsTutor ? 'tutor-dashboard.html' : 'student-dashboard.html', read: false,
      },
      {
        user_id: userId, type: 'session_rescheduled', title: '🔄 Session rescheduled',
        body: `Your ${session.subject} session is now on ${when.date} at ${when.time}.`,
        link: requesterIsTutor ? 'student-dashboard.html' : 'tutor-dashboard.html', read: false,
      },
    ]);
    try {
      const { data: studentUser } = await supabase.from('users').select('email').eq('id', session.student_id).single();
      const { data: tutorUser } = await supabase.from('users').select('email').eq('id', session.tutor_id).single();
      const emailData = { studentName: session.student_name, tutorName: session.tutor_name, subject: session.subject, date: when.date, time: when.time };
      if (studentUser?.email) await sendEmail(supabaseUrl, 'session_rescheduled', studentUser.email, emailData);
      if (tutorUser?.email) await sendEmail(supabaseUrl, 'session_rescheduled', tutorUser.email, emailData);
    } catch (e) { console.error('Email dispatch failed (non-critical):', e); }

    return json({ success: true, accepted: true, new_starts_at: check.start.toISOString() });

  } catch (err) {
    console.error('reschedule-session error:', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
