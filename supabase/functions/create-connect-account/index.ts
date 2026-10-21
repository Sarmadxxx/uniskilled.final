import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

// Identity comes from the verified login token, never from the request body.
async function getAuthedUserId(req: Request, supabase: any): Promise<string | null> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

// Only allow return/refresh links that go back to our own site.
function safeSiteUrl(url: unknown, fallback: string): string {
  try {
    const u = new URL(String(url));
    if (u.protocol === 'https:' && (u.hostname === 'uniskilled.com' || u.hostname === 'www.uniskilled.com')) return u.toString();
  } catch (_e) { /* fall through */ }
  return fallback;
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { return_url, refresh_url } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const user_id = await getAuthedUserId(req, supabase);
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Not signed in. Please log in again.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: tp, error: tpErr } = await supabase.from('tutor_profiles').select('stripe_account_id').eq('user_id', user_id).single();
    if (tpErr) {
      console.error('tutor_profiles query error:', tpErr.message);
      return new Response(JSON.stringify({ error: `Could not read tutor profile: ${tpErr.message}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    let accountId = tp?.stripe_account_id;

    if (!accountId) {
      const { data: u, error: uErr } = await supabase.from('users').select('email, full_name').eq('id', user_id).single();
      if (uErr) {
        console.error('users query error:', uErr.message);
        return new Response(JSON.stringify({ error: `Could not read user record: ${uErr.message}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (!u?.email) {
        console.error('No email found for user_id:', user_id, 'row:', JSON.stringify(u));
        return new Response(JSON.stringify({ error: `No email on file for this account (user_id: ${user_id})` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      const nameParts = (u.full_name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const body = new URLSearchParams({
        type: 'express',
        'capabilities[transfers][requested]': 'true',
        'capabilities[card_payments][requested]': 'true',
        'business_type': 'individual',
        'business_profile[mcc]': '8299',
        'business_profile[url]': 'https://uniskilled.com',
        'business_profile[product_description]': 'Peer-to-peer academic tutoring booked through UniSkilled',
        'email': u.email,
        'individual[email]': u.email,
        ...(firstName ? { 'individual[first_name]': firstName } : {}),
        ...(lastName ? { 'individual[last_name]': lastName } : {}),
        'metadata[user_id]': user_id,
        'metadata[platform]': 'uniskilled',
        'settings[payouts][schedule][interval]': 'manual',
      });

      const accRes = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const account = await accRes.json();
      if (!accRes.ok) {
        console.error('Stripe account creation failed:', JSON.stringify(account));
        return new Response(JSON.stringify({ error: account.error?.message || 'Failed to create account' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      accountId = account.id;

      const { error: updErr } = await supabase.from('tutor_profiles').update({
        stripe_account_id: accountId,
        stripe_account_status: 'onboarding'
      }).eq('user_id', user_id);
      if (updErr) {
        console.error('Failed to save stripe_account_id:', updErr.message);
      }
    }

    const scheduleRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'settings[payouts][schedule][interval]': 'manual' }).toString(),
    });
    if (!scheduleRes.ok) {
      const errData = await scheduleRes.json();
      console.error('Failed to set manual payout schedule (non-fatal):', JSON.stringify(errData));
    }

    const linkBody = new URLSearchParams({
      account: accountId,
      'refresh_url': safeSiteUrl(refresh_url, 'https://uniskilled.com/tutor-dashboard.html'),
      'return_url': safeSiteUrl(return_url, 'https://uniskilled.com/tutor-dashboard.html?payout=success'),
      type: 'account_onboarding',
    });

    const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: linkBody.toString(),
    });

    const link = await linkRes.json();
    if (!linkRes.ok) {
      console.error('Stripe account_links failed:', JSON.stringify(link));
      return new Response(JSON.stringify({ error: link.error?.message || 'Failed to create link' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ url: link.url, account_id: accountId }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
