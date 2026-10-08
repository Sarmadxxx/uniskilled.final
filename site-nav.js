/* UniSkilled — shared public navbar (same look & behaviour as the homepage nav).
   Usage: put  <header id="site-nav"></header>  as the first thing in <body>,
   then  <script src="site-nav.js"></script>  right after it.
   Signed-in state is read straight from Supabase's stored session, so it works
   whatever each page names its own Supabase client (_sb, _supabase, ...). */
(function () {
  var TOKEN_KEY = 'sb-orghkbbohnabcietidiv-auth-token';
  var root = document.getElementById('site-nav');
  if (!root) return;

  var css = '' +
    '.snav{position:sticky;top:0;z-index:900;height:64px;padding:0 6%;display:flex;align-items:center;justify-content:space-between;' +
      'background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-bottom:1px solid #e5e7eb;' +
      'font-family:"Manrope",system-ui,sans-serif;transition:box-shadow .2s}' +
    '.snav.scrolled{box-shadow:0 4px 20px rgba(17,24,39,.06)}' +
    '.snav *{box-sizing:border-box}' +
    '.snav-logo{display:flex;align-items:center;text-decoration:none;flex-shrink:0}' +
    '.snav-logo img{height:44px;width:auto;display:block}' +
    '.snav-links{display:flex;gap:2rem;align-items:center}' +
    '.snav-links>a{font-size:.85rem;color:#6b7280;text-decoration:none;font-weight:500;transition:color .18s;padding:6px 0}' +
    '.snav-links>a:hover,.snav-links>a[aria-current="page"]{color:#111827}' +
    '.snav-links>a[aria-current="page"]{font-weight:700}' +
    '.snav-end{display:flex;align-items:center;gap:1rem;flex-shrink:0}' +
    '.snav-text{font-size:.85rem;font-weight:600;color:#374151;text-decoration:none;white-space:nowrap;background:none;border:0;cursor:pointer;font-family:inherit;padding:6px 0}' +
    '.snav-text:hover{color:#111827}' +
    '.snav-cta{font-size:.88rem;font-weight:800;background:#f7e049;color:#0f172a;padding:.55rem 1.4rem;border-radius:8px;text-decoration:none;white-space:nowrap;letter-spacing:-.01em;transition:background .18s,box-shadow .18s}' +
    '.snav-cta:hover{background:#f0d800;box-shadow:0 4px 14px rgba(247,224,73,.4)}' +
    '.snav-out{color:#999;font-size:.8rem}' +
    '.snav-burger{display:none;width:44px;height:44px;align-items:center;justify-content:center;background:none;border:0;font-size:1.4rem;color:#111827;cursor:pointer;border-radius:8px}' +
    '.snav-m{display:none}' +
    '@media(max-width:960px){' +
      '.snav{padding:0 5%}' +
      '.snav-links,.snav-end{display:none}' +
      '.snav-burger{display:flex}' +
      '.snav-m.open{display:flex;flex-direction:column;position:absolute;top:64px;left:0;right:0;background:#fff;padding:.5rem 6% 1.25rem;' +
        'box-shadow:0 12px 24px rgba(17,24,39,.08);border-bottom:1px solid #e5e7eb;max-height:calc(100vh - 64px);overflow-y:auto}' +
      '.snav-m a,.snav-m button{font-size:1rem;color:#111827;text-decoration:none;min-height:48px;display:flex;align-items:center;font-weight:600;' +
        'border:0;border-bottom:1px solid #f1f3f6;background:none;font-family:inherit;text-align:left;cursor:pointer;padding:0}' +
      '.snav-m a[aria-current="page"]{color:#1a6bff}' +
      '.snav-m .snav-cta{justify-content:center;margin-top:1rem;border:0;min-height:48px;background:#f7e049;color:#0f172a;font-weight:800}' +
      '.snav-m .snav-out{color:#6b7280;font-size:.95rem}' +
    '}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Which page are we on (for aria-current)
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (here === 'tutor-profile.html') here = 'find-tutors.html';
  function link(href, label) {
    var cur = href.split('#')[0] === here && href.indexOf('#') === -1 ? ' aria-current="page"' : '';
    return '<a href="' + href + '"' + cur + '>' + label + '</a>';
  }
  var main =
    link('about.html', 'About') +
    link('find-tutors.html', 'Find Tutors') +
    link('group-sessions.html', 'Group Sessions') +
    link('index.html#how-it-works', 'How it Works');

  // Session from Supabase's own storage (no network call needed)
  var user = null;
  try {
    var raw = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    var s = raw && (raw.currentSession || raw);
    if (s && s.user && (!s.expires_at || s.expires_at * 1000 > Date.now() - 60000)) user = s.user;
  } catch (e) {}

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var end, mEnd;
  if (user) {
    var meta = user.user_metadata || {};
    var role = meta.role || 'student';
    var first = (meta.full_name || 'Profile').split(' ')[0];
    var dash = role === 'tutor' ? 'tutor-dashboard.html' : 'student-dashboard.html';
    var prof = role === 'tutor' ? 'tutor-profile.html' : 'student-profile.html';
    end = '<a href="' + dash + '" class="snav-text">Dashboard</a>' +
          '<a href="messages.html" class="snav-text">Messages</a>' +
          '<a href="' + prof + '" class="snav-cta">' + esc(first) + '</a>' +
          '<button type="button" class="snav-text snav-out" data-signout>Sign out</button>';
    mEnd = '<a href="' + dash + '">Dashboard</a><a href="messages.html">Messages</a><a href="' + prof + '">My profile</a>' +
           '<button type="button" class="snav-out" data-signout>Sign out</button>';
    document.body.classList.add('signed-in');
  } else {
    end = '<a href="signin.html" class="snav-text">Sign in</a><a href="onboarding.html" class="snav-cta">Get started →</a>';
    mEnd = '<a href="signin.html">Sign in</a><a href="onboarding.html" class="snav-cta">Get started →</a>';
  }

  root.className = 'snav';
  root.innerHTML =
    '<a class="snav-logo" href="index.html" aria-label="UniSkilled home"><img src="uniskilled-logo-sm.png" alt="UniSkilled" width="127" height="44"></a>' +
    '<div class="snav-links" role="navigation" aria-label="Main">' + main + '</div>' +
    '<div class="snav-end">' + end + '</div>' +
    '<button class="snav-burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="snavMenu">☰</button>' +
    '<div class="snav-m" id="snavMenu" role="navigation" aria-label="Main menu">' + main + mEnd + '</div>';

  // Referral codes ride along to sign-up, same as the homepage
  try {
    var ref = sessionStorage.getItem('uniskilled_ref_code');
    if (ref) root.querySelectorAll('a[href^="onboarding.html"]').forEach(function (a) { a.href = 'onboarding.html?ref=' + encodeURIComponent(ref); });
  } catch (e) {}

  // Behaviour: shadow on scroll, accessible menu
  var burger = root.querySelector('.snav-burger'), menu = root.querySelector('.snav-m');
  function onScroll() { root.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  function setOpen(open) {
    menu.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    burger.textContent = open ? '✕' : '☰';
  }
  burger.addEventListener('click', function () { setOpen(!menu.classList.contains('open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('open')) { setOpen(false); burger.focus(); } });
  document.addEventListener('click', function (e) { if (menu.classList.contains('open') && !e.target.closest('#site-nav')) setOpen(false); });
  if (window.matchMedia) window.matchMedia('(min-width: 961px)').addEventListener('change', function (e) { if (e.matches) setOpen(false); });

  // Sign out: use the page's Supabase client if it has one, otherwise clear the stored session
  root.addEventListener('click', function (e) {
    if (!e.target.closest('[data-signout]')) return;
    function done() { try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem('keepSignedIn'); } catch (x) {} location.href = 'index.html?loggedout=1'; }
    var client = (typeof _sb !== 'undefined' && _sb) || (typeof _supabase !== 'undefined' && _supabase) || null;
    if (client && client.auth) client.auth.signOut().then(done, done); else done();
  });
})();
