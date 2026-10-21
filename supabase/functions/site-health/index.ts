import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { withSentry } from './sentry.ts';

// Site Health — the bridge between Sentry and the admin console.
//
//  POST { action: 'stats' }                         admin only → KPIs, top issues, review queue
//  POST { action: 'sync' }                          admin only → pull Sentry issues into error_reviews now
//  POST { action: 'update_review', id, review_status } admin only → mark uploaded / ignored / re-review
//  cron (x-cron-secret)                             → same as 'sync' (every 30 minutes)
//
// Secrets: SENTRY_AUTH_TOKEN (org:read, project:read, event:read, event:write); SENTRY_DSN is built in,
//          optional SENTRY_ORG (default 'uniskilled') and SENTRY_API_BASE (derived from the DSN).
// The Sentry token never reaches the browser.

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SENTRY_TOKEN = Deno.env.get('SENTRY_AUTH_TOKEN') ?? '';
const SENTRY_ORG = Deno.env.get('SENTRY_ORG') ?? 'uniskilled';
const SENTRY_API_BASE = (() => {
  const explicit = Deno.env.get('SENTRY_API_BASE');
  if (explicit) return explicit.replace(/\/$/, '');
  const host = (Deno.env.get('SENTRY_DSN') || 'https://1453b3c0e6dcfbacf04fc4db7b59c643@o4512267680153600.ingest.de.sentry.io/4512267926569040').match(/@([^/]+)\//)?.[1] ?? '';
  if (/\.de\.sentry\.io$/.test(host)) return 'https://de.sentry.io';
  if (/\.us\.sentry\.io$/.test(host)) return 'https://us.sentry.io';
  return 'https://sentry.io';
})();

const REVIEW_STATUSES = ['new', 'diagnosing', 'fix_ready', 'needs_info', 'uploaded', 'fixed', 'ignored'];
const OPEN_REVIEW = ['new', 'diagnosing', 'fix_ready', 'needs_info', 'uploaded'];

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function isCron(req: Request, supabase: any): Promise<boolean> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (safeEqual(token, SERVICE_KEY)) return true;
  const cronSecret = req.headers.get('x-cron-secret') || '';
  if (!cronSecret) return false;
  const { data, error } = await supabase.rpc('verify_cron_secret', { p_secret: cronSecret });
  return !error && data === true;
}

// Returns null when the caller is an admin, otherwise the reason they were refused.
async function adminCheck(req: Request, supabase: any): Promise<string | null> {
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return 'not signed in';
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) { console.log('site-health auth check failed:', error?.message); return 'session not recognised — sign in again'; }
  const { data: u, error: uErr } = await supabase.from('users').select('roles').eq('id', data.user.id).maybeSingle();
  if (uErr) { console.log('site-health roles lookup failed:', uErr.message); return 'could not read account roles'; }
  const roles: string[] = Array.isArray(u?.roles) ? u.roles : String(u?.roles ?? '').replace(/[{}]/g, '').split(',');
  return roles.map((r) => String(r).trim()).includes('admin') ? null : 'this account is not an admin';
}

