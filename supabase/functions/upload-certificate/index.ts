import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};
const MAX_BYTES = 10 * 1024 * 1024;

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

    // The folder owner is always the signed-in user. A user_id in the form is ignored.
    const userId = await getAuthedUserId(req, supabase);
    if (!userId) return json({ error: 'Not signed in. Please log in again.' }, 401);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const subjectLabel = formData.get('subject_label') as string;
    const fixedFilename = formData.get('fixed_filename') as string;

    if (!file || typeof file === 'string') return json({ error: 'file is required' }, 400);
    if (file.size > MAX_BYTES) return json({ error: 'File is too large (max 10 MB).' }, 413);

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED[ext]) return json({ error: 'File type not allowed. Use PDF, PNG, JPG, WEBP or GIF.' }, 400);

    let filePath: string;
    if (fixedFilename) {
      const safeFixed = String(fixedFilename).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40) || 'file';
      filePath = `${userId}/${safeFixed}.${ext}`;
    } else {
      const safeLabel = (subjectLabel || 'certificate').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40) || 'certificate';
      filePath = `${userId}/${Date.now()}_${safeLabel}.${ext}`;
    }

    // Certificate documents go to the PRIVATE bucket: only the tutor, admins and the students the
    // tutor allows can open them (signed links, see can_view_tutor_certificates in the database).
    // Avatars, covers (fixed_filename) and Feed attachments (feed_share) stay public as before.
    const isCertificate = !fixedFilename && subjectLabel !== 'feed_share';
    const bucket = isCertificate ? 'tutor-certificates' : 'certificates';

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, { contentType: ALLOWED[ext], upsert: true });

    if (uploadError) {
      console.error('File upload failed:', uploadError.message);
      return json({ error: 'Upload failed. Please try again.' }, 500);
    }

    if (isCertificate) {
      // No public link exists. Pages store "private:<path>" and ask for a short-lived signed link when opened.
      return json({ success: true, fileUrl: `private:${filePath}`, filePath, private: true });
    }
    const { data: urlData } = supabase.storage.from('certificates').getPublicUrl(filePath);
    return json({ success: true, fileUrl: urlData.publicUrl, filePath });
  } catch (err) {
    console.error('upload-certificate error:', err);
    return json({ error: 'Upload failed. Please try again.' }, 500);
  }
});
