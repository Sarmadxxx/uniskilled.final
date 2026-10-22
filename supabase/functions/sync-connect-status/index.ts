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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const user_id = await getAuthedUserId(req, supabase);
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Not signed in. Please log in again.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: tp, error: tpErr } = await supabase.from('tutor_profiles').select('stripe_account_id').eq('user_id', user_id).single();
    if (tpErr || !tp?.stripe_account_id) {
      return new Response(JSON.stringify({ status: 'not_connected' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const acctRes = await fetch(`https://api.stripe.com/v1/accounts/${tp.stripe_account_id}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
    });
    const acct = await acctRes.json();
    if (!acctRes.ok) {
      return new Response(JSON.stringify({ error: acct.error?.message || 'Failed to fetch account' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Real truth: only "active" if Stripe says payouts are actually enabled
    const realStatus = acct.payouts_enabled ? 'active' : (acct.details_submitted ? 'onboarding' : 'not_connected');

    await supabase.from('tutor_profiles').update({ stripe_account_status: realStatus }).eq('user_id', user_id);

    return new Response(JSON.stringify({
      status: realStatus,
      payouts_enabled: acct.payouts_enabled,
      charges_enabled: acct.charges_enabled,
      details_submitted: acct.details_submitted,
      currently_due: acct.requirements?.currently_due || [],
      disabled_reason: acct.requirements?.disabled_reason || null,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