async function sentry(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any; hits: number | null }> {
  const res = await fetch(`${SENTRY_API_BASE}/api/0${path}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${SENTRY_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  const hits = res.headers.get('X-Hits');
  return { ok: res.ok, status: res.status, data, hits: hits ? Number(hits) : null };
}

const org = encodeURIComponent(SENTRY_ORG);

// Only what a reviewer needs to find the bug — no user data beyond the pseudonymous id Sentry already has.
function summarizeEvent(ev: any) {
  if (!ev) return null;
  const exc = (ev.entries || []).find((e: any) => e.type === 'exception')?.data?.values?.slice(-1)?.[0];
  const msg = (ev.entries || []).find((e: any) => e.type === 'message')?.data?.formatted;
  const frames = (exc?.stacktrace?.frames || []).slice(-12).reverse().map((f: any) => ({
    file: f.filename || f.absPath || f.module, fn: f.function, line: f.lineNo, col: f.colNo, in_app: f.inApp,
    context: (f.context || []).filter((c: any) => c[0] === f.lineNo).map((c: any) => String(c[1]).slice(0, 300))[0] ?? null,
  }));
  const tags: Record<string, string> = {};
  for (const t of ev.tags || []) if (['page', 'role', 'function', 'browser', 'os', 'url', 'environment', 'release', 'level'].includes(t.key)) tags[t.key] = t.value;
  const crumbs = ((ev.entries || []).find((e: any) => e.type === 'breadcrumbs')?.data?.values || []).slice(-8)
    .map((b: any) => `${b.category || ''} ${b.message || b.data?.url || ''}`.trim().slice(0, 200));
  return {
    type: exc?.type ?? null, value: (exc?.value ?? msg ?? ev.title ?? '').slice(0, 1000),
    url: ev.request?.url ?? tags.url ?? null, tags, frames, breadcrumbs: crumbs,
    event_id: ev.eventID ?? ev.id ?? null, received: ev.dateReceived ?? ev.dateCreated ?? null,
  };
}

async function notifyAdmins(supabase: any, title: string, body: string) {
  try {
    const { data: admins } = await supabase.from('users').select('id').contains('roles', ['admin']);
    for (const a of admins || []) {
      await supabase.from('notifications').insert({ user_id: a.id, type: 'site_error', title, body, link: 'admin.html', read: false });
    }
  } catch (e) {
    console.error('Site-health admin notification failed (non-critical):', e);
  }
}

async function syncIssues(supabase: any) {
  const list = await sentry(`/organizations/${org}/issues/?project=-1&query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&sort=freq&limit=50`);
  if (!list.ok) throw new Error(`Sentry issues request failed (HTTP ${list.status}): ${JSON.stringify(list.data).slice(0, 300)}`);
  const issues: any[] = Array.isArray(list.data) ? list.data : [];

  const { data: existingRows } = await supabase.from('error_reviews').select('id, sentry_issue_id, review_status, sentry_status, diagnosis');
  const existing = new Map<string, any>((existingRows || []).map((r: any) => [r.sentry_issue_id, r]));
  const seen = new Set<string>();
  let created = 0, reopened = 0, closed = 0;
  const newOnes: string[] = [];

  for (const is of issues) {
    seen.add(String(is.id));
    const base = {
      short_id: is.shortId, title: String(is.title || '').slice(0, 500), culprit: String(is.culprit || '').slice(0, 500),
      level: is.level, permalink: is.permalink, project: is.project?.slug ?? null,
      event_count: Number(is.count || 0), user_count: Number(is.userCount || 0),
      first_seen: is.firstSeen, last_seen: is.lastSeen, sentry_status: is.status || 'unresolved',
      updated_at: new Date().toISOString(),
    };
    const row = existing.get(String(is.id));
    if (!row) {
      let summary = null;
      const latest = await sentry(`/organizations/${org}/issues/${is.id}/events/latest/`);
      if (latest.ok) summary = summarizeEvent(latest.data);
      const { error } = await supabase.from('error_reviews').insert({ sentry_issue_id: String(is.id), ...base, event_summary: summary, review_status: 'new' });
      if (!error) { created++; if (is.level !== 'warning' && is.level !== 'info') newOnes.push(`${is.shortId}: ${base.title}`); }
      else if (error.code !== '23505') console.error('error_reviews insert failed:', error.message);
    } else {
      const patch: Record<string, unknown> = { ...base };
      // It came back after the fix was uploaded and the issue resolved (Sentry calls this a
      // regression) → put it back in the review queue with the previous diagnosis kept for context.
      const wasResolved = row.sentry_status === 'resolved' || row.review_status === 'fixed';
      if ((row.review_status === 'fixed' || row.review_status === 'uploaded') && (wasResolved || is.substatus === 'regressed')) {
        const latest = await sentry(`/organizations/${org}/issues/${is.id}/events/latest/`);
        if (latest.ok) patch.event_summary = summarizeEvent(latest.data);
        patch.review_status = 'new';
        patch.diagnosis = `⚠️ Came back on ${new Date().toISOString().slice(0, 10)} after a fix was uploaded.${row.diagnosis ? ' Previous diagnosis: ' + String(row.diagnosis).slice(0, 1500) : ''}`;
        patch.proposed_fix = null;
        reopened++;
      }
      await supabase.from('error_reviews').update(patch).eq('id', row.id);
    }
  }

  // Open reviews that are no longer unresolved in Sentry: check what happened to them.
  const gone = (existingRows || []).filter((r: any) => !seen.has(r.sentry_issue_id) && OPEN_REVIEW.includes(r.review_status)).slice(0, 20);
  for (const r of gone) {
    const one = await sentry(`/organizations/${org}/issues/${r.sentry_issue_id}/`);
    if (!one.ok) continue;
    const st = one.data?.status;
    if (st === 'resolved') {
      await supabase.from('error_reviews').update({ sentry_status: 'resolved', review_status: 'fixed', updated_at: new Date().toISOString() }).eq('id', r.id);
      closed++;
    } else if (st === 'ignored' || st === 'archived') {
      await supabase.from('error_reviews').update({ sentry_status: st, review_status: 'ignored', updated_at: new Date().toISOString() }).eq('id', r.id);
      closed++;
    }
  }

  if (newOnes.length > 0) {
    await notifyAdmins(supabase, `🐞 ${newOnes.length} new site error${newOnes.length === 1 ? '' : 's'} caught`,
      `${newOnes.slice(0, 5).join('\n')}${newOnes.length > 5 ? `\n…and ${newOnes.length - 5} more` : ''}\nThe daily Claude review will diagnose ${newOnes.length === 1 ? 'it' : 'them'} and prepare a fix.`);
  }
  return { checked: issues.length, created, reopened, closed };
}

async function stats(supabase: any) {
  const [errors7d, unresolved, newIssues, sessions, top, reviews] = await Promise.all([
    sentry(`/organizations/${org}/stats_v2/?project=-1&field=sum(quantity)&category=error&outcome=accepted&statsPeriod=7d&interval=1d`),
    sentry(`/organizations/${org}/issues/?project=-1&query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&limit=1`),
    sentry(`/organizations/${org}/issues/?project=-1&query=${encodeURIComponent('is:unresolved firstSeen:-24h')}&statsPeriod=24h&limit=1`),
    sentry(`/organizations/${org}/sessions/?project=-1&field=crash_free_rate(session)&field=sum(session)&statsPeriod=24h&interval=1d`),
    sentry(`/organizations/${org}/issues/?project=-1&query=${encodeURIComponent('is:unresolved')}&statsPeriod=24h&sort=freq&limit=8`),
    supabase.from('error_reviews').select('id, sentry_issue_id, short_id, title, culprit, level, permalink, event_count, user_count, last_seen, review_status, diagnosis, proposed_fix, files_changed, reviewed_at, updated_at, event_summary')
      .order('updated_at', { ascending: false }).limit(60),
  ]);

  const problems: string[] = [];
  for (const [name, r] of [['error counts', errors7d], ['issues', unresolved], ['sessions', sessions]] as const) {
    if (!r.ok) problems.push(`${name}: HTTP ${r.status}`);
  }

  const daily: number[] = errors7d.ok ? (errors7d.data?.groups?.[0]?.series?.['sum(quantity)'] ?? []) : [];
  const days: string[] = errors7d.ok ? (errors7d.data?.intervals ?? []) : [];
  const totals = sessions.ok ? (sessions.data?.groups?.[0]?.totals ?? {}) : {};
  const crashFree = totals['crash_free_rate(session)'];

  const topIssues = (top.ok && Array.isArray(top.data) ? top.data : []).map((i: any) => ({
    id: String(i.id), short_id: i.shortId, title: i.title, culprit: i.culprit, level: i.level,
    events_24h: (i.stats?.['24h'] || []).reduce((a: number, p: any) => a + Number(p[1] || 0), 0),
    events_total: Number(i.count || 0), users: Number(i.userCount || 0), last_seen: i.lastSeen, permalink: i.permalink,
  }));

  const allReviews = reviews.data || [];
  return {
    configured: true,
    problems,
    kpis: {
      errors_24h: daily.length ? Number(daily[daily.length - 1] || 0) : null,
      errors_7d: daily.length ? daily.reduce((a, b) => a + Number(b || 0), 0) : null,
      unresolved_issues: unresolved.hits,
      new_issues_24h: newIssues.hits,
      crash_free_sessions: typeof crashFree === 'number' ? crashFree : null,
      sessions_24h: typeof totals['sum(session)'] === 'number' ? totals['sum(session)'] : null,
      fixes_ready: allReviews.filter((r: any) => r.review_status === 'fix_ready').length,
      awaiting_review: allReviews.filter((r: any) => r.review_status === 'new' || r.review_status === 'diagnosing').length,
    },
    daily: days.map((d, i) => ({ day: d.slice(0, 10), errors: Number(daily[i] || 0) })),
    top_issues: topIssues,
    reviews: allReviews,
    sentry_org_url: `https://${SENTRY_ORG}.sentry.io/issues/`,
  };
}

