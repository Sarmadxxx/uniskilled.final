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
    bookings: { label: 'Bookings', color: '#1a6bff', bg: '#eaf1ff', icon: '<path d="M3 5h18v16H3z"/><path d="M16 3v4M8 3v4M3 10h18"/>' },
    payments: { label: 'Payments', color: '#047857', bg: '#e7f8f0', icon: '<path d="M2 6h20v12H2z"/><path d="M2 10h20M6 15h4"/>' },
    messages: { label: 'Messages', color: '#7c3aed', bg: '#f1ebff', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    reviews: { label: 'Reviews', color: '#b45309', bg: '#fdf3e2', icon: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>' },
    alert: { label: 'Needs attention', color: '#dc2626', bg: '#fdecec', icon: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' },
    other: { label: 'Updates', color: '#475569', bg: '#eef2f6', icon: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' },
  };
  var FILTERS = [['all', 'All'], ['unread', 'Unread'], ['bookings', 'Bookings'], ['payments', 'Payments'], ['messages', 'Messages'], ['alert', 'Attention']];

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
    if (t === 'booking_request' || t === 'request_nudge' || t === 'reschedule_requested') return 'Respond';
    if (t === 'awaiting_payment' || t === 'payment_reminder') return 'Pay now';
    if (t === 'call_started' || t === 'session_reminder') return 'Join';
    if (t === 'rate_reminder') return 'Rate';
    if (t === 'new_message') return 'Reply';
    return '';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────────────
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function svg(paths, size) { return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 7 * 86400) return Math.round(s / 86400) + ' d ago';
    return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function dayGroup(iso) {
    var d = new Date(iso), now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (d.getTime() >= start) return 'Today';
    if (d.getTime() >= start - 86400000) return 'Yesterday';
    if (d.getTime() >= start - 6 * 86400000) return 'This week';
    return 'Earlier';
  }

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
      '<div class="usk-main"><div class="usk-title">' + esc(n.title || 'Notification') + '</div>' +
      (n.body ? '<div class="usk-body">' + esc(n.body) + '</div>' : '') +
      '<div class="usk-meta"><span class="usk-tag" style="background:' + c.bg + ';color:' + c.color + '">' + esc(c.label) + '</span>' +
      '<time datetime="' + esc(n.created_at) + '" title="' + esc(new Date(n.created_at).toLocaleString()) + '">' + esc(ago(n.created_at)) + '</time></div></div>' +
      (act ? '<button type="button" class="usk-act" data-act="open">' + esc(act) + '</button>' : '') +
      (!n.read ? '<button type="button" class="usk-read" data-act="read" title="Mark as read" aria-label="Mark as read">' + svg('<path d="M20 6 9 17l-5-5"/>', 16) + '</button>' : '') +
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
      var msg = filter === 'unread' ? ["You're all caught up", 'No unread notifications.'] : ['Nothing here yet', 'Booking requests, payments and messages will show up here.'];
      return '<div class="usk-empty">' + svg(CAT.other.icon, 32) + '<b>' + esc(msg[0]) + '</b>' + esc(msg[1]) + '</div>';
    }
    var out = '', last = '';
    rows.forEach(function (n) {
      var g = dayGroup(n.created_at);
      if (g !== last) { out += '<div class="usk-group">' + esc(g) + '</div>'; last = g; }
      out += itemHtml(n);
    });
    if (!S.exhausted) out += '<button type="button" class="usk-more" data-act="more">Show older notifications</button>';
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
    b.setAttribute('aria-label', S.unread ? 'Notifications, ' + S.unread + ' unread' : 'Notifications');
    var base = S.baseTitle.replace(/^\(\d+\+?\)\s*/, '');
    document.title = (S.unread ? '(' + (S.unread > 99 ? '99+' : S.unread) + ') ' : '') + base;
  }
  function renderPanel() {
    var p = document.getElementById('uskPanel');
    if (!p) return;
    p.querySelector('.usk-sub').textContent = S.unread ? S.unread + ' unread' : 'All caught up';
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
    if (act === 'more') { btn.disabled = true; btn.textContent = 'Loading…'; loadMore(); return; }
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
    p.setAttribute('aria-label', 'Notifications');
    p.hidden = true;
    p.innerHTML =
      '<div class="usk-head"><div><h2>Notifications</h2><div class="usk-sub"></div></div>' +
      '<div style="display:flex;align-items:center;gap:2px"><button type="button" class="usk-link" data-act="all">Mark all as read</button>' +
      '<button type="button" class="usk-x" data-act="close" aria-label="Close">×</button></div></div>' +
      '<div class="usk-chips" role="toolbar" aria-label="Filter notifications"></div>' +
      '<div class="usk-list"></div>' +
      '<div class="usk-foot"><button type="button" class="usk-link" data-act="desktop" style="display:none">🔔 Turn on desktop alerts</button>' +
      '<a class="usk-link" style="text-decoration:none;margin-left:auto" href="' + (S.role === 'tutor' ? 'tutor-dashboard.html?tab=notifications' : 'student-dashboard.html#notifsCard') + '">See all →</a></div>';
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
    var act = actionLabel(n, S.role) || 'View';
    t.innerHTML = '<div class="usk-ico" style="background:' + c.bg + ';color:' + c.color + '">' + svg(c.icon) + '</div>' +
      '<div class="usk-main"><div class="usk-title">' + esc(n.title || 'New notification') + '</div>' +
      (n.body ? '<div class="usk-body">' + esc(n.body) + '</div>' : '') +
      '<button type="button" class="usk-act" style="margin:8px 0 0">' + esc(act) + '</button></div>' +
      '<button type="button" class="usk-x" aria-label="Dismiss">×</button>';
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
      var d = new Notification(n.title || 'UniSkilled', { body: n.body || '', icon: 'icon-192.png', tag: n.id });
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
      el.innerHTML = '<div class="usk-chips" role="toolbar" aria-label="Filter notifications"></div><div class="usk-list"></div>';
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
