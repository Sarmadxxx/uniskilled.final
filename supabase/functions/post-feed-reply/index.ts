import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // The author is always the signed-in user. A body author_id is ignored.
    const author_id = await getAuthedUserId(req, supabase);
    if (!author_id) return json({ error: 'Not signed in. Please log in again.' }, 401);

    const { post_id, content, as_tutor_answer } = await req.json();
    if (!post_id || !content?.trim()) return json({ error: 'post_id and content are required' }, 400);
    if (String(content).length > 5000) return json({ error: 'Reply is too long.' }, 400);

    const { data: author } = await supabase.from('users').select('full_name, roles').eq('id', author_id).single();
    if (!author) return json({ error: 'Author not found' }, 404);

    let isTutorAnswer = false;
    if (as_tutor_answer) {
      const isTutor = Array.isArray(author.roles) && author.roles.includes('tutor');
      if (isTutor) {
        const { data: tp } = await supabase.from('tutor_profiles').select('university_verified_at').eq('user_id', author_id).maybeSingle();
        isTutorAnswer = !!tp?.university_verified_at;
      }
    }

    const { data: reply, error } = await supabase.from('feed_replies').insert({
      post_id, author_id, author_name: author.full_name || 'User',
      is_tutor_answer: isTutorAnswer, content: content.trim(),
    }).select().single();
    if (error) return json({ error: 'Could not post reply.' }, 500);

    const { data: post } = await supabase.from('feed_posts').select('reply_count, has_tutor_answer, author_id, author_name, content').eq('id', post_id).single();
    await supabase.from('feed_posts').update({
      reply_count: (post?.reply_count || 0) + 1,
      has_tutor_answer: post?.has_tutor_answer || isTutorAnswer,
    }).eq('id', post_id);

    if (post && post.author_id !== author_id) {
      await supabase.from('notifications').insert({
        user_id: post.author_id, type: 'feed_reply',
        title: isTutorAnswer ? '✅ A verified tutor answered your post' : '💬 New comment on your post',
        body: `${author.full_name || 'Someone'} replied: "${content.trim().slice(0, 80)}"`,
        link: 'feed.html', read: false,
      });
    }

    return json({ success: true, reply, is_tutor_answer: isTutorAnswer });
  } catch (err) {
    console.error('post-feed-reply error:', err);
    return json({ error: 'Could not post reply.' }, 500);
  }
});