Deno.serve(withSentry('site-health', async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY);

  try {
    if (await isCron(req, supabase)) {
      if (!SENTRY_TOKEN) return json({ skipped: 'SENTRY_AUTH_TOKEN not set' });
      return json(await syncIssues(supabase));
    }
    const refused = await adminCheck(req, supabase);
    if (refused) return json({ error: `Admins only (${refused}).` }, 403);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const action = body.action || 'stats';

    if (action === 'update_review') {
      if (!body.id || !REVIEW_STATUSES.includes(body.review_status)) return json({ error: 'id and a valid review_status are required' }, 400);
      const { data: row } = await supabase.from('error_reviews').select('id, sentry_issue_id').eq('id', body.id).maybeSingle();
      if (!row) return json({ error: 'Review not found' }, 404);
      const patch: Record<string, unknown> = { review_status: body.review_status, updated_at: new Date().toISOString() };
      let sentryUpdated: boolean | null = null;
      // Uploading a fix resolves the issue in Sentry: if the error happens again, Sentry flags it as
      // a regression and the next sync puts it back in the review queue automatically.
      if (SENTRY_TOKEN && (body.review_status === 'uploaded' || body.review_status === 'ignored')) {
        const status = body.review_status === 'uploaded' ? { status: 'resolved' } : { status: 'ignored' };
        const r = await sentry(`/organizations/${org}/issues/?id=${encodeURIComponent(row.sentry_issue_id)}`, { method: 'PUT', body: JSON.stringify(status) });
        sentryUpdated = r.ok;
        if (r.ok) patch.sentry_status = status.status;
        else console.error(`Could not update Sentry issue ${row.sentry_issue_id} (HTTP ${r.status}) (non-critical)`);
      }
      await supabase.from('error_reviews').update(patch).eq('id', row.id);
      return json({ success: true, sentry_updated: sentryUpdated });
    }

    if (!SENTRY_TOKEN) {
      // No token: show the numbers the daily Claude review captured through the Sentry connector.
      const [{ data: snap }, { data: reviews }] = await Promise.all([
        supabase.from('site_health_snapshots').select('*').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('error_reviews').select('id, sentry_issue_id, short_id, title, culprit, level, permalink, event_count, user_count, last_seen, review_status, diagnosis, proposed_fix, files_changed, reviewed_at, updated_at, event_summary')
          .order('updated_at', { ascending: false }).limit(60),
      ]);
      const all = reviews || [];
      if (!snap) return json({ configured: false, source: 'snapshot', reviews: all });
      return json({
        configured: true, source: 'snapshot', captured_at: snap.captured_at, problems: [],
        kpis: {
          ...(snap.kpis || {}),
          fixes_ready: all.filter((r: any) => r.review_status === 'fix_ready').length,
          awaiting_review: all.filter((r: any) => r.review_status === 'new' || r.review_status === 'diagnosing').length,
        },
        daily: snap.daily || [], top_issues: snap.top_issues || [], reviews: all,
        sentry_org_url: `https://${SENTRY_ORG}.sentry.io/issues/`,
      });
    }

    if (action === 'sync') return json({ synced: await syncIssues(supabase), ...(await stats(supabase)) });
    return json(await stats(supabase));
  } catch (err) {
    console.error('site-health error:', err);
    return json({ error: String(err) }, 500);
  }
}));
