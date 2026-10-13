import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Opens a lesson's classroom for the booked tutor or student.
//   - Identity comes from the login token, never from the request.
//   - Only a paid lesson (confirmed, or completed within the closing window).
//   - Open from 10 minutes before the start until 30 minutes after the end
//     (platform setting classroom_open_anytime = true opens it at any time, for testing).
// Returns the private room key, the people, the lesson details and the connection servers.

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPEN_BEFORE_MIN = 10;
const CLOSE_AFTER_MIN = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function roomKey(sessionId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('classroom:' + sessionId));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Connection helpers: STUN finds a direct route; TURN relays the call when networks block
// direct connections (university, office and some mobile networks).
async function iceServers(): Promise<any[]> {
  const servers: any[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  try {
    const cfKey = Deno.env.get('CF_TURN_KEY_ID'), cfToken = Deno.env.get('CF_TURN_API_TOKEN');
    if (cfKey && cfToken) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfKey}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 6 * 3600 }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.iceServers) {
        // Drop port 53 addresses: browsers block that port and it would only slow connecting.
        const list = (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]).map((x: any) => ({
          ...x, urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter((u: string) => !/:53(\?|$)/.test(u)),
        })).filter((x: any) => x.urls.length);
        return [...servers, ...list];
      }
      console.error('Cloudflare TURN credentials failed:', r.status);
    }
    const mDomain = Deno.env.get('METERED_DOMAIN'), mKey = Deno.env.get('METERED_API_KEY');
    if (mDomain && mKey) {
      const r = await fetch(`https://${mDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(mKey)}`);
      const d = await r.json().catch(() => null);
      if (r.ok && Array.isArray(d)) return [...servers, ...d];
      console.error('Metered TURN credentials failed:', r.status);
    }
  } catch (e) { console.error('TURN lookup error:', String(e)); }
  return servers;
}

function fmt(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
      + ' (' + tz.split('/').pop()!.replace(/_/g, ' ') + ' time)';
  } catch { return d.toISOString(); }
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
    const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
    const header = req.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return json({ error: 'Please sign in to join your lesson.' }, 401);
    const { data: auth, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !auth?.user) return json({ error: 'Your login has expired. Please sign in again.' }, 401);
    const uid = auth.user.id;

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.session_id || '');
    if (!UUID.test(sessionId)) return json({ error: 'This classroom link is not valid.' }, 400);

    const { data: s } = await sb.from('sessions').select('*').eq('id', sessionId).maybeSingle();
    if (!s) return json({ error: 'This lesson could not be found.' }, 404);
    const role = s.tutor_id === uid ? 'tutor' : s.student_id === uid ? 'student' : null;
    if (!role) return json({ error: 'You are not part of this lesson.' }, 403);

    if (s.status === 'awaiting_payment' || s.status === 'pending') {
      return json({ error: 'This lesson isn\'t confirmed yet. The classroom opens once it has been paid.' }, 400);
    }
    if (s.status !== 'confirmed' && s.status !== 'completed') {
      return json({ error: 'This lesson is no longer active, so its classroom is closed.' }, 400);
    }

    const tz = s.timezone || 'Europe/Berlin';
    const start = s.starts_at ? new Date(s.starts_at) : new Date(`${s.scheduled_date}T${s.scheduled_time}`);
    const end = s.ends_at ? new Date(s.ends_at) : new Date(start.getTime() + (s.duration_minutes || 60) * 60000);
    const opensAt = new Date(start.getTime() - OPEN_BEFORE_MIN * 60000);
    const closesAt = new Date(end.getTime() + CLOSE_AFTER_MIN * 60000);

    const { data: setting } = await sb.from('platform_settings').select('value').eq('key', 'classroom_open_anytime').maybeSingle();
    const anytime = String(setting?.value || '').toLowerCase() === 'true';
    const now = Date.now();
    if (!anytime) {
      if (now < opensAt.getTime()) {
        return json({ error: `The classroom opens 10 minutes before your lesson, at ${fmt(opensAt, tz)}.`, opens_at: opensAt.toISOString() }, 400);
      }
      if (now > closesAt.getTime()) return json({ error: 'This lesson has ended, so its classroom is closed.' }, 400);
    }

    let backupLink: string | null = null;
    const { data: tp } = await sb.from('tutor_profiles').select('meeting_link').eq('user_id', s.tutor_id).maybeSingle();
    if (tp?.meeting_link && /^https:\/\//i.test(tp.meeting_link)) backupLink = tp.meeting_link;

    const myName = role === 'tutor' ? s.tutor_name : s.student_name;
    const otherName = role === 'tutor' ? s.student_name : s.tutor_name;

    return json({
      sessionId,
      room: `${sessionId}:${await roomKey(sessionId)}`,
      me: { id: uid, name: myName || (role === 'tutor' ? 'Tutor' : 'Student'), role },
      other: { name: otherName || (role === 'tutor' ? 'your student' : 'your tutor'), role: role === 'tutor' ? 'student' : 'tutor' },
      lesson: {
        subject: s.subject || 'Lesson',
        when: `${fmt(start, tz)}, ${s.duration_minutes || 60} min`,
        startsAt: start.toISOString(), endsAt: end.toISOString(), closesAt: closesAt.toISOString(),
      },
      iceServers: await iceServers(),
      backupLink,
      dashboard: role === 'tutor' ? 'tutor-dashboard.html?tab=sessions' : 'student-dashboard.html',
    });
  } catch (err) {
    console.error('classroom-join error:', String(err));
    return json({ error: 'The classroom could not be opened. Please try again.' }, 500);
  }
});
