import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// UniSkilled — one-time move of tutor certificate files from the PUBLIC "certificates" bucket to the
// PRIVATE "tutor-certificates" bucket (29 Oct 2026). Safe to run again: it only touches certificate
// entries that still point at a public link, and skips anything it can't copy.
//
// SERVER-ONLY: callable with the scheduled-job secret (x-cron-secret, checked inside the database)
// or the service-role key. Nobody else can run it.

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const PUBLIC_PREFIX = '/storage/v1/object/public/certificates/';

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function isTrustedCaller(req: Request, supabase: any): Promise<boolean> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (safeEqual(token, SERVICE_KEY)) return true;
  const cronSecret = req.headers.get('x-cron-secret') || '';
  if (!cronSecret) return false;
  const { data, error } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret });
  return !error && data === true;
}

Deno.serve(async (req: Request) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await isTrustedCaller(req, supabase))) return json({ error: 'Not allowed' }, 403);

  const { data: rows, error } = await supabase.from('tutor_profiles').select('user_id, certificates').not('certificates', 'is', null);
  if (error) return json({ error: error.message }, 500);

  const moved: string[] = [], failed: string[] = [];
  for (const row of rows || []) {
    if (!Array.isArray(row.certificates)) continue;
    let changed = false;
    const updated = [];
    for (const c of row.certificates) {
      const url = String(c?.fileUrl || '');
      const at = url.indexOf(PUBLIC_PREFIX);
      if (at === -1) { updated.push(c); continue; }
      const path = decodeURIComponent(url.slice(at + PUBLIC_PREFIX.length).split('?')[0]);
      // Only files inside the tutor's own folder are moved.
      if (!path.startsWith(row.user_id + '/')) { updated.push(c); failed.push(path + ' (not in tutor folder)'); continue; }

      const dl = await supabase.storage.from('certificates').download(path);
      if (dl.error || !dl.data) { updated.push(c); failed.push(path + ' (download)'); continue; }
      const up = await supabase.storage.from('tutor-certificates')
        .upload(path, await dl.data.arrayBuffer(), { contentType: dl.data.type || 'application/octet-stream', upsert: true });
      if (up.error) { updated.push(c); failed.push(path + ' (upload: ' + up.error.message + ')'); continue; }

      updated.push({ ...c, fileUrl: `private:${path}` });
      changed = true;
      moved.push(path);
    }
    if (!changed) continue;
    const { error: upErr } = await supabase.from('tutor_profiles').update({ certificates: updated }).eq('user_id', row.user_id);
    if (upErr) { failed.push(row.user_id + ' (profile update)'); continue; }
  }

  // Remove the public copies only after every profile points at the private copy.
  const toRemove = moved.filter(p => !failed.some(f => f.startsWith(p.split('/')[0])));
  if (toRemove.length) {
    const { error: rmErr } = await supabase.storage.from('certificates').remove(toRemove);
    if (rmErr) failed.push('remove public copies: ' + rmErr.message);
  }
  console.log(`move-certificates-private: moved ${moved.length}, removed ${toRemove.length}, problems ${failed.length}`);
  return json({ moved, removed: toRemove, failed });
});
