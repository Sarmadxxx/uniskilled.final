// verify-university — tutors confirm a university email address (separate from their login email).
// Actions (POST JSON, signed-in tutor only):
//   { action: 'status' }                        → current verification state
//   { action: 'send', email }                   → emails a 6-digit code to a university address
//   { action: 'confirm', code }                 → checks the code, sets the Verified badge
//   { action: 'request_domain', email, university } → "my university isn't listed" (admin reviews)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FROM = 'UniSkilled <info@uniskilled.com>';
const ADMIN_EMAIL = 'info@uniskilled.com';
const LOGO_URL = 'https://uniskilled.com/uniskilled-logo.png';
const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
const RESEND_COOLDOWN_SEC = 60;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@<>",;]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/;

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function maskEmail(e: string) {
  const [local, domain] = e.split('@');
  return (local.length <= 2 ? local[0] + '*' : local.slice(0, 2) + '•••') + '@' + domain;
}
async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function sixDigitCode() {
  const n = new Uint32Array(1); crypto.getRandomValues(n);
  return String(n[0] % 1000000).padStart(6, '0');
}
// lmu.de, campus.lmu.de, stud.cs.lmu.de → check the address's domain and each parent (never a bare TLD)
function domainCandidates(domain: string) {
  const parts = domain.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
  return out;
}
async function sendMail(to: string, subject: string, inner: string) {
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem 1rem;color:#111827;">${inner}
    <div style="text-align:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid #e5e7eb;">
      <img src="${LOGO_URL}" alt="UniSkilled" style="height:28px;width:auto;margin-bottom:0.5rem;">
      <p style="color:#9ca3af;font-size:0.75rem;margin:0;">University-verified tutoring</p>
    </div></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) console.error('Resend error', res.status, await res.text());
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);

    // Identity comes from the login token, never from the request body
    const header = req.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return json({ error: 'Please sign in again.' }, 401);
    const { data: authData, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !authData?.user) return json({ error: 'Please sign in again.' }, 401);
    const userId = authData.user.id;

    const { data: tp } = await sb.from('tutor_profiles')
      .select('user_id, university_verified_at, verified_university').eq('user_id', userId).maybeSingle();
    if (!tp) return json({ error: 'University verification is for tutors. Set up your tutor profile first.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // ── STATUS ─────────────────────────────────────────────
    if (action === 'status') {
      if (tp.university_verified_at) return json({ verified: true, university: tp.verified_university, verified_at: tp.university_verified_at });
      const { data: pending } = await sb.from('tutor_university_verifications')
        .select('email, university, expires_at').eq('user_id', userId).is('verified_at', null)
        .gt('expires_at', new Date().toISOString()).order('sent_at', { ascending: false }).limit(1).maybeSingle();
      return json({ verified: false, pending: pending ? { email: maskEmail(pending.email), university: pending.university, expires_at: pending.expires_at } : null });
    }

    if (tp.university_verified_at && action !== 'request_domain') {
      return json({ verified: true, university: tp.verified_university, message: 'You are already verified.' });
    }

    // ── SEND CODE ──────────────────────────────────────────
    if (action === 'send') {
      const email = String(body.email || '').trim().toLowerCase();
      const m = email.match(EMAIL_RE);
      if (!m) return json({ error: 'Enter a valid email address.' }, 400);
      const domain = m[1];

      const { data: match } = await sb.from('university_domains').select('domain, name')
        .in('domain', domainCandidates(domain)).order('domain', { ascending: false });
      const best = (match || []).sort((a, b) => b.domain.length - a.domain.length)[0];
      if (!best) {
        return json({ error: 'not_listed', message: "We don't recognise that as a university email domain yet. Use your university address, or ask us to add your university." }, 422);
      }

      // One university inbox can verify only one account
      const { data: usedElsewhere } = await sb.from('tutor_university_verifications').select('user_id')
        .ilike('email', email).not('verified_at', 'is', null).neq('user_id', userId).limit(1);
      if (usedElsewhere && usedElsewhere.length) return json({ error: 'This university email has already verified another UniSkilled account.' }, 409);

      // Rate limits
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { data: recent } = await sb.from('tutor_university_verifications').select('sent_at')
        .eq('user_id', userId).gt('sent_at', hourAgo).order('sent_at', { ascending: false });
      if ((recent || []).length >= MAX_SENDS_PER_HOUR) return json({ error: 'Too many codes requested. Please try again in an hour.' }, 429);
      if (recent && recent[0] && Date.now() - new Date(recent[0].sent_at).getTime() < RESEND_COOLDOWN_SEC * 1000) {
        return json({ error: 'Please wait a minute before requesting another code.' }, 429);
      }

      const code = sixDigitCode();
      const code_hash = await sha256(`${code}:${userId}:${SERVICE_KEY.slice(-16)}`);
      const expires_at = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();

      const { data: row, error: insErr } = await sb.from('tutor_university_verifications')
        .insert({ user_id: userId, email, domain: best.domain, university: best.name, code_hash, expires_at })
        .select('id').single();
      if (insErr) { console.error(insErr); return json({ error: 'Could not start verification. Please try again.' }, 500); }

      const ok = await sendMail(email, `Your UniSkilled verification code: ${code}`, `
        <h1 style="font-size:1.3rem;margin:0 0 1rem;">Confirm your university email</h1>
        <p style="color:#374151;">Enter this code on your UniSkilled tutor dashboard to verify that you study at <strong>${esc(best.name)}</strong>:</p>
        <p style="font-size:2rem;font-weight:800;letter-spacing:0.3em;background:#f0f5ff;border-radius:10px;padding:1rem;text-align:center;margin:1.2rem 0;color:#0b2a6f;">${code}</p>
        <p style="color:#6b7280;font-size:0.85rem;">The code expires in ${CODE_TTL_MIN} minutes. If you didn't ask for this, you can ignore this email — nothing will change.</p>`);
      if (!ok) {
        await sb.from('tutor_university_verifications').delete().eq('id', row.id);
        return json({ error: "We couldn't send the email. Check the address and try again." }, 502);
      }
      return json({ ok: true, university: best.name, sent_to: maskEmail(email), expires_in_min: CODE_TTL_MIN });
    }

    // ── CONFIRM CODE ───────────────────────────────────────
    if (action === 'confirm') {
      const code = String(body.code || '').replace(/\D/g, '');
      if (code.length !== 6) return json({ error: 'Enter the 6-digit code from the email.' }, 400);

      const { data: v } = await sb.from('tutor_university_verifications')
        .select('id, email, university, code_hash, expires_at, attempts').eq('user_id', userId).is('verified_at', null)
        .order('sent_at', { ascending: false }).limit(1).maybeSingle();
      if (!v) return json({ error: 'No code is waiting. Request a new one.' }, 400);
      if (new Date(v.expires_at).getTime() < Date.now()) return json({ error: 'That code has expired. Request a new one.' }, 400);
      if (v.attempts >= MAX_ATTEMPTS) return json({ error: 'Too many wrong attempts. Request a new code.' }, 429);

      const hash = await sha256(`${code}:${userId}:${SERVICE_KEY.slice(-16)}`);
      if (!safeEqual(hash, v.code_hash)) {
        await sb.from('tutor_university_verifications').update({ attempts: v.attempts + 1 }).eq('id', v.id);
        const left = MAX_ATTEMPTS - v.attempts - 1;
        return json({ error: left > 0 ? `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.' }, 400);
      }

      const now = new Date().toISOString();
      const { error: vErr } = await sb.from('tutor_university_verifications').update({ verified_at: now }).eq('id', v.id);
      if (vErr) {
        if ((vErr as any).code === '23505') return json({ error: 'This university email has already verified another UniSkilled account.' }, 409);
        console.error(vErr); return json({ error: 'Could not complete verification. Please try again.' }, 500);
      }
      const { error: tpErr } = await sb.from('tutor_profiles')
        .update({ university_verified_at: now, verified_university: v.university }).eq('user_id', userId);
      if (tpErr) { console.error(tpErr); return json({ error: 'Could not complete verification. Please try again.' }, 500); }
      await sb.from('users').update({ university_email_verified: true }).eq('id', userId); // informational; ignore errors

      await sb.from('notifications').insert({
        user_id: userId, type: 'university_verified', title: '✅ University verified',
        body: `Your profile now shows the Verified badge for ${v.university}.`, link: 'tutor-profile.html', read: false,
      });
      return json({ ok: true, verified: true, university: v.university });
    }

    // ── UNIVERSITY NOT LISTED ──────────────────────────────
    if (action === 'request_domain') {
      const email = String(body.email || '').trim().toLowerCase();
      const university = String(body.university || '').trim().slice(0, 160);
      if (!EMAIL_RE.test(email) || university.length < 3) return json({ error: 'Enter your university email and the university name.' }, 400);
      const dayAgo = new Date(Date.now() - 86400_000).toISOString();
      const { data: mine } = await sb.from('university_domain_requests').select('id').eq('user_id', userId).gt('created_at', dayAgo);
      if ((mine || []).length >= 3) return json({ error: 'You already sent a request today. We\'ll get back to you.' }, 429);
      await sb.from('university_domain_requests').insert({ user_id: userId, email, university });
      await sendMail(ADMIN_EMAIL, `🎓 University domain request — ${university}`, `
        <p>A tutor asked to add their university to the verification list.</p>
        <p><strong>University:</strong> ${esc(university)}<br><strong>Email:</strong> ${esc(email)}<br><strong>Domain:</strong> ${esc(email.split('@')[1])}</p>
        <p style="color:#6b7280;font-size:0.85rem;">If it's genuine, add the domain to the <code>university_domains</code> table (source = 'manual'), then let the tutor know they can verify.</p>`);
      return json({ ok: true, message: "Thanks — we'll review it and email you when your university is added." });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('verify-university error:', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
