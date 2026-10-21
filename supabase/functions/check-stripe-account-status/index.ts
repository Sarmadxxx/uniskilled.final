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

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const user_id = await getAuthedUserId(req, supabase);
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Not signed in. Please log in again.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: tp } = await supabase.from('tutor_profiles').select('stripe_account_id, stripe_account_status').eq('user_id', user_id).single();
    if (!tp?.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'No Stripe account on file for this tutor' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const accRes = await fetch(`https://api.stripe.com/v1/accounts/${tp.stripe_account_id}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
    });
    const account = await accRes.json();
    if (!accRes.ok) {
      return new Response(JSON.stringify({ error: account.error?.message || 'Could not check Stripe account status' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const isActive = account.charges_enabled === true && account.payouts_enabled === true;
    const newStatus = isActive ? 'active' : 'onboarding';

    if (newStatus !== tp.stripe_account_status) {
      await supabase.from('tutor_profiles').update({ stripe_account_status: newStatus }).eq('user_id', user_id);
    }

    return new Response(JSON.stringify({
      status: newStatus,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('check-stripe-account-status error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
