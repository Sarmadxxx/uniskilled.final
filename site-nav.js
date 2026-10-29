/* UniSkilled — the one shared site header (navy bar, white logo, account menu).
   Usage: put  <header id="site-nav"></header>  as the first thing in <body>,
   then  <script src="site-nav.js"></script>  right after it.
     data-nav="public" (default): About · Find Tutors · Group Sessions · How it Works
     data-nav="app": the signed-in member's own links (student or tutor)
   Signed-in state is read straight from Supabase's stored session, so it works
   whatever each page names its own Supabase client (_sb, _supabase, ...).
   Hiding a link is never a security measure: every page keeps its own sign-in checks. */
(function () {
  var TOKEN_KEY = 'sb-orghkbbohnabcietidiv-auth-token';
  var root = document.getElementById('site-nav');
  if (!root) return;
  var mode = root.getAttribute('data-nav') === 'app' ? 'app' : 'public';

  var NAVY = '#0f2460', SKY = '#28a9e0';
  var css = '' +
    '.snav{position:sticky;top:0;z-index:900;height:64px;padding:0 max(5%,env(safe-area-inset-right,0px)) 0 max(5%,env(safe-area-inset-left,0px));' +
      'display:flex;align-items:center;gap:28px;background:' + NAVY + ';font-family:"Manrope",system-ui,sans-serif;transition:box-shadow .2s;box-sizing:border-box}' +
    '.snav.scrolled{box-shadow:0 6px 24px rgba(8,18,48,.28)}' +
    '.snav *,.snav *::before,.snav *::after{box-sizing:border-box}' +
    '.snav a,.snav button{font-family:inherit;-webkit-tap-highlight-color:transparent}' +
    '.snav :focus-visible{outline:2px solid ' + SKY + ';outline-offset:3px;border-radius:6px}' +
    '.snav-logo{display:flex;align-items:center;text-decoration:none;flex-shrink:0}' +
    '.snav-logo img{height:38px;width:auto;display:block}' +
    '.snav-links{display:flex;gap:28px;align-items:center;flex:1;justify-content:center;min-width:0}' +
    '.snav-links>a{position:relative;font-size:.875rem;font-weight:500;color:rgba(255,255,255,.74);text-decoration:none;padding:8px 0;white-space:nowrap;transition:color .15s}' +
    '.snav-links>a:hover{color:#fff}' +
    '.snav-links>a[aria-current="page"]{color:#fff;font-weight:600}' +
    '.snav-links>a[aria-current="page"]::after{content:"";position:absolute;left:50%;bottom:-4px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:' + SKY + '}' +
    '.snav-end{display:flex;align-items:center;gap:18px;flex-shrink:0;margin-left:auto}' +
    '.snav-text{font-size:.875rem;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap;padding:8px 0}' +
    '.snav-text:hover{color:#dbe6ff}' +
    '.snav-cta{font-size:.85rem;font-weight:800;background:#fff;color:' + NAVY + ';padding:.55rem 1.1rem;border-radius:8px;text-decoration:none;white-space:nowrap;transition:background .15s}' +
    '.snav-cta:hover{background:#e6eeff}' +
    '.snav-acct{position:relative}' +
    '.snav-acct-btn{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:999px;' +
      'padding:3px 10px 3px 3px;color:#fff;font-size:.85rem;font-weight:600;cursor:pointer;max-width:200px;transition:background .15s}' +
    '.snav-acct-btn:hover,.snav-acct-btn[aria-expanded="true"]{background:rgba(255,255,255,.16)}' +
    '.snav-acct-btn .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.snav-acct-btn svg{flex-shrink:0;transition:transform .15s}.snav-acct-btn[aria-expanded="true"] svg{transform:rotate(180deg)}' +
    '.snav-av{width:30px;height:30px;border-radius:50%;background:' + SKY + ';color:' + NAVY + ';font-size:.72rem;font-weight:800;display:grid;place-items:center;flex-shrink:0;letter-spacing:.02em}' +
    '.snav-av.lg{width:38px;height:38px;font-size:.8rem}' +
    '.snav-menu{position:absolute;right:0;top:calc(100% + 10px);width:248px;background:#fff;border-radius:12px;box-shadow:0 16px 40px rgba(8,18,48,.28);padding:6px;z-index:950}' +
    '.snav-menu[hidden]{display:none}' +
    '.snav-who{display:flex;gap:10px;align-items:center;padding:10px 10px 12px;border-bottom:1px solid #eef1f5;margin-bottom:4px;min-width:0}' +
    '.snav-who b{display:block;font-size:.88rem;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.snav-who small{display:block;color:#64748b;font-size:.76rem}' +
    '.snav-mi{display:block;width:100%;text-align:left;padding:9px 10px;border-radius:8px;font-size:.86rem;font-weight:500;color:#334155;text-decoration:none;background:none;border:0;cursor:pointer}' +
    '.snav-mi:hover,.snav-mi:focus-visible{background:#f1f5f9;color:#0f172a;outline:none}' +
    '.snav-mi[aria-current="page"]{color:#1747b8;font-weight:600}' +
    '.snav-sep{height:1px;background:#eef1f5;margin:4px 0}' +
    '.snav-burger .i-close{display:none}.snav-burger[aria-expanded="true"] .i-open{display:none}.snav-burger[aria-expanded="true"] .i-close{display:block}' +
    '.snav-burger{display:none;width:44px;height:44px;align-items:center;justify-content:center;background:none;border:0;color:#fff;cursor:pointer;border-radius:8px;flex-shrink:0}' +
    '.snav-m{display:none}' +
    '@media(max-width:960px){' +
      '.snav{height:58px;gap:10px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(8px,env(safe-area-inset-right,0px))}' +
      '.snav-logo img{height:32px}' +
      '.snav-links,.snav-end .snav-text,.snav-acct-btn .nm,.snav-acct-btn svg,.snav-end .snav-acct .snav-menu{display:none}' +
      '.snav-end{gap:6px}' +
      '.snav-acct-btn{padding:3px;background:none;border-color:transparent;pointer-events:none}' +
      '.snav-cta{padding:.45rem .8rem;font-size:.8rem}' +
      '.snav-burger{display:flex}' +
      '.snav-m.open{display:flex;flex-direction:column;position:absolute;top:58px;left:0;right:0;background:' + NAVY + ';' +
        'padding:4px max(20px,env(safe-area-inset-right,0px)) 18px max(20px,env(safe-area-inset-left,0px));' +
        'box-shadow:0 18px 30px rgba(8,18,48,.3);max-height:calc(100vh - 58px);overflow-y:auto}' +
      '.snav-m a,.snav-m button{font-size:1rem;color:rgba(255,255,255,.88);text-decoration:none;min-height:48px;display:flex;align-items:center;font-weight:600;' +
        'border:0;border-bottom:1px solid rgba(255,255,255,.08);background:none;text-align:left;cursor:pointer;padding:0;width:100%}' +
      '.snav-m a[aria-current="page"]{color:#fff;box-shadow:inset 3px 0 0 ' + SKY + ';padding-left:12px}' +
      '.snav-m .snav-who{border-bottom:0;padding:16px 0 6px;margin:0}' +
      '.snav-m .snav-who b{color:#fff}.snav-m .snav-who small{color:rgba(255,255,255,.6)}' +
      '.snav-m .snav-out{color:rgba(255,255,255,.65);border-bottom:0}' +
      '.snav-m .snav-cta{justify-content:center;margin-top:14px;border:0;min-height:48px;background:#fff;color:' + NAVY + ';font-weight:800}' +
    '}' +
    '@media(prefers-reduced-motion:reduce){.snav,.snav *{transition:none!important}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Session from Supabase's own storage (no network call needed)
  var user = null;
  try {
    var raw = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    var s = raw && (raw.currentSession || raw);
    if (s && s.user && (!s.expires_at || s.expires_at * 1000 > Date.now() - 60000)) user = s.user;
  } catch (e) {}

  // Which page we're on, mapped to the link that should show as current
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var ALIAS = mode === 'public'
    ? { 'tutor-profile.html': 'find-tutors.html' }
    : { 'book-session.html': 'find-tutors.html', 'tutor-dashboard.html': 'DASH', 'student-dashboard.html': 'DASH' };
  var current = ALIAS[here] || here;

  var meta = (user && user.user_metadata) || {};
  var role = meta.role || 'student';
  var isTutor = role === 'tutor';
  var dash = isTutor ? 'tutor-dashboard.html' : 'student-dashboard.html';
  var prof = isTutor ? 'tutor-profile.html' : 'student-profile.html';
  if (current === 'DASH') current = dash;
  var full = String(meta.full_name || '').trim();
  var first = full ? full.split(/\s+/)[0] : 'Account';
  var parts = full.split(/\s+/).filter(Boolean);
  var initials = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
                              : String((user && user.email) || '?')[0].toUpperCase();
  var roleLabel = isTutor ? 'Tutor account' : role === 'business' ? 'Business account' : role === 'university' ? 'University account' : 'Student account';

  function link(href, label) {
    var cur = href.indexOf('#') === -1 && href === current ? ' aria-current="page"' : '';
    return '<a href="' + href + '"' + cur + '>' + label + '</a>';
  }

  var items;
  if (mode === 'app' && user) {
    items = isTutor
      ? [[dash, 'Dashboard'], ['messages.html', 'Messages'], ['calendar.html', 'Calendar'], ['manage-availability.html', 'Availability']]
      : [[dash, 'Dashboard'], ['find-tutors.html', 'Find Tutors'], ['courses.html', 'Courses'], ['messages.html', 'Messages'], ['calendar.html', 'Calendar']];
  } else {
    items = [['about.html', 'About'], ['find-tutors.html', 'Find Tutors'], ['courses.html', 'Courses'], ['group-sessions.html', 'Group Sessions'], ['index.html#how-it-works', 'How it Works']];
  }
  var main = items.map(function (i) { return link(i[0], i[1]); }).join('');

  var CHEV = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var BURGER = '<svg class="i-open" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M4 7h14M4 11h14M4 15h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var CLOSE = '<svg class="i-close" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var who = '<div class="snav-who"><span class="snav-av lg" aria-hidden="true">' + esc(initials) + '</span><div style="min-width:0"><b>' + esc(full || first) + '</b><small>' + roleLabel + '</small></div></div>';

  function mi(href, label) {
    var cur = href === here ? ' aria-current="page"' : '';
    return '<a class="snav-mi" role="menuitem" href="' + href + '"' + cur + '>' + label + '</a>';
  }

  var end, mEnd;
  if (user) {
    var menuItems = mi(prof, 'My profile') + mi(dash, 'Dashboard') + mi('calendar.html', 'Calendar') +
      '<div class="snav-sep" role="separator"></div><button type="button" class="snav-mi snav-out" role="menuitem" data-signout>Sign out</button>';
    end = (mode === 'public' ? '<a href="' + dash + '" class="snav-text">Dashboard</a>' : '') +
      '<div class="snav-acct"><button type="button" class="snav-acct-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="snavAcctMenu" aria-label="Account menu for ' + esc(full || first) + '">' +
        '<span class="snav-av" aria-hidden="true">' + esc(initials) + '</span><span class="nm">' + esc(first) + '</span>' + CHEV + '</button>' +
        '<div class="snav-menu" id="snavAcctMenu" role="menu" aria-label="Account" hidden>' + who + menuItems + '</div></div>';
    var mAcct = (mode === 'public' ? link(dash, 'Dashboard') : '') + who + link(prof, 'My profile') +
      (mode === 'public' ? link('calendar.html', 'Calendar') : '');
    mEnd = mAcct + '<button type="button" class="snav-out" data-signout>Sign out</button>';
    document.body.classList.add('signed-in');
  } else {
    end = '<a href="signin.html" class="snav-text">Sign in</a><a href="onboarding.html" class="snav-cta">Get started</a>';
    mEnd = '<a href="signin.html">Sign in</a><a href="onboarding.html" class="snav-cta">Get started</a>';
  }

  root.className = 'snav';
  root.innerHTML =
    '<a class="snav-logo" href="index.html" aria-label="UniSkilled home"><img src="uniskilled-logo-white-sm.png" alt="UniSkilled" width="153" height="38"></a>' +
    '<div class="snav-links" role="navigation" aria-label="Main">' + main + '</div>' +
    '<div class="snav-end">' + end + '</div>' +
    '<button class="snav-burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="snavMenu">' + BURGER + CLOSE + '</button>' +
    '<div class="snav-m" id="snavMenu" role="navigation" aria-label="Main menu">' + main + mEnd + '</div>';

  // Referral codes ride along to sign-up
  try {
    var ref = sessionStorage.getItem('uniskilled_ref_code');
    if (ref) root.querySelectorAll('a[href^="onboarding.html"]').forEach(function (a) { a.href = 'onboarding.html?ref=' + encodeURIComponent(ref); });
  } catch (e) {}

  // Shadow once scrolled
  function onScroll() { root.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Phone menu
  var burger = root.querySelector('.snav-burger'), sheet = root.querySelector('.snav-m');
  function setSheet(open) {
    sheet.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  burger.addEventListener('click', function () { setSheet(!sheet.classList.contains('open')); });
  sheet.addEventListener('click', function (e) { if (e.target.closest('a')) setSheet(false); });
  if (window.matchMedia) {
    var wide = window.matchMedia('(min-width: 961px)');
    var onWide = function (e) { if (e.matches) setSheet(false); else setMenu(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
  }

  // Account menu (desktop)
  var acctBtn = root.querySelector('.snav-acct-btn'), menu = root.querySelector('.snav-menu');
  function menuItemsList() { return menu ? Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]')) : []; }
  function setMenu(open, focusFirst) {
    if (!acctBtn || !menu) return;
    menu.hidden = !open;
    acctBtn.setAttribute('aria-expanded', open);
    if (open && focusFirst) { var f = menuItemsList()[0]; if (f) f.focus(); }
  }
  if (acctBtn) {
    acctBtn.addEventListener('click', function () { setMenu(menu.hidden, false); });
    acctBtn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMenu(true, true); }
    });
    menu.addEventListener('keydown', function (e) {
      var list = menuItemsList(), i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === 'Tab') { setMenu(false); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (menu && !menu.hidden) { setMenu(false); acctBtn.focus(); }
    if (sheet.classList.contains('open')) { setSheet(false); burger.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (menu && !menu.hidden && !e.target.closest('.snav-acct')) setMenu(false);
    if (sheet.classList.contains('open') && !e.target.closest('#site-nav')) setSheet(false);
  });

  // Sign out: use the page's Supabase client if it has one, otherwise clear the stored session
  root.addEventListener('click', function (e) {
    if (!e.target.closest('[data-signout]')) return;
    function done() { try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem('keepSignedIn'); } catch (x) {} location.href = 'index.html?loggedout=1'; }
    var client = (typeof _sb !== 'undefined' && _sb) || (typeof _supabase !== 'undefined' && _supabase) || null;
    if (client && client.auth) client.auth.signOut().then(done, done); else done();
  });
})();
