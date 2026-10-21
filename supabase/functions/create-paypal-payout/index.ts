import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// PayPal credentials come from Supabase secrets (Project Settings > Edge Functions > Secrets).
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET') ?? '';
// PAYPAL_ENV secret: 'live' = real money; anything else (or unset) = PayPal sandbox
const PAYPAL_BASE = Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

// SERVER-ONLY: this function moves money, so it may only be called by other server-side code
// (e.g. release-tutor-payout) that authenticates with the project's service-role key.
// Browsers only ever hold the public anon key / a user token, which are rejected here.
function isServiceRoleCaller(req: Request): boolean {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!token || !serviceKey || token.length !== serviceKey.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ serviceKey.charCodeAt(i);
  return diff === 0;
}

async function getPayPalToken(): Promise<string> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!isServiceRoleCaller(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden: this endpoint can only be called by the server.' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { paypal_email, amount, currency, note, sender_batch_id } = await req.json();
    if (!paypal_email || !amount) {
      return new Response(JSON.stringify({ error: 'paypal_email and amount required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const token = await getPayPalToken();

    const payoutBody = {
      sender_batch_header: {
        sender_batch_id: sender_batch_id || `uniskilled_${Date.now()}`,
        email_subject: 'You have a payout from UniSkilled!',
        email_message: note || 'Thanks for tutoring on UniSkilled — your payout has been sent.',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: { value: Number(amount).toFixed(2), currency: currency || 'EUR' },
          receiver: paypal_email,
          note: note || 'UniSkilled tutoring session payout',
        },
      ],
    };

    const payoutRes = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payoutBody),
    });

    const payoutData = await payoutRes.json();
    if (!payoutRes.ok) {
      console.error('PayPal payout failed:', JSON.stringify(payoutData));
      return new Response(JSON.stringify({ error: payoutData.message || 'PayPal payout failed', details: payoutData }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      batch_id: payoutData.batch_header?.payout_batch_id,
      batch_status: payoutData.batch_header?.batch_status,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
