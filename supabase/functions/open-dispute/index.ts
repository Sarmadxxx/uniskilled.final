import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Identity comes from the verified login token, never from the request body.
async function getAuthedUserId(req: Request, supabase: any): Promise<string | null> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function sendEmail(supabaseUrl: string, type: string, to: string, data: any) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}` },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (e) {
    console.error('Email dispatch failed (non-critical):', e);
  }
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { session_id, reason } = await req.json();
    if (!session_id || !reason) {
      return new Response(JSON.stringify({ error: 'session_id and reason are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    const opener_id = await getAuthedUserId(req, supabase);
    if (!opener_id) {
      return new Response(JSON.stringify({ error: 'Not signed in. Please log in again.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: session, error: sessErr } = await supabase.from('sessions').select('*').eq('id', session_id).single();
    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const isStudent = opener_id === session.student_id;
    const isTutor = opener_id === session.tutor_id;
    if (!isStudent && !isTutor) {
      return new Response(JSON.stringify({ error: 'You are not part of this session.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (!['confirmed', 'completed'].includes(session.status)) {
      return new Response(JSON.stringify({ error: 'Only confirmed or completed sessions can be disputed.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (session.completed_at) {
      const hoursSinceCompleted = (Date.now() - new Date(session.completed_at).getTime()) / 3600000;
      if (hoursSinceCompleted > 48) {
        return new Response(JSON.stringify({ error: 'The 48-hour window to report an issue on this session has passed.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    const { data: existing } = await supabase.from('disputes').select('id').eq('session_id', session_id).eq('status', 'open').maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: 'A dispute is already open for this session.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const againstId = isStudent ? session.tutor_id : session.student_id;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);

    const { data: dispute, error: insertErr } = await supabase.from('disputes').insert({
      opened_by: opener_id,
      against: againstId,
      session_id,
      reason,
      status: 'open',
      deadline: deadline.toISOString(),
    }).select().single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    await supabase.from('notifications').insert([
      {
        user_id: againstId, type: 'dispute_opened',
        title: '⚠️ An issue has been reported',
        body: `A dispute has been opened regarding your ${session.subject} session. Our team will review it before any payout.`,
        link: isStudent ? 'tutor-dashboard.html' : 'student-dashboard.html', read: false,
      },
      {
        user_id: opener_id, type: 'dispute_opened',
        title: 'Your report has been submitted',
        body: `We've received your report about the ${session.subject} session. We'll review it and follow up.`,
        link: isStudent ? 'student-dashboard.html' : 'tutor-dashboard.html', read: false,
      },
    ]);

    const openerName = isStudent ? session.student_name : session.tutor_name;
    try {
      const { data: againstUser } = await supabase.from('users').select('email').eq('id', againstId).single();
      if (againstUser?.email) {
        await sendEmail(supabaseUrl, 'dispute_opened', againstUser.email, { sessionId: session.id, subject: session.subject, openerName });
      }
      // Receipt for the person who reported the issue.
      const { data: openerUser } = await supabase.from('users').select('email').eq('id', opener_id).single();
      if (openerUser?.email) {
        await sendEmail(supabaseUrl, 'dispute_submitted', openerUser.email, { sessionId: session.id, subject: session.subject, reason, disputeId: dispute.id });
      }
    } catch (e) {
      console.error('Email dispatch failed (non-critical):', e);
    }

    const { data: admins } = await supabase.from('users').select('id, email').contains('roles', ['admin']);
    for (const admin of admins || []) {
      await supabase.from('notifications').insert({
        user_id: admin.id, type: 'dispute_opened',
        title: `🚨 New dispute #${dispute.id.slice(0, 8)}`,
        body: `${session.subject} session — reported by ${openerName}: "${reason.slice(0, 100)}"`,
        link: 'admin-disputes.html', read: false,
      });
      if (admin.email) {
        await sendEmail(supabaseUrl, 'dispute_opened_admin', admin.email, {
          sessionId: session.id, disputeId: dispute.id, subject: session.subject, reason, openerName,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, dispute_id: dispute.id }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('open-dispute error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
