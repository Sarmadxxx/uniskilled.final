/* UniSkilled — notification center (shared by the tutor and student dashboards).
 *
 *   USKNotify.mount({ sb, userId, role: 'tutor'|'student', onSectionCounts(counts) })
 *     • adds a bell to the top bar (visible on phones too) with an unread count
 *     • bell opens a panel: Today / Yesterday / Earlier, filters, action buttons, mark all read
 *     • live: a pop-up card for each new notification, bell rings, "(3)" in the browser tab,
 *       optional desktop alerts when the tab is in the background
 *     • every notification opens the exact section it is about; sections get their own badges
 *   USKNotify.renderFull(el, { limit })   full list (Notifications page / card) with filters
 *   USKNotify.markSectionRead(section)    call when the person opens a section
 *
 * Reads and writes only the signed-in person's own notifications (enforced by the database).
 */
(function () {
  'use strict';
  // Interface text: English is written here; other languages come from locales/<lang>/common.json (notify.*).
  // The notifications themselves (title/body) are stored text and are shown as stored.
  function pick(en, v) { return typeof en === 'object' ? (v && v.count === 1 ? en.one : en.other) : en; }
  function T(k, en, v) { return window.I18N ? I18N.t('notify.' + k, en, v) : pick(en, v).replace(/\{\{(\w+)\}\}/g, function (m, x) { return v && x in v ? v[x] : m; }); }
  var NON_EN = !!(window.I18N && I18N.lang !== 'en');

  // ── Classification ───────────────────────────────────────────────────────────────────────
  // section: where in the dashboard it belongs. cat: colour + filter chip.
  function classify(type) {
    var t = String(type || '');
    var section = 'other', cat = 'other';
    if (t === 'new_message') { section = 'messages'; cat = 'messages'; }
    else if (/^group_/.test(t)) { section = 'groupSessions'; cat = 'bookings'; }
    else if (/review|rate_reminder/.test(t)) { section = 'reviews'; cat = 'reviews'; }
    else if (/^referral/.test(t)) { section = 'referrals'; cat = 'payments'; }
    else if (/subject_request|course_request/.test(t)) { section = 'subjectRequests'; cat = 'bookings'; }
    else if (/^booking_request$|request_nudge|request_expired|reschedule_requested/.test(t)) { section = 'requests'; cat = 'bookings'; }
    else if (/payment|payout|transaction|refund/.test(t)) { section = 'sessions'; cat = 'payments'; }
    else if (/booking|session|call_started|reschedul|dispute|request_accepted/.test(t)) { section = 'sessions'; cat = 'bookings'; }
    var alert = /cancel|expired|declined|dispute|failed|attention|error|suspend|warning/.test(t);
    return { section: section, cat: alert ? 'alert' : cat };
  }

  var CAT = {
    bookings: { label: T('cat.bookings', 'Bookings'), color: '#1a6bff', bg: '#eaf1ff', icon: '<path d="M3 5h18v16H3z"/><path d="M16 3v4M8 3v4M3 10h18"/>' },
    payments: { label: T('cat.payments', 'Payments'), color: '#047857', bg: '#e7f8f0', icon: '<path d="M2 6h20v12H2z"/><path d="M2 10h20M6 15h4"/>' },
    messages: { label: T('cat.messages', 'Messages'), color: '#7c3aed', bg: '#f1ebff', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    reviews: { label: T('cat.reviews', 'Reviews'), color: '#b45309', bg: '#fdf3e2', icon: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>' },
    alert: { label: T('cat.alert', 'Needs attention'), color: '#dc2626', bg: '#fdecec', icon: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' },
    other: { label: T('cat.other', 'Updates'), color: '#475569', bg: '#eef2f6', icon: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' },
  };
  var FILTERS = [['all', T('f.all', 'All')], ['unread', T('f.unread', 'Unread')], ['bookings', T('cat.bookings', 'Bookings')], ['payments', T('cat.payments', 'Payments')], ['messages', T('cat.messages', 'Messages')], ['alert', T('f.alert', 'Attention')]];

  // Where a notification should take the person.
  var TUTOR_TABS = { requests: 'requests', sessions: 'sessions', groupSessions: 'groupSessions', reviews: 'reviews', referrals: 'referrals', subjectRequests: 'subjectRequests' };
  function destination(n, role) {
    var link = String(n.link || '');
    var c = classify(n.type);
    var bare = /^(tutor|student)-dashboard\.html$/.test(link) || link === '';
    if (!bare) return link;                                   // specific page (pay, classroom, rate, profile…)
    if (c.section === 'messages') return 'messages.html';
    if (role === 'tutor') return 'tutor-dashboard.html?tab=' + (TUTOR_TABS[c.section] || 'overview');
    if (c.section === 'groupSessions') return 'group-sessions.html';
    return link || 'student-dashboard.html';
  }
  function actionLabel(n, role) {
    var t = String(n.type || '');
    if (t === 'booking_request' || t === 'request_nudge' || t === 'reschedule_requested') return T('act.respond', 'Respond');
    if (t === 'awaiting_payment' || t === 'payment_reminder') return T('act.pay', 'Pay now');
    if (t === 'call_started' || t === 'session_reminder') return T('act.join', 'Join');
    if (t === 'rate_reminder') return T('act.rate', 'Rate');
    if (t === 'new_message') return T('act.reply', 'Reply');
    return '';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────────────
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function svg(paths, size) { return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 45) return T('ago.now', 'just now');
    if (s < 3600) return T('ago.min', '{{count}} min ago', { count: Math.round(s / 60) });
    if (s < 86400) return T('ago.h', '{{count}} h ago', { count: Math.round(s / 3600) });
    if (s < 7 * 86400) return T('ago.d', '{{count}} d ago', { count: Math.round(s / 86400) });
    return NON_EN ? I18N.date(iso, { day: 'numeric', month: 'short' }) : new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function dayGroup(iso) {
    var d = new Date(iso), now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (d.getTime() >= start) return T('g.today', 'Today');
    if (d.getTime() >= start - 86400000) return T('g.yesterday', 'Yesterday');
    if (d.getTime() >= start - 6 * 86400000) return T('g.week', 'This week');
    return T('g.earlier', 'Earlier');
  }

  // ── Stored notifications in the reader's language ────────────────────────────────────────
  // Notifications are saved in English by whoever creates them (pages, server functions, database).
  // On non-English pages each known wording is recognised and shown in the reader's language,
  // keeping the names, subjects and amounts inside it. Unknown text is shown exactly as stored.
  // English pages never use this: they show the stored text as before.
  var MESSAGES = [
    ["t.referral-credit", "🎁 You earned a €10 referral credit!"],
    ["t.payout-sent", "💸 Payout sent: {{amount}}"],
    ["t.resched-req", "🔄 New time requested"],
    ["t.resched-declined", "New time declined"],
    ["t.rescheduled", "🔄 Session rescheduled"],
    ["t.tutor-answered", "✅ A verified tutor answered your post"],
    ["t.new-comment", "💬 New comment on your post"],
    ["t.uni-verified", "✅ University verified"],
    ["t.referral-joined", "🎉 Someone joined using your link!"],
    ["t.dispute-resolved-mine", "✅ Your dispute has been resolved"],
    ["t.dispute-resolved", "Dispute resolved"],
    ["t.payment-confirmed", "✅ Payment confirmed!"],
    ["t.payment-received", "💰 Payment received!"],
    ["t.issue-reported", "⚠️ An issue has been reported"],
    ["t.report-submitted", "Your report has been submitted"],
    ["t.payment-expired", "⏰ Payment window expired"],
    ["t.slot-reopened", "Slot reopened"],
    ["t.payment-due", "⏳ Payment due soon"],
    ["t.rate", "⭐ How was your lesson?"],
    ["t.gs-cancelled-refunded", "↩️ Group session cancelled — refunded"],
    ["t.gs-cancelled-x", "❌ Group session cancelled"],
    ["t.gs-cancelled", "Group session cancelled"],
    ["t.booking-cancelled-x", "❌ Booking cancelled"],
    ["t.booking-cancelled", "Booking cancelled"],
    ["t.session-cancelled-x", "❌ Session cancelled"],
    ["t.session-cancelled", "Session cancelled"],
    ["t.new-request", "📅 New session request — {{subject}}"],
    ["t.gs-created", "🚀 A group session was just created for you!"],
    ["t.tutor-accepted", "🎉 Your tutor accepted!"],
    ["t.declined", "❌ Session declined"],
    ["t.tutor-found", "🎉 A tutor found you!"],
    ["t.lesson-started", "📹 {{name}} has started the lesson"],
    ["t.in-classroom", "📹 {{name}} is in the classroom"],
    ["t.new-message", "New message from {{name}}"],
    ["t.liked", "❤️ Someone liked your post"],
    ["t.new-review", "⭐ New {{n}}-star review"],
    ["t.cert-request", "Certificate request"],
    ["t.cert-shared", "Certificates shared with you"],
    ["t.cert-declined", "Certificate request declined"],
    ["t.lesson-1h", "⏰ Your lesson starts in 1 hour"],
    ["t.req-released-student", "Request released — no answer from the tutor"],
    ["t.req-released-tutor", "Request released without an answer"],
    ["t.waiting", "⏳ A student is waiting for your answer"],
    ["t.course-match", "🎓 A tutor for {{subject}} just joined"],
    ["b.referral-credit", "The person you referred just completed their first session on UniSkilled. €10 has been added to your account credit."],
    ["b.payout-sent", "Your earnings for {{subject}} have been released. Banks usually take 1–3 business days."],
    ["b.resched-req", "{{name}} asked to move your {{subject}} session to {{date}} at {{time}}. Accept or decline it on your dashboard."],
    ["b.resched-declined", "{{name}} couldn't make {{date}} at {{time}}. Your {{subject}} session stays at its current time."],
    ["b.rescheduled-mine", "Your {{subject}} session is now on {{date}} at {{time}}."],
    ["b.rescheduled", "{{name}} accepted. Your {{subject}} session is now on {{date}} at {{time}}."],
    ["b.feed-reply", "{{name}} replied: \"{{text}}\""],
    ["b.uni-verified", "Your profile now shows the Verified badge for {{uni}}."],
    ["b.referral-joined-student", "A new student signed up using your referral link. You'll earn a credit once they complete their first session."],
    ["b.referral-joined-tutor", "A new tutor signed up using your referral link. You'll earn a credit once they complete their first session."],
    ["b.dispute-released", "We've reviewed the {{subject}} session. The tutor will be paid as normal."],
    ["b.dispute-refunded", "We've reviewed the {{subject}} session. The student has been fully refunded."],
    ["b.dispute-partial", "We've reviewed the {{subject}} session. The student has been refunded {{amount}} {{currency}}."],
    ["b.gs-confirmed", "You're in for the {{subject}} group session with {{name}}. If the group doesn't reach 2 paid students by 12 hours before the session, you'll be automatically refunded."],
    ["b.gs-paid", "{{name}} has joined and paid for your {{subject}} group session."],
    ["b.confirmed-credit", "Your session with {{name}} is all set. A {{amount}} credit was applied."],
    ["b.confirmed-discount", "Your session with {{name}} is all set. A {{amount}} discount was applied."],
    ["b.confirmed", "Your session with {{name}} is all set."],
    ["b.paid", "{{name}} has completed payment for your {{subject}} session."],
    ["b.dispute-against", "A dispute has been opened regarding your {{subject}} session. Our team will review it before any payout."],
    ["b.dispute-opener", "We've received your report about the {{subject}} session. We'll review it and follow up."],
    ["b.spot-expired", "Your window to pay for the {{subject}} session spot has passed."],
    ["b.expired-student", "Your window to pay for the {{subject}} session with {{name}} has passed."],
    ["b.expired-tutor", "{{name}} did not complete payment in time for the {{subject}} session."],
    ["b.due-soon", "Your {{subject}} session with {{name}} isn't confirmed yet. Complete payment before the deadline to keep it."],
    ["b.rate", "Rate your {{subject}} lesson with {{name}}. It takes 20 seconds."],
    ["b.gs-min-refunded", "The {{subject}} group session didn't reach the minimum of 2 students, so it's been cancelled. Your payment has been refunded."],
    ["b.gs-min-manual", "The {{subject}} group session didn't reach the minimum of 2 students, so it's been cancelled. Our team will process your refund manually."],
    ["b.gs-min-tutor", "Your {{subject}} group session didn't reach 2 paid students in time, so it's been automatically cancelled."],
    ["b.unpaid-cancel-mine", "You cancelled the {{subject}} booking. Nothing was charged."],
    ["b.unpaid-cancel", "{{name}} cancelled the {{subject}} booking before it was paid. Nothing was charged."],
    ["b.cancel-mine-refund", "You cancelled the {{subject}} session. A full refund has been issued."],
    ["b.cancel-mine-norefund", "You cancelled the {{subject}} session. No refund applies for this cancellation."],
    ["b.cancel-refund", "{{name}} cancelled the {{subject}} session. A full refund has been issued."],
    ["b.cancel-norefund", "{{name}} cancelled the {{subject}} session. No refund applies for this cancellation."],
    ["b.new-request", "{{name}} would like to book a {{subject}} session for {{price}}. No payment has been taken yet."],
    ["b.gs-created", "{{name}} created a {{subject}} group session on {{date}} at {{time}} — the exact thing you requested. Join now before spots fill up."],
    ["b.accepted-hours", "{{name}} accepted your {{subject}} request. Complete payment within {{count}} hours to lock it in."],
    ["b.accepted-minutes", "{{name}} accepted your {{subject}} request. Complete payment within {{count}} minutes to lock it in."],
    ["b.declined", "Your {{subject}} session request was declined."],
    ["b.tutor-found", "{{name}} can help with {{subject}}. Check your messages to get started."],
    ["b.lesson-ready-tutor", "Your {{subject}} lesson is ready. Click to join the classroom."],
    ["b.lesson-ready", "Your {{subject}} lesson is ready. Click to join."],
    ["b.liked", "{{name}} found your post helpful."],
    ["b.new-review", "{{name}} rated your {{subject}} lesson."],
    ["b.cert-request", "{{name}} asked to see your certificates."],
    ["b.cert-shared", "{{name}} shared their certificates with you."],
    ["b.cert-declined", "{{name}} declined your request to see their certificates."],
    ["b.lesson-soon", "Your {{subject}} lesson starts soon. The lesson room opens 10 minutes before."],
    ["b.released-student", "Your {{subject}} request got no answer in time, so we released it. You have not been charged. Book another tutor anytime."],
    ["b.released-tutor", "A {{subject}} request was not answered in time and was released."],
    ["b.nudge", "Please accept or decline the {{subject}} request by {{deadline}}, or it is released automatically."],
    ["b.course-match", "You asked for help with {{subject}}. A tutor who teaches it is now available."]
  ];
  var COMPILED = null;
  function rxEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function compileMessages() {
    COMPILED = MESSAGES.map(function (m) {
      var names = [];
      var src = '^' + m[1].split(/(\{\{\w+\}\})/).map(function (part) {
        var v = part.match(/^\{\{(\w+)\}\}$/);
        if (v) { names.push(v[1]); return '([\\s\\S]+?)'; }
        return rxEsc(part);
      }).join('') + '$';
      return { key: m[0], en: m[1], re: new RegExp(src), names: names };
    });
  }
  var FALLBACK_WORDS = { 'A student': 'vf.a-student', 'Someone': 'vf.someone', 'The tutor': 'vf.the-tutor', 'Your student': 'vf.your-student', 'your session': 'vf.your-session', 'group': 'vf.group' };
  var DATE_WORDS = null;
  function dateWords() {
    if (DATE_WORDS) return DATE_WORDS;
    DATE_WORDS = {};
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    try {
      months.forEach(function (m, i) { DATE_WORDS[m] = I18N.date(new Date(2026, i, 15), { month: 'long' }); });
      days.forEach(function (d, i) { DATE_WORDS[d] = I18N.date(new Date(2026, 10, 16 + i), { weekday: 'long' }); });   // 16 Nov 2026 is a Monday
    } catch (e) { /* keep English words */ }
    return DATE_WORDS;
  }
  function localizeValue(name, v) {
    if (FALLBACK_WORDS[v]) return T(FALLBACK_WORDS[v], v);
    if (name === 'date' || name === 'time' || name === 'deadline') {
      var w = dateWords();
      v = v.replace(/\(([^()]+) time\)/, function (m, city) { return '(' + T('tz', '{{zone}} time', { zone: city }) + ')'; })
        .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, function (x) { return w[x] || x; })
        .replace(/\bat\b/, T('at', 'at'))
        .replace(/, /g, T('comma', ', '));
    }
    return v;
  }
  function tr(text) {
    if (!NON_EN || !text) return text;
    if (!COMPILED) compileMessages();
    for (var i = 0; i < COMPILED.length; i++) {
      var c = COMPILED[i], m = c.re.exec(text);
      if (!m) continue;
      var vars = {};
      c.names.forEach(function (n, j) { vars[n] = localizeValue(n, m[j + 1]); });
      return T('msg.' + c.key, c.en, vars);
    }
    return text;
  }
  window.USKNotifyText = tr;   // for tests

  // ── State ────────────────────────────────────────────────────────────────────────────────
  var S = { sb: null, userId: null, role: 'student', items: [], unread: 0, filter: 'all', open: false, onSectionCounts: null, baseTitle: document.title, fulls: [], pageSize: 30, exhausted: false };

  function injectStyles() {
    if (document.getElementById('usk-notify-css')) return;
    var st = document.createElement('style');
    st.id = 'usk-notify-css';
    st.textContent = [
      '.usk-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;cursor:pointer;margin-right:.35rem;transition:background .15s,border-color .15s}',
      '.usk-bell:hover{background:#f1f5ff;border-color:#c7d7fe}',
      '.usk-bell[aria-expanded="true"]{background:#eaf1ff;border-color:#1a6bff;color:#1a6bff}',
      '.usk-bell .usk-count{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ef4444;color:#fff;font:800 11px/20px Manrope,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff}',
      '.usk-bell.ring svg{animation:uskRing .9s ease-in-out}',
      '@keyframes uskRing{0%,100%{transform:rotate(0)}15%{transform:rotate(16deg)}30%{transform:rotate(-14deg)}45%{transform:rotate(10deg)}60%{transform:rotate(-6deg)}75%{transform:rotate(3deg)}}',
      '.usk-panel{position:fixed;z-index:1000;top:70px;right:max(16px,calc(5% - 8px));width:min(420px,calc(100vw - 32px));max-height:min(640px,calc(100vh - 90px));display:flex;flex-direction:column;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.18);font-family:Manrope,system-ui,sans-serif;overflow:hidden;animation:uskPop .16s ease-out}',
      '.usk-panel[hidden],.usk-sec-dot[hidden]{display:none!important}',
      '@keyframes uskPop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}',
      '.usk-head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;gap:8px}',
      '.usk-head h2{margin:0;font-size:1.05rem;font-weight:800;color:#0f172a}',
      '.usk-head .usk-sub{font-size:.75rem;color:#5b6474;font-weight:600}',
      '.usk-link{background:none;border:0;color:#1a6bff;font:700 .78rem Manrope,system-ui,sans-serif;cursor:pointer;padding:6px 8px;border-radius:8px}',
      '.usk-link:hover{background:#eef4ff}.usk-link:disabled{color:#94a3b8;cursor:default;background:none}',
      '.usk-x{background:none;border:0;font-size:22px;line-height:1;color:#64748b;cursor:pointer;padding:4px 8px;border-radius:8px;display:none}',
      '.usk-chips{flex:none;display:flex;gap:6px;padding:0 16px 10px;overflow-x:auto;scrollbar-width:none}',
      '.usk-chips::-webkit-scrollbar{display:none}',
      '.usk-chip{flex:none;border:1px solid #e2e8f0;background:#fff;color:#334155;font:700 .74rem Manrope,system-ui,sans-serif;padding:6px 11px;border-radius:999px;cursor:pointer}',
      '.usk-chip[aria-pressed="true"]{background:#0f172a;border-color:#0f172a;color:#fff}',
      '.usk-chip .n{opacity:.7;margin-left:4px}',
      '.usk-list{overflow-y:auto;border-top:1px solid #eef2f6;flex:1}',
      '.usk-group{position:sticky;top:0;background:rgba(248,250,252,.96);backdrop-filter:blur(4px);font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;padding:8px 16px;border-bottom:1px solid #eef2f6}',
      '.usk-item{position:relative;display:flex;gap:12px;align-items:flex-start;padding:12px 16px 12px 18px;border-bottom:1px solid #f1f5f9;cursor:pointer;text-decoration:none;color:inherit;transition:background .12s}',
      '.usk-item:hover,.usk-item:focus-visible{background:#f8fafc;outline:none}',
      '.usk-item.unread{background:#f6f9ff}',
      '.usk-item.unread::before{content:"";position:absolute;left:6px;top:24px;width:7px;height:7px;border-radius:50%;background:#1a6bff}',
      '.usk-ico{flex:none;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center}',
      '.usk-main{flex:1;min-width:0}',
      '.usk-title{font-size:.86rem;font-weight:600;color:#0f172a;line-height:1.35}',
      '.usk-item.unread .usk-title{font-weight:800}',
      '.usk-body{font-size:.78rem;color:#5b6474;line-height:1.45;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.usk-meta{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:.7rem;color:#64748b;font-weight:600}',
      '.usk-tag{padding:2px 7px;border-radius:6px;font-weight:700}',
      '.usk-act{margin-left:auto;flex:none;align-self:center;border:0;background:#1a6bff;color:#fff;font:700 .74rem Manrope,system-ui,sans-serif;padding:7px 12px;border-radius:9px;cursor:pointer}',
      '.usk-act:hover{background:#0f5ae6}',
      '.usk-read{flex:none;align-self:center;width:28px;height:28px;border-radius:8px;border:0;background:none;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.usk-read:hover{background:#e2e8f0;color:#0f172a}',
      '.usk-empty{padding:48px 24px;text-align:center;color:#64748b;font-size:.85rem}',
      '.usk-empty b{display:block;color:#0f172a;font-size:.95rem;margin:10px 0 4px}',
      '.usk-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid #eef2f6;background:#fbfcfe}',
      '.usk-more{display:block;width:100%;border:0;border-top:1px solid #eef2f6;background:#fff;color:#1a6bff;font:700 .8rem Manrope,system-ui,sans-serif;padding:12px;cursor:pointer}',
      '.usk-toasts{position:fixed;z-index:10001;top:76px;right:16px;display:flex;flex-direction:column;gap:10px;width:min(380px,calc(100vw - 32px));pointer-events:none}',
      '.usk-toast{pointer-events:auto;display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 12px 12px 14px;box-shadow:0 16px 40px rgba(15,23,42,.16);font-family:Manrope,system-ui,sans-serif;animation:uskSlide .25s ease-out;cursor:pointer}',
      '@keyframes uskSlide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}',
      '.usk-toast .usk-x{display:block;font-size:20px;padding:0 4px}',
      '.usk-full .usk-list{border:0}.usk-full .usk-chips{padding:0 0 12px}.usk-full .usk-item{padding-left:20px}',
      '.usk-full .usk-item.unread::before{left:7px}',
      '.usk-sec-dot{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#1a6bff;color:#fff;font:800 10.5px/18px Manrope,system-ui,sans-serif;text-align:center}',
      '@media (max-width:720px){',
      ' .usk-panel{inset:0;top:0;right:0;width:100%;max-height:none;height:100%;border-radius:0;border:0}',
      ' .usk-x{display:block}',
      ' .usk-toasts{top:auto;bottom:16px;right:50%;transform:translateX(50%)}',
      ' .usk-bell{width:40px;height:40px;margin-right:.25rem}',
      '}',
      '@media (prefers-reduced-motion:reduce){.usk-panel,.usk-toast,.usk-bell.ring svg{animation:none}}',
    ].join('\n');
    document.head.appendChild(st);
  }

  // ── Data ─────────────────────────────────────────────────────────────────────────────────
  async function fetchPage(from) {
    var r = await S.sb.from('notifications').select('id,type,title,body,link,read,created_at')
      .eq('user_id', S.userId).order('created_at', { ascending: false }).range(from, from + S.pageSize - 1);
    return r.data || [];
  }
  async function fetchUnreadCount() {
    var r = await S.sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', S.userId).eq('read', false);
    return r.error ? 0 : (r.count || 0);
  }
  async function refresh() {
    var res = await Promise.all([fetchPage(0), fetchUnreadCount()]);
    S.items = res[0];
    S.exhausted = res[0].length < S.pageSize;
    // count comes from the server; if it's unavailable, never show fewer than the visible unread
    S.unread = Math.max(res[1], res[0].filter(function (n) { return !n.read; }).length);
    renderAll();
    await pushSectionCounts();
  }
  async function loadMore() {
    var more = await fetchPage(S.items.length);
    S.exhausted = more.length < S.pageSize;
    S.items = S.items.concat(more);
    renderAll();
  }
  async function pushSectionCounts() {
    if (!S.onSectionCounts) return;
    // Counted over all unread (not only the loaded page).
    var r = await S.sb.from('notifications').select('type').eq('user_id', S.userId).eq('read', false).limit(500);
    var counts = {};
    (r.data || []).forEach(function (n) { var s = classify(n.type).section; counts[s] = (counts[s] || 0) + 1; });
    try { S.onSectionCounts(counts); } catch (e) { /* page-specific, never break the bell */ }
  }
  async function markRead(ids) {
    if (!ids.length) return;
    S.items.forEach(function (n) { if (ids.indexOf(n.id) !== -1 && !n.read) { n.read = true; S.unread = Math.max(0, S.unread - 1); } });
    renderAll();
    await S.sb.from('notifications').update({ read: true }).in('id', ids).eq('user_id', S.userId);
    pushSectionCounts();
  }
  async function markAllRead() {
    S.items.forEach(function (n) { n.read = true; });
    S.unread = 0;
    renderAll();
    await S.sb.from('notifications').update({ read: true }).eq('user_id', S.userId).eq('read', false);
    pushSectionCounts();
  }
  async function markSectionRead(section) {
    var r = await S.sb.from('notifications').select('id,type').eq('user_id', S.userId).eq('read', false).limit(500);
    var ids = (r.data || []).filter(function (n) { return classify(n.type).section === section; }).map(function (n) { return n.id; });
    if (!ids.length) return;
    await S.sb.from('notifications').update({ read: true }).in('id', ids).eq('user_id', S.userId);
    await refresh();
  }

  // ── Rendering ────────────────────────────────────────────────────────────────────────────
  function itemHtml(n) {
    var c = CAT[classify(n.type).cat];
    var act = actionLabel(n, S.role);
    return '<div class="usk-item' + (n.read ? '' : ' unread') + '" role="link" tabindex="0" data-id="' + esc(n.id) + '">' +
      '<div class="usk-ico" style="background:' + c.bg + ';color:' + c.color + '">' + svg(c.icon) + '</div>' +
      '<div class="usk-main"><div class="usk-title">' + esc(tr(n.title) || T('notification', 'Notification')) + '</div>' +
      (n.body ? '<div class="usk-body">' + esc(tr(n.body)) + '</div>' : '') +
      '<div class="usk-meta"><span class="usk-tag" style="background:' + c.bg + ';color:' + c.color + '">' + esc(c.label) + '</span>' +
      '<time datetime="' + esc(n.created_at) + '" title="' + esc(NON_EN ? I18N.dateTime(n.created_at) : new Date(n.created_at).toLocaleString()) + '">' + esc(ago(n.created_at)) + '</time></div></div>' +
      (act ? '<button type="button" class="usk-act" data-act="open">' + esc(act) + '</button>' : '') +
      (!n.read ? '<button type="button" class="usk-read" data-act="read" title="' + esc(T('mark-read', 'Mark as read')) + '" aria-label="' + esc(T('mark-read', 'Mark as read')) + '">' + svg('<path d="M20 6 9 17l-5-5"/>', 16) + '</button>' : '') +
      '</div>';
  }
  function filtered(filter) {
    return S.items.filter(function (n) {
      if (filter === 'all') return true;
      if (filter === 'unread') return !n.read;
      return classify(n.type).cat === filter;
    });
  }
  function listHtml(filter) {
    var rows = filtered(filter);
    if (!rows.length) {
      var msg = filter === 'unread' ? [T('empty.caught-up', "You're all caught up"), T('empty.no-unread', 'No unread notifications.')] : [T('empty.nothing', 'Nothing here yet'), T('empty.will-show', 'Booking requests, payments and messages will show up here.')];
      return '<div class="usk-empty">' + svg(CAT.other.icon, 32) + '<b>' + esc(msg[0]) + '</b>' + esc(msg[1]) + '</div>';
    }
    var out = '', last = '';
    rows.forEach(function (n) {
      var g = dayGroup(n.created_at);
      if (g !== last) { out += '<div class="usk-group">' + esc(g) + '</div>'; last = g; }
      out += itemHtml(n);
    });
    if (!S.exhausted) out += '<button type="button" class="usk-more" data-act="more">' + esc(T('older', 'Show older notifications')) + '</button>';
    return out;
  }
  function chipsHtml(filter) {
    return FILTERS.map(function (f) {
      var n = f[0] === 'unread' ? S.unread : 0;
      return '<button type="button" class="usk-chip" data-filter="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + esc(f[1]) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
    }).join('');
  }

  function renderBell() {
    var b = document.getElementById('uskBell');
    if (!b) return;
    var c = b.querySelector('.usk-count');
    if (S.unread > 0) {
      if (!c) { c = document.createElement('span'); c.className = 'usk-count'; b.appendChild(c); }
      c.textContent = S.unread > 99 ? '99+' : String(S.unread);
    } else if (c) c.remove();
    b.setAttribute('aria-label', S.unread ? T('bell-unread', 'Notifications, {{count}} unread', { count: S.unread }) : T('title', 'Notifications'));
    var base = S.baseTitle.replace(/^\(\d+\+?\)\s*/, '');
    document.title = (S.unread ? '(' + (S.unread > 99 ? '99+' : S.unread) + ') ' : '') + base;
  }
  function renderPanel() {
    var p = document.getElementById('uskPanel');
    if (!p) return;
    p.querySelector('.usk-sub').textContent = S.unread ? T('unread', '{{count}} unread', { count: S.unread }) : T('all-caught-up', 'All caught up');
    p.querySelector('[data-act="all"]').disabled = !S.unread;
    p.querySelector('.usk-chips').innerHTML = chipsHtml(S.filter);
    p.querySelector('.usk-list').innerHTML = listHtml(S.filter);
    var dt = p.querySelector('[data-act="desktop"]');
    if (dt) dt.style.display = ('Notification' in window && Notification.permission === 'default') ? '' : 'none';
  }
  function renderFulls() {
    S.fulls.forEach(function (f) {
      f.el.querySelector('.usk-chips').innerHTML = chipsHtml(f.filter);
      var list = f.el.querySelector('.usk-list');
      list.innerHTML = listHtml(f.filter);
      var mark = f.el.querySelector('[data-act="all"]');
      if (mark) mark.disabled = !S.unread;
    });
  }
  function renderAll() { renderBell(); renderPanel(); renderFulls(); }

  // ── Interaction (one delegated handler for panel, full lists and toasts) ────────────────
  function findItem(id) { for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i]; return null; }
  async function openItem(n) {
    if (!n.read) await markRead([n.id]);
    var to = destination(n, S.role);
    if (to) window.location.href = to;
  }
  async function onClick(e, scope) {
    var chip = e.target.closest('[data-filter]');
    if (chip) { scope.filter = chip.getAttribute('data-filter'); if (scope === S) renderPanel(); else renderFulls(); return; }
    var btn = e.target.closest('[data-act]');
    var act = btn && btn.getAttribute('data-act');
    if (act === 'all') { markAllRead(); return; }
    if (act === 'more') { btn.disabled = true; btn.textContent = T('loading', 'Loading…'); loadMore(); return; }
    if (act === 'close') { closePanel(); return; }
    if (act === 'desktop') { askDesktop(); return; }
    var row = e.target.closest('.usk-item');
    if (!row) return;
    var n = findItem(row.getAttribute('data-id'));
    if (!n) return;
    if (act === 'read') { e.stopPropagation(); markRead([n.id]); return; }
    openItem(n);
  }
  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('usk-item')) { e.preventDefault(); e.target.click(); }
  }

  function buildPanel() {
    var p = document.createElement('div');
    p.id = 'uskPanel';
    p.className = 'usk-panel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', T('title', 'Notifications'));
    p.hidden = true;
    p.innerHTML =
      '<div class="usk-head"><div><h2>' + esc(T('title', 'Notifications')) + '</h2><div class="usk-sub"></div></div>' +
      '<div style="display:flex;align-items:center;gap:2px"><button type="button" class="usk-link" data-act="all">' + esc(T('mark-all', 'Mark all as read')) + '</button>' +
      '<button type="button" class="usk-x" data-act="close" aria-label="' + esc(T('close', 'Close')) + '">×</button></div></div>' +
      '<div class="usk-chips" role="toolbar" aria-label="' + esc(T('filter', 'Filter notifications')) + '"></div>' +
      '<div class="usk-list"></div>' +
      '<div class="usk-foot"><button type="button" class="usk-link" data-act="desktop" style="display:none">🔔 ' + esc(T('desktop', 'Turn on desktop alerts')) + '</button>' +
      '<a class="usk-link" style="text-decoration:none;margin-left:auto" href="' + (S.role === 'tutor' ? 'tutor-dashboard.html?tab=notifications' : 'student-dashboard.html#notifsCard') + '">' + esc(T('see-all', 'See all →')) + '</a></div>';
    p.addEventListener('click', function (e) { onClick(e, S); });
    p.addEventListener('keydown', onKey);
    document.body.appendChild(p);
  }
  function openPanel() {
    var p = document.getElementById('uskPanel');
    S.open = true; p.hidden = false;
    document.getElementById('uskBell').setAttribute('aria-expanded', 'true');
    renderPanel();
    var first = p.querySelector('.usk-item,.usk-chip');
    if (first) first.focus({ preventScroll: true });
    if (window.matchMedia('(max-width:720px)').matches) document.body.style.overflow = 'hidden';
  }
  function closePanel() {
    var p = document.getElementById('uskPanel');
    if (!p || p.hidden) return;
    S.open = false; p.hidden = true;
    document.body.style.overflow = '';
    var b = document.getElementById('uskBell');
    b.setAttribute('aria-expanded', 'false');
    b.focus({ preventScroll: true });
  }

  function mountBell() {
    var nav = document.querySelector('body > nav');
    if (!nav || document.getElementById('uskBell')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'uskBell';
    b.className = 'usk-bell';
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'uskPanel');
    b.innerHTML = svg(CAT.other.icon, 20);
    b.addEventListener('click', function (e) { e.stopPropagation(); S.open ? closePanel() : openPanel(); });
    // Right side of the bar: before the menu button (phones) / at the end of the links (desktop).
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:.25rem;margin-left:auto';
    var burger = nav.querySelector('.nav-burger');
    var links = nav.querySelector('.nav-links');
    nav.insertBefore(wrap, links || burger || null);
    wrap.appendChild(b);
    if (links) wrap.appendChild(links);
    if (burger) wrap.appendChild(burger);
    document.addEventListener('click', function (e) {
      if (S.open && !e.target.closest('#uskPanel,#uskBell')) closePanel();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
  }

  // ── Live alerts ──────────────────────────────────────────────────────────────────────────
  function toast(n) {
    var host = document.querySelector('.usk-toasts');
    if (!host) { host = document.createElement('div'); host.className = 'usk-toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var c = CAT[classify(n.type).cat];
    var t = document.createElement('div');
    t.className = 'usk-toast';
    t.setAttribute('role', 'status');
    var act = actionLabel(n, S.role) || T('act.view', 'View');
    t.innerHTML = '<div class="usk-ico" style="background:' + c.bg + ';color:' + c.color + '">' + svg(c.icon) + '</div>' +
      '<div class="usk-main"><div class="usk-title">' + esc(tr(n.title) || T('new', 'New notification')) + '</div>' +
      (n.body ? '<div class="usk-body">' + esc(tr(n.body)) + '</div>' : '') +
      '<button type="button" class="usk-act" style="margin:8px 0 0">' + esc(act) + '</button></div>' +
      '<button type="button" class="usk-x" aria-label="' + esc(T('dismiss', 'Dismiss')) + '">×</button>';
    t.addEventListener('click', function (e) {
      if (e.target.closest('.usk-x')) { t.remove(); return; }
      openItem(n);
    });
    host.prepend(t);
    while (host.children.length > 3) host.lastChild.remove();
    setTimeout(function () { t.remove(); }, 8000);
  }
  function ring() {
    var b = document.getElementById('uskBell');
    if (!b) return;
    b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
  }
  function desktopAlert(n) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    try {
      var d = new Notification(tr(n.title) || 'UniSkilled', { body: tr(n.body) || '', icon: 'icon-192.png', tag: n.id });
      d.onclick = function () { window.focus(); openItem(n); d.close(); };
    } catch (e) { /* some browsers only allow this from a service worker */ }
  }
  function askDesktop() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function () { renderPanel(); });
  }
  function subscribe() {
    S.sb.channel('usk-notify-' + S.userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + S.userId }, function (payload) {
        var n = payload.new;
        if (!n || findItem(n.id)) return;
        S.items.unshift(n);
        if (!n.read) S.unread++;
        renderAll();
        pushSectionCounts();
        ring();
        toast(n);
        desktopAlert(n);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + S.userId }, function () {
        // Read in another tab or device: resync quietly.
        clearTimeout(S._sync); S._sync = setTimeout(refresh, 400);
      })
      .subscribe();
  }

  // ── Public API ───────────────────────────────────────────────────────────────────────────
  window.USKNotify = {
    classify: classify,
    destination: destination,
    mount: async function (opts) {
      S.sb = opts.sb; S.userId = opts.userId; S.role = opts.role || 'student';
      S.onSectionCounts = opts.onSectionCounts || null;
      S.baseTitle = document.title;
      injectStyles();
      buildPanel();
      mountBell();
      await refresh();
      subscribe();
    },
    renderFull: function (el, opts) {
      if (!el) return;
      injectStyles();
      el.classList.add('usk-full');
      el.innerHTML = '<div class="usk-chips" role="toolbar" aria-label="' + esc(T('filter', 'Filter notifications')) + '"></div><div class="usk-list"></div>';
      var scope = { el: el, filter: (opts && opts.filter) || 'all' };
      el.addEventListener('click', function (e) { onClick(e, scope); });
      el.addEventListener('keydown', onKey);
      S.fulls.push(scope);
      renderFulls();
    },
    markSectionRead: markSectionRead,
    markAllRead: markAllRead,
    refresh: refresh,
    // keeps the browser-tab count correct when a page changes its own title later
    setBaseTitle: function (t) { S.baseTitle = t; renderBell(); },
  };
})();
