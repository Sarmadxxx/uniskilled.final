import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// RETIRED (Oct 2026 security review). This was the old pay-at-booking card flow. It accepted
// payout amounts and session ids from the browser without authentication and wrote them into
// the payments table. Card payments now go through create-stripe-checkout + stripe-webhook,
// and nothing on the site calls this endpoint any more.
Deno.serve((req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  return new Response(JSON.stringify({ error: 'This endpoint has been retired. Please refresh the page.' }), {
    status: 410, headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
