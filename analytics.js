/* UniSkilled — PostHog analytics (shared by every public/user page).
 *
 * Include in <head> on each page:  <script src="analytics.js" defer></script>
 *
 * What it does
 *  - Product + web analytics: pageviews, clicks, and the booking-funnel events below.
 *  - Session replay and error tracking, but only after the visitor accepts the banner.
 *  - GDPR: until a visitor chooses, PostHog runs cookieless (in-memory only, anonymous).
 *    "Decline" = PostHog is not loaded at all on later pages.
 *  - Logged-in users are identified by their Supabase user id + role (never email).
 *
 * Track a custom event from any page:   usTrack('event_name', { some: 'prop' })
 * Calls made before PostHog has loaded are queued, so it's always safe to call.
 *
 * Funnel events currently sent:
 *   signup_completed     onboarding.html      { role }
 *   signed_in            signin.html          { role }
 *   tutor_search         find-tutors.html     { has_query }
 *   booking_requested    book-session.html    { subject, price, currency, duration_minutes, format }
 *   booking_responded    tutor-dashboard.html { decision: accepted|declined }
 *   group_session_joined group-sessions.html
 *   checkout_started     complete-payment.html { type: individual|group }
 *   payment_completed    complete-payment.html { type }
 *   issue_reported       student/tutor dashboards { reporter_role }
 */
(function () {
  // ── CONFIG ── paste the Project API key from PostHog → Settings → Project → "Project API key"
  var POSTHOG_KEY = 'phc_REPLACE_WITH_YOUR_PROJECT_API_KEY';
  var POSTHOG_HOST = 'https://eu.i.posthog.com';   // EU Cloud (data stays in Frankfurt)
  var POSTHOG_UI_HOST = 'https://eu.posthog.com';
  var LIB_URL = 'https://cdn.jsdelivr.net/npm/posthog-js@1.438.7/dist/array.full.js';

  var CONSENT_KEY = 'us_analytics_consent';           // 'yes' | 'no' | (unset)
  var SB_TOKEN_KEY = 'sb-orghkbbohnabcietidiv-auth-token';
  var NO_REPLAY_PAGES = /messages|admin/i;            // never record private chats or admin screens

  var queue = [];
  // usTrack(event, props, { now: true }) → send immediately (use right before a redirect)
  window.usTrack = function (event, props, opts) {
    var o = opts && opts.now ? { send_instantly: true, transport: 'sendBeacon' } : undefined;
    if (window.posthog && window.posthog.__loaded) { window.posthog.capture(event, props || {}, o); }
    else { queue.push([event, props || {}, o]); }
  };

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function consent() { return store(CONSENT_KEY); }

  if (POSTHOG_KEY.indexOf('REPLACE') !== -1) return;   // not configured yet → do nothing
  if (consent() === 'no') return;                       // visitor declined → never load

  function supabaseUser() {
    try {
      var raw = localStorage.getItem(SB_TOKEN_KEY) || sessionStorage.getItem(SB_TOKEN_KEY);
      return raw ? (JSON.parse(raw).user || null) : null;
    } catch (e) { return null; }
  }

  function syncIdentity(ph) {
    var u = supabaseUser();
    if (u && u.id) {
      if (consent() === 'yes' && ph.get_distinct_id() !== u.id) {
        var meta = u.user_metadata || {};
        ph.identify(u.id, { role: meta.role || 'student' });
      }
    } else if (ph.get_property('$user_state') === 'identified') {
      ph.reset();                                        // signed out → stop attributing to that user
    }
  }

  function enableFullTracking(ph) {
    ph.set_config({ persistence: 'localStorage+cookie' });
    if (!NO_REPLAY_PAGES.test(location.pathname)) ph.startSessionRecording();
    ph.startExceptionAutocapture && ph.startExceptionAutocapture();
    syncIdentity(ph);
  }

  function showBanner(ph) {
    if (consent() || document.getElementById('us-consent')) return;
    var b = document.createElement('div');
    b.id = 'us-consent';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Analytics cookies');
    b.innerHTML =
      '<p>We use analytics cookies to understand how UniSkilled is used and to fix problems faster. ' +
      'Chats and form fields are never recorded. <a href="legal.html">Privacy Policy</a></p>' +
      '<div><button type="button" data-c="no">Decline</button><button type="button" data-c="yes">Accept</button></div>';
    var st = document.createElement('style');
    st.textContent =
      '#us-consent{position:fixed;z-index:9999;left:16px;right:16px;bottom:16px;max-width:560px;margin:0 auto;background:#0f1f3d;color:#fff;' +
      'border-radius:14px;padding:16px 18px;box-shadow:0 12px 32px rgba(15,31,61,.3);font:500 14px/1.5 "Manrope",system-ui,sans-serif;' +
      'display:flex;gap:14px;align-items:center;flex-wrap:wrap}' +
      '#us-consent p{margin:0;flex:1 1 260px}#us-consent a{color:#8ec5ff}' +
      '#us-consent div{display:flex;gap:8px;margin-left:auto}' +
      '#us-consent button{border:0;border-radius:9px;padding:9px 16px;font:600 14px "Manrope",system-ui,sans-serif;cursor:pointer}' +
      '#us-consent [data-c=no]{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35)}' +
      '#us-consent [data-c=yes]{background:#1a6bff;color:#fff}';
    document.head.appendChild(st);
    b.addEventListener('click', function (e) {
      var c = e.target && e.target.getAttribute('data-c');
      if (!c) return;
      store(CONSENT_KEY, c);
      b.remove();
      if (c === 'yes') enableFullTracking(ph);
      else ph.opt_out_capturing();                       // stop for the rest of this page too
    });
    document.body.appendChild(b);
  }

  var s = document.createElement('script');
  s.src = LIB_URL;
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.onload = function () {
    var accepted = consent() === 'yes';
    var ph = window.posthog;
    ph.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      person_profiles: 'identified_only',               // anonymous visitors don't create billable profiles
      persistence: accepted ? 'localStorage+cookie' : 'memory',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: !NO_REPLAY_PAGES.test(location.pathname),   // no click capture on chats/admin
      capture_exceptions: accepted,
      disable_session_recording: !accepted || NO_REPLAY_PAGES.test(location.pathname),
      session_recording: { maskAllInputs: true },
      loaded: function (inst) {
        if (accepted) syncIdentity(inst);
        queue.splice(0).forEach(function (q) { inst.capture(q[0], q[1], q[2]); });
        if (document.body) showBanner(inst);
        else document.addEventListener('DOMContentLoaded', function () { showBanner(inst); });
      }
    });
  };
  document.head.appendChild(s);
})();
