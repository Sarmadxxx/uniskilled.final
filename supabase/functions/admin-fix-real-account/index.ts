// DISABLED: one-off setup script, no longer needed. Kept as a stub so the endpoint is inert.
Deno.serve(() => new Response(JSON.stringify({ error: 'This endpoint has been disabled.' }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
