import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { paypalCheckoutEnabled } from './paypal-gate.ts';

// Public: tells the checkout page whether PayPal checkout is offered and, if so, which PayPal
// Client ID to load the PayPal buttons with (both read the same Supabase secrets).
// A PayPal Client ID is public by design; the Secret never leaves the server.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const headers = { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // PayPal checkout is off unless explicitly enabled AND live — see paypal-gate.ts.
  if (!paypalCheckoutEnabled((k) => Deno.env.get(k))) {
    return new Response(JSON.stringify({ checkout_enabled: false }), { headers });
  }

  const clientId = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
  if (!clientId) return new Response(JSON.stringify({ checkout_enabled: false, error: 'PayPal is not configured' }), { status: 503, headers });
  return new Response(JSON.stringify({ checkout_enabled: true, client_id: clientId, env: 'live' }), { headers });
});
