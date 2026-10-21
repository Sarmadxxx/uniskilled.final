// UniSkilled — tiny Sentry reporter for Edge Functions (no SDK, no dependencies).
//
// Wrap a function's handler:   Deno.serve(withSentry('cancel-session', async (req) => { ... }));
//
// What gets reported:
//  • anything the handler throws (then a 500 is returned, exactly as before),
//  • every console.error(...) the function writes — that is how these functions already log
//    real failures (refund failed, payout failed, could not record payment, ...).
//    Lines marked "(non-critical)" are sent as warnings, everything else as errors,
//  • a 5xx response that wasn't already explained by one of the above.
// Emails and tokens are masked; ids are kept so a problem can be traced to its booking.
// Reporting never changes the function's response and never makes it fail.

// The DSN is public by design (it is also in the website's sentry.js); a SENTRY_DSN secret overrides it.
const DSN = Deno.env.get('SENTRY_DSN') || 'https://1453b3c0e6dcfbacf04fc4db7b59c643@o4512267680153600.ingest.de.sentry.io/4512267926569040';
const ENVIRONMENT = Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production';
const RELEASE = Deno.env.get('SENTRY_RELEASE') ?? 'uniskilled-functions@2026-10-16';

type Level = 'error' | 'warning';

function parseDsn(dsn: string): { url: string; key: string } | null {
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)\s*$/);
  if (!m) return null;
  return { key: m[1], url: `https://${m[2]}/api/${m[3]}/envelope/` };
}
const TARGET = parseDsn(DSN);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SECRET_RE = /\b(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9]+/g;
export function scrub(s: string): string {
  return s.replace(EMAIL_RE, '[email]').replace(JWT_RE, '[token]').replace(SECRET_RE, '[secret]');
}

function toText(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

// Groups "Stripe payout failed for payment 3f2a…" with every other payment's identical failure.
function fingerprintText(s: string): string {
  return scrub(s)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b(pi|po|tr|re|ch|cs|acct|evt|cus|txn)_[A-Za-z0-9]+/g, '<$1>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .slice(0, 200);
}

function stackFrames(err: Error | undefined) {
  if (!err?.stack) return undefined;
  const frames = err.stack.split('\n').slice(1).map((line) => {
    const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) return null;
    return { function: m[1] || '<anonymous>', filename: m[2].replace(/^file:\/\/\/tmp\/[^/]+\/source\//, ''), lineno: Number(m[3]), colno: Number(m[4]), in_app: !m[2].includes('jsr:') && !m[2].includes('npm:') };
  }).filter(Boolean);
  return frames.length ? { frames: frames.reverse() } : undefined;
}

function buildEvent(fnName: string, level: Level, args: unknown[], req?: Request) {
  const err = args.find((a) => a instanceof Error) as Error | undefined;
  const text = scrub(args.map(toText).join(' ')).slice(0, 4000);
  const event: Record<string, unknown> = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level,
    logger: 'edge-function',
    server_name: fnName,
    environment: ENVIRONMENT,
    release: RELEASE,
    transaction: fnName,
    tags: { function: fnName, runtime: 'supabase-edge' },
    fingerprint: [fnName, fingerprintText(text)],
  };
  if (err) {
    // Keep the human context ("PayPal refund failed:") together with the error itself.
    const prefix = scrub(args.filter((a) => !(a instanceof Error)).map(toText).join(' ')).slice(0, 300);
    event.exception = { values: [{ type: err.name || 'Error', value: scrub((prefix ? prefix + ' ' : '') + err.message).slice(0, 2000), stacktrace: stackFrames(err), mechanism: { type: 'edge-function', handled: true } }] };
    event.fingerprint = [fnName, fingerprintText((prefix ? prefix + ' ' : '') + (err.name || '') + ' ' + err.message)];
  } else {
    event.message = { formatted: text };
  }
  if (req) {
    const u = new URL(req.url);
    event.request = { method: req.method, url: `${u.origin}${u.pathname}` }; // no query, headers or body
  }
  return event;
}

const pending = new Set<Promise<unknown>>();

function report(fnName: string, level: Level, args: unknown[], req?: Request) {
  if (!TARGET) return;
  try {
    const event = buildEvent(fnName, level, args, req);
    const envelope =
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: DSN }) + '\n' +
      JSON.stringify({ type: 'event' }) + '\n' +
      JSON.stringify(event) + '\n';
    const p = fetch(`${TARGET.url}?sentry_key=${TARGET.key}&sentry_version=7&sentry_client=uniskilled-edge%2F1.0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    }).then((r) => r.body?.cancel()).catch(() => {});
    pending.add(p);
    p.finally(() => pending.delete(p));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(p);
  } catch { /* monitoring must never break the function */ }
}

export function captureError(fnName: string, ...args: unknown[]) { report(fnName, 'error', args); }

let currentFn = '';
let currentReq: Request | undefined;
let reportedThisRequest = 0;
let consolePatched = false;

function patchConsole() {
  if (consolePatched) return;
  consolePatched = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    if (!currentFn) return;
    const first = typeof args[0] === 'string' ? args[0] : '';
    const level: Level = /non-critical/i.test(first) ? 'warning' : 'error';
    if (level === 'error') reportedThisRequest++;
    report(currentFn, level, args, currentReq);
  };
}

async function flush() {
  if (pending.size === 0) return;
  await Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, 2000))]);
}

export function withSentry(fnName: string, handler: (req: Request) => Response | Promise<Response>) {
  currentFn = fnName;
  patchConsole();
  return async (req: Request): Promise<Response> => {
    currentFn = fnName;
    currentReq = req;
    reportedThisRequest = 0;
    try {
      const res = await handler(req);
      if (res.status >= 500 && reportedThisRequest === 0) {
        report(fnName, 'error', [`${fnName} returned HTTP ${res.status}`], req);
      }
      await flush();
      return res;
    } catch (err) {
      report(fnName, 'error', [`${fnName} crashed:`, err instanceof Error ? err : new Error(toText(err))], req);
      await flush();
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      });
    }
  };
}
