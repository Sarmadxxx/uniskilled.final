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

  const url = new URL(req.url);
  const subject = url.searchParams.get('subject');
  const format = url.searchParams.get('format');
  const max_rate = url.searchParams.get('max_rate');
  const min_rating = url.searchParams.get('min_rating');
  const language = url.searchParams.get('language');
  const student_skills = url.searchParams.get('student_skills')?.split(',') || [];
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Check AI matching flag
  const { data: aiFlag } = await supabase
    .from('platform_settings').select('value').eq('key', 'ai_matching_enabled').single();
  const aiEnabled = aiFlag?.value === 'true';

  let query = supabase.from('tutor_listing').select('*');

  if (subject) query = query.contains('subjects', [subject]);
  if (format && format !== 'both') query = query.eq('format', format);
  if (max_rate) query = query.lte('hourly_rate', parseFloat(max_rate));
  if (min_rating) query = query.gte('rating_avg', parseFloat(min_rating));
  if (language) query = query.contains('languages', [language]);

  query = query.order('rating_avg', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

  // Calculate AI match scores
  const results = (data || []).map((tutor: Record<string, unknown>) => {
    let match_score = 0;
    if (aiEnabled && student_skills.length > 0) {
      const tutorSubjects = (tutor.subjects as string[]) || [];
      const matched = student_skills.filter(s => tutorSubjects.some(sub =>
        sub.toLowerCase().includes(s.toLowerCase())
      )).length;
      match_score = Math.round((matched / student_skills.length) * 100);
    }
    return { ...tutor, match_score };
  });

  // Sort by match score if AI enabled
  if (aiEnabled && student_skills.length > 0) {
    results.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.match_score as number) - (a.match_score as number));
  }

  return new Response(JSON.stringify({ data: results, count: results.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
