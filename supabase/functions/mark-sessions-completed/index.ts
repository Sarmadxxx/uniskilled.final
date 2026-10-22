import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

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
  if (safeEqual(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')) return true;
  const cronSecret = req.headers.get('x-cron-secret') || '';
  if (!cronSecret) return false;
  const { data, error } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret });
  return !error && data === true;
}

Deno.serve(withSentry('mark-sessions-completed', async (req: Request) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    if (!(await isTrustedCaller(req, supabase))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ends_at is the real end instant (computed in the session's own time zone by the database).
    // completed_at is stamped with the actual time of completion, so the 48h payout hold
    // always runs from now and can never be shortened by an old scheduled date.
    const nowIso = new Date().toISOString();
    const results: any[] = [];

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('status', 'confirmed')
      .not('ends_at', 'is', null)
      .lte('ends_at', nowIso);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    for (const s of sessions || []) {
      const { error: updErr } = await supabase.from('sessions').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', s.id).eq('status', 'confirmed');
      results.push({ session_id: s.id, success: !updErr, error: updErr?.message });
    }

    // Group sessions: only ones that passed the 2-student minimum check.
    const { data: groups, error: gErr } = await supabase
      .from('group_sessions')
      .select('id')
      .eq('status', 'open')
      .eq('min_check_done', true)
      .not('ends_at', 'is', null)
      .lte('ends_at', nowIso);
    if (gErr) console.error('group_sessions query failed:', gErr.message);
    for (const g of groups || []) {
      const { error: updErr } = await supabase.from('group_sessions').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', g.id).eq('status', 'open');
      results.push({ group_session_id: g.id, success: !updErr, error: updErr?.message });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('mark-sessions-completed error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
}));
