/* UniSkilled — Sentry error monitoring (shared by every page).
 *
 * Include near the top of <head> on each page:   <script src="sentry.js"></script>
 * (sentry.js itself is tiny; it loads the real SDK, sentry-sdk.min.js, in the background.)
 *
 * What it does
 *  - Reports JavaScript errors and crashed promises from every page to Sentry, plus
 *    "release health" (how many visits ended without an error) for the admin Site Health tab.
 *  - Errors that happen before the SDK has finished loading are kept and sent once it is ready.
 *  - No session replay, no performance tracing, no extra headers on calls to Supabase.
 *
 * Privacy (GDPR)
 *  - sendDefaultPii is off: no IP address, cookies or request bodies are sent.
 *  - Logged-in users are identified only by their Supabase user id + role (never name/email).
 *  - Email addresses and tokens that appear inside error messages or URLs are masked before sending.
 *
 * Report something manually from any page (safe to call even before Sentry has loaded):
 *   usReportError(err, { where: 'book-session submit', session_id: id })
 */
(function () {
  // ── CONFIG ── paste the DSN from Sentry → Settings → Projects → uniskilled-web → Client Keys (DSN)
  var SENTRY_DSN = 'REPLACE_WITH_SENTRY_DSN';
  var RELEASE = 'uniskilled-web@2026-10-16';        // bump when you upload a batch of changes
  var SDK_URL = 'sentry-sdk.min.js?v=11.8.0';
  var SB_TOKEN_KEY = 'sb-orghkbbohnabcietidiv-auth-token';

  var early = [];          // [error, context] captured before the SDK is ready
  var ready = false;

  window.usReportError = function (err, context) {
    if (ready && window.Sentry) return send(err, context);
    if (early.length < 30) early.push([err, context]);
  };

  if (SENTRY_DSN.indexOf('REPLACE') !== -1) return;  // not configured yet → do nothing
  if (/^(localhost|127\.|192\.168\.)/.test(location.hostname)) return;  // never report local testing

  function onEarlyError(e) { window.usReportError(e.error || new Error(e.message || 'Script error'), { early: true }); }
  function onEarlyRejection(e) { window.usReportError(e.reason instanceof Error ? e.reason : new Error('Unhandled rejection: ' + safeString(e.reason)), { early: true }); }
  window.addEventListener('error', onEarlyError);
  window.addEventListener('unhandledrejection', onEarlyRejection);

  // ── privacy helpers ──
  var EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  var TOKEN_RE = /((?:access_token|refresh_token|token|apikey|code|key)=)[^&#\s]+/gi;
  var JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
  function scrub(s) {
    return typeof s === 'string' ? s.replace(EMAIL_RE, '[email]').replace(TOKEN_RE, '$1[hidden]').replace(JWT_RE, '[token]') : s;
  }
  function safeString(v) { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (x) { return String(v); } }

  function supabaseUser() {
    try {
      var raw = localStorage.getItem(SB_TOKEN_KEY) || sessionStorage.getItem(SB_TOKEN_KEY);
      var t = raw ? JSON.parse(raw) : null;
      var s = t && (t.currentSession || t);
      return (s && s.user) || null;
    } catch (e) { return null; }
  }

  function send(err, context) {
    try {
      var e = err instanceof Error ? err : new Error(safeString(err));
      window.Sentry.captureException(e, context ? { extra: context } : undefined);
    } catch (x) { /* never let monitoring break the page */ }
  }

  function start() {
    var S = window.Sentry;
    if (!S || !S.init) return;
    S.init({
      dsn: SENTRY_DSN,
      release: RELEASE,
      environment: location.hostname === 'uniskilled.com' || location.hostname === 'www.uniskilled.com' ? 'production' : 'preview',
      sendDefaultPii: false,
      sampleRate: 1.0,
      maxBreadcrumbs: 40,
      // Noise that isn't a UniSkilled bug: browser extensions, third-party scripts, benign browser quirks.
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
        /^Script error\.?$/,
        'AbortError',
        'Load failed',
      ],
      denyUrls: [/extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-web-extension:\/\//i],
      beforeSend: function (event) {
        try {
          if (event.message) event.message = scrub(event.message);
          (event.exception && event.exception.values || []).forEach(function (v) { v.value = scrub(v.value); });
          if (event.request && event.request.url) event.request.url = scrub(event.request.url);
          if (event.request) { delete event.request.cookies; delete event.request.headers; }
          if (event.extra) Object.keys(event.extra).forEach(function (k) { event.extra[k] = scrub(safeString(event.extra[k])); });
        } catch (x) {}
        return event;
      },
      beforeBreadcrumb: function (b) {
        try {
          if (b.message) b.message = scrub(b.message);
          if (b.data && b.data.url) b.data.url = scrub(b.data.url);
          if (b.data && b.data.to) b.data.to = scrub(b.data.to);
          if (b.data && b.data.from) b.data.from = scrub(b.data.from);
          // Console breadcrumbs can contain personal data (names, booking details) → keep only errors.
          if (b.category === 'console' && b.level !== 'error') return null;
        } catch (x) {}
        return b;
      },
    });

    var page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    S.setTag('page', page);
    var u = supabaseUser();
    if (u && u.id) {
      var meta = u.user_metadata || {};
      S.setUser({ id: u.id });
      S.setTag('role', meta.role || 'student');
    } else {
      S.setTag('role', 'visitor');
    }

    ready = true;
    window.removeEventListener('error', onEarlyError);
    window.removeEventListener('unhandledrejection', onEarlyRejection);
    early.splice(0).forEach(function (p) { send(p[0], p[1]); });
  }

  var s = document.createElement('script');
  s.src = SDK_URL;
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.onload = start;
  (document.head || document.documentElement).appendChild(s);
})();
