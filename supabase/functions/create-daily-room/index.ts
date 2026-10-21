import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY') ?? '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Identity comes from the verified login token, never from the request body.
async function getAuthedUserId(req: Request, supabase: any): Promise<string | null> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
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
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const userId = await getAuthedUserId(req, supabase);
    if (!userId) return json({ error: 'Not signed in. Please log in again.' }, 401);

    const { session_id } = await req.json();
    if (!session_id || !UUID_RE.test(String(session_id))) return json({ error: 'Valid session_id required' }, 400);

    const { data: session } = await supabase.from('sessions')
      .select('id, tutor_id, student_id, daily_room_url, status').eq('id', session_id).maybeSingle();
    if (!session) return json({ error: 'Session not found' }, 404);
    if (userId !== session.tutor_id && userId !== session.student_id) return json({ error: 'You are not part of this session.' }, 403);
    if (session.status !== 'confirmed') return json({ error: 'The video room opens once the session is confirmed and paid.' }, 400);

    const roomName = 'us-' + String(session_id).replace(/-/g, '').slice(0, 24);
    let roomUrl = session.daily_room_url as string | null;

    if (!roomUrl) {
      // Private room: nobody can join with just the link, only with a personal meeting token.
      const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DAILY_API_KEY}` },
        body: JSON.stringify({
          name: roomName,
          privacy: 'private',
          properties: {
            enable_screenshare: true,
            enable_chat: true,
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 8),
            max_participants: 4,
          },
        }),
      });
      const roomData = await dailyRes.json();
      if (!dailyRes.ok) {
        console.error('Daily room creation failed:', JSON.stringify(roomData));
        return json({ error: 'Could not create the video room.' }, 500);
      }
      roomUrl = roomData.url;
      await supabase.from('sessions').update({ daily_room_url: roomUrl }).eq('id', session.id);
    }

    const tokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DAILY_API_KEY}` },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: userId,
          is_owner: userId === session.tutor_id,
          exp: Math.floor(Date.now() / 1000) + (60 * 60 * 4),
        },
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.token) {
      console.error('Daily token creation failed:', JSON.stringify(tokenData));
      return json({ error: 'Could not create your room access.' }, 500);
    }

    return json({ url: `${roomUrl}?t=${encodeURIComponent(tokenData.token)}` });
  } catch (err) {
    console.error('create-daily-room error:', String(err));
    return json({ error: 'Could not open the video room.' }, 500);
  }
});
