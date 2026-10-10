import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Public: tells the checkout page which PayPal Client ID to load the PayPal buttons with,
// so the page always matches the backend (both read the same Supabase secrets).
// A PayPal Client ID is public by design; the Secret never leaves the server.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
  const env = Deno.env.get('PAYPAL_ENV') === 'live' ? 'live' : 'sandbox';
  if (!clientId) return new Response(JSON.stringify({ error: 'PayPal is not configured' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ client_id: clientId, env }), {
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
