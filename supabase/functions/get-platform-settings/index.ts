import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value, type');

  if (error) return new Response(JSON.stringify({ error: error.message }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

  // Return as flat key-value object with proper types
  const settings: Record<string, unknown> = {};
  for (const row of data) {
    if (row.type === 'bool') settings[row.key] = row.value === 'true';
    else if (row.type === 'int') settings[row.key] = parseInt(row.value);
    else if (row.type === 'decimal') settings[row.key] = parseFloat(row.value);
    else settings[row.key] = row.value;
  }

  return new Response(JSON.stringify(settings), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
