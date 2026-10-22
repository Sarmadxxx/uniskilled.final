import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

    // The invitee is always the signed-in user. A body value is ignored.
    const invitee_id = await getAuthedUserId(req, supabase);
    if (!invitee_id) return json({ error: 'Not signed in. Please log in again.' }, 401);

    const { referral_code } = await req.json();
    if (!referral_code) return json({ error: 'referral_code is required' }, 400);

    const code = String(referral_code).trim().toUpperCase();

    const { data: referrer, error: referrerErr } = await supabase
      .from('users').select('id, email, roles').eq('referral_code', code).maybeSingle();
    if (referrerErr || !referrer) return json({ success: false, reason: 'invalid_code' });
    if (referrer.id === invitee_id) return json({ success: false, reason: 'self_referral' });

    const { data: invitee, error: inviteeErr } = await supabase
      .from('users').select('id, email, roles, created_at').eq('id', invitee_id).maybeSingle();
    if (inviteeErr || !invitee) return json({ error: 'Invitee not found' }, 404);

    // Only brand-new accounts (created in the last 7 days) can be captured as invitees
    if (invitee.created_at && Date.now() - new Date(invitee.created_at).getTime() > 7 * 24 * 3600 * 1000) {
      return json({ success: false, reason: 'account_too_old' });
    }

    if (referrer.email && invitee.email && referrer.email.toLowerCase() === invitee.email.toLowerCase()) {
      return json({ success: false, reason: 'self_referral' });
    }

    const { data: existing } = await supabase.from('referrals').select('id').eq('invitee_id', invitee_id).maybeSingle();
    if (existing) return json({ success: false, reason: 'already_referred' });

    const inviteeRole = (invitee.roles && invitee.roles.includes('tutor')) ? 'tutor' : 'student';

    const { data: referral, error: insertErr } = await supabase.from('referrals').insert({
      referrer_id: referrer.id,
      invitee_id: invitee.id,
      referral_code: code,
      invitee_role: inviteeRole,
      status: 'pending',
    }).select().single();
    if (insertErr) return json({ success: false, reason: 'already_referred' });

    await supabase.from('notifications').insert({
      user_id: referrer.id, type: 'referral_signup',
      title: '🎉 Someone joined using your link!',
      body: `A new ${inviteeRole} signed up using your referral link. You'll earn a credit once they complete their first session.`,
      link: inviteeRole === 'tutor' ? 'tutor-dashboard.html?tab=referrals' : 'student-dashboard.html?tab=referrals', read: false,
    });

    return json({ success: true, referral_id: referral.id });
  } catch (err) {
    console.error('capture-referral error:', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
