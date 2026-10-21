import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// SERVER-ONLY diagnostic: delivery status of sent emails (Resend), the sending domain, and
// test sends through send-email. Callable only with the scheduled-jobs secret (x-cron-secret,
// checked inside the database).
// Body: { ids?: string[] }  -> [{ id, to, subject, last_event, created_at }]
//       { test: { type, to_user_id, data } } -> sends one email via send-email (service role)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);
    const cronSecret = req.headers.get('x-cron-secret') || '';
    if (!cronSecret) return json({ error: 'Forbidden' }, 403);
    const { data: ok, error } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret });
    if (error || ok !== true) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));

    if (body.test && typeof body.test === 'object') {
      const t = body.test;
      if (!/^[0-9a-f-]{36}$/i.test(String(t.to_user_id || ''))) return json({ error: 'to_user_id required' }, 400);
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ type: String(t.type || ''), to_user_id: t.to_user_id, data: t.data || {} }),
      });
      return json({ test_status: r.status, test_result: await r.json().catch(() => null) });
    }

    const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 50) : [];
    const out: any[] = [];
    for (const id of ids) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) continue;
      const r = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } });
      const d = await r.json().catch(() => ({}));
      out.push({ id, status: r.status, to: d.to, subject: d.subject, last_event: d.last_event, created_at: d.created_at });
    }
    const domRes = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } });
    const dom = await domRes.json().catch(() => ({}));
    const domains = (dom.data || []).map((x: any) => ({ name: x.name, status: x.status, region: x.region }));
    return json({ emails: out, domains });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
