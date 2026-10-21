import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Disabled: this was an unauthenticated debugging tool that used the platform Stripe key.
Deno.serve(() => new Response(JSON.stringify({ error: 'This endpoint has been disabled.' }), {
  status: 410,
  headers: { 'Content-Type': 'application/json' },
}));
