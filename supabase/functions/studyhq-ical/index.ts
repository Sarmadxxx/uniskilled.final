// studyhq-ical — fetches a student's campus timetable feed (iCal) so Study HQ can read it.
// Browsers cannot fetch most campus calendar links directly (no cross-origin headers), so this
// function fetches it once and returns the text. Nothing is stored, logged or shared.
//
// POST { url } — signed-in users only (verify_jwt). Safety limits:
//   • https only, default port, no credentials in the URL
//   • the host must resolve to public addresses only (no localhost, private, link-local or
//     metadata ranges), checked before connecting; redirects are not followed
//   • 8 second timeout, 5 MB cap, the body must look like an iCal file
// NOT DEPLOYED. Deploy only after review: Actions → "Deploy server functions" → studyhq-ical.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': 'https://uniskilled.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const MAX = 5 * 1024 * 1024;

function privateV4(ip: string) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function privateV6(ip: string) {
  const s = ip.toLowerCase();
  return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || s.startsWith('ff') || s.startsWith('::ffff:');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let url: URL;
  try {
    const body = await req.json();
    url = new URL(String(body?.url ?? ''));
  } catch { return json({ error: 'Invalid link' }, 400); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return json({ error: 'Only https links are supported' }, 400);
  const host = url.hostname;
  if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return json({ error: 'Invalid host' }, 400);
  try {
    const [v4, v6] = await Promise.all([Deno.resolveDns(host, 'A').catch(() => [] as string[]), Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])]);
    if (!v4.length && !v6.length) return json({ error: 'Host not found' }, 400);
    if (v4.some(privateV4) || v6.some(privateV6)) return json({ error: 'Host not allowed' }, 400);
  } catch { return json({ error: 'Host not found' }, 400); }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url.toString(), { redirect: 'manual', signal: ctrl.signal, headers: { Accept: 'text/calendar, text/plain;q=0.5' } });
    if (res.status !== 200 || !res.body) return json({ error: 'The calendar could not be fetched' }, 502);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX) { ctrl.abort(); return json({ error: 'Calendar too large' }, 413); }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    const text = new TextDecoder().decode(all);
    if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) return json({ error: 'Not a calendar file' }, 422);
    return json({ ics: text });
  } catch { return json({ error: 'The calendar could not be fetched' }, 502); }
  finally { clearTimeout(t); }
});
