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

  // Labels in the visitor's language (i18n.js); the English is the fallback and what English pages show.
  function L(k, en, v) { return window.I18N ? window.I18N.t(k, en, v) : en.replace(/\{\{(\w+)\}\}/g, function (m, x) { return v && x in v ? v[x] : m; }); }

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
  var first = full ? full.split(/\s+/)[0] : L('nav.account', 'Account');
  var parts = full.split(/\s+/).filter(Boolean);
  var initials = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
                              : String((user && user.email) || '?')[0].toUpperCase();
  var roleLabel = isTutor ? L('nav.role.tutor', 'Tutor account') : role === 'business' ? L('nav.role.business', 'Business account') : role === 'university' ? L('nav.role.university', 'University account') : L('nav.role.student', 'Student account');

  function link(href, label) {
    var cur = href.indexOf('#') === -1 && href === current ? ' aria-current="page"' : '';
    return '<a href="' + href + '"' + cur + '>' + label + '</a>';
  }

  var items;
  if (mode === 'app' && user) {
    items = isTutor
      ? [[dash, L('nav.dashboard', 'Dashboard')], ['messages.html', L('nav.messages', 'Messages')], ['calendar.html', L('nav.calendar', 'Calendar')], ['manage-availability.html', L('nav.availability', 'Availability')]]
      : [[dash, L('nav.dashboard', 'Dashboard')], ['find-tutors.html', L('nav.findTutors', 'Find Tutors')], ['courses.html', L('nav.courses', 'Courses')], ['messages.html', L('nav.messages', 'Messages')], ['calendar.html', L('nav.calendar', 'Calendar')]];
  } else {
    items = [['about.html', L('nav.about', 'About')], ['find-tutors.html', L('nav.findTutors', 'Find Tutors')], ['courses.html', L('nav.courses', 'Courses')], ['group-sessions.html', L('nav.groupSessions', 'Group Sessions')], ['index.html#how-it-works', L('nav.howItWorks', 'How it Works')]];
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
    var menuItems = mi(prof, L('nav.myProfile', 'My profile')) + mi(dash, L('nav.dashboard', 'Dashboard')) + mi('calendar.html', L('nav.calendar', 'Calendar')) +
      '<div class="snav-sep" role="separator"></div><button type="button" class="snav-mi snav-out" role="menuitem" data-signout>' + L('nav.signOut', 'Sign out') + '</button>';
    end = (mode === 'public' ? '<a href="' + dash + '" class="snav-text">' + L('nav.dashboard', 'Dashboard') + '</a>' : '') +
      '<div class="snav-acct"><button type="button" class="snav-acct-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="snavAcctMenu" aria-label="' + esc(L('nav.accountMenuFor', 'Account menu for {{name}}', { name: full || first })) + '">' +
        '<span class="snav-av" aria-hidden="true">' + esc(initials) + '</span><span class="nm">' + esc(first) + '</span>' + CHEV + '</button>' +
        '<div class="snav-menu" id="snavAcctMenu" role="menu" aria-label="' + esc(L('nav.account', 'Account')) + '" hidden>' + who + menuItems + '</div></div>';
    var mAcct = (mode === 'public' ? link(dash, L('nav.dashboard', 'Dashboard')) : '') + who + link(prof, L('nav.myProfile', 'My profile')) +
      (mode === 'public' ? link('calendar.html', L('nav.calendar', 'Calendar')) : '');
    mEnd = mAcct + '<button type="button" class="snav-out" data-signout>' + L('nav.signOut', 'Sign out') + '</button>';
    document.body.classList.add('signed-in');
  } else {
    end = '<a href="signin.html" class="snav-text">' + L('nav.signIn', 'Sign in') + '</a><a href="onboarding.html" class="snav-cta">' + L('nav.getStarted', 'Get started') + '</a>';
    mEnd = '<a href="signin.html">' + L('nav.signIn', 'Sign in') + '</a><a href="onboarding.html" class="snav-cta">' + L('nav.getStarted', 'Get started') + '</a>';
  }

  // ── Website language (NOT the languages a tutor teaches in) ──────────────────────────────
  // Keep in step with locales/languages.json and locales/*/common.json (tests check this).
  // Only languages marked live are offered. ?langpreview=1 shows every language (for reviewing
  // languages not live yet); ?langpreview=0 turns that off again.
  var LANGS = [
    { code: 'en', name: 'English', live: true },
    { code: 'de', name: 'Deutsch', live: false },
    { code: 'ar', name: 'العربية', live: true },
    { code: 'tr', name: 'Türkçe', live: false },
    { code: 'fr', name: 'Français', live: false },
    { code: 'es', name: 'Español', live: false }
  ];
  // First-visit suggestion, written in the suggested language itself (same text as lang.banner.* in common.json)
  var BANNER = {
    de: ['UniSkilled gibt es auch auf Deutsch.', 'Auf Deutsch wechseln'],
    ar: ['يتوفّر UniSkilled باللغة العربية أيضًا.', 'التبديل إلى العربية'],
    tr: ['UniSkilled Türkçe olarak da kullanılabilir.', 'Türkçeye geç'],
    fr: ['UniSkilled est aussi disponible en français.', 'Passer au français'],
    es: ['UniSkilled también está disponible en español.', 'Cambiar a español']
  };
  var PREF = 'uniskilled_lang', PREVIEW = 'uniskilled_lang_preview', BANNER_KEY = 'uniskilled_lang_banner';
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function stored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  try {
    var pv = new URLSearchParams(location.search).get('langpreview');
    if (pv === '1') store(PREVIEW, '1'); else if (pv === '0') store(PREVIEW, null);
  } catch (e) {}
  var curLang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase().split('-')[0];
  if (!LANGS.some(function (l) { return l.code === curLang; })) curLang = 'en';
  var preview = stored(PREVIEW) === '1';
  var shown = LANGS.filter(function (l) { return l.live || l.code === curLang || preview; });
  var langOn = shown.length > 1;
  var curName = (LANGS.filter(function (l) { return l.code === curLang; })[0] || LANGS[0]).name;
  function nameIn(code) {     // a language's name in the language of this page
    try { return new Intl.DisplayNames([curLang === 'ar' ? 'ar' : curLang], { type: 'language' }).of(code); } catch (e) { return code; }
  }
  function langHref(code) {   // the same page in another language
    var page = (location.pathname.split('/').pop() || 'index.html') + location.search.replace(/([?&])langpreview=[01]&?/, '$1').replace(/[?&]$/, '') + location.hash;
    return (code === 'en' ? '/' : '/' + code + '/') + page;
  }
  var GLOBE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9z"/></svg>';
  var langItems = shown.map(function (l) {
    var here = l.code === curLang;
    return '<a class="snav-lang-opt" href="' + esc(langHref(l.code)) + '" data-lang="' + l.code + '" lang="' + l.code + '" dir="' + (l.code === 'ar' ? 'rtl' : 'ltr') + '"' +
      (here ? ' aria-current="true"' : '') + '><b>' + esc(l.name) + '</b><small lang="' + curLang + '" dir="' + (curLang === 'ar' ? 'rtl' : 'ltr') + '">' +
      esc(here ? L('lang.current', 'Current language') : nameIn(l.code)) + '</small></a>';
  }).join('');
  var LANG_BTN = langOn
    ? '<div class="snav-lang"><button type="button" class="snav-lang-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="snavLangPanel" aria-label="' +
        esc(L('lang.button', 'Language: {{language}}', { language: curName })) + '">' + GLOBE + '<span>' + curLang.toUpperCase() + '</span></button>' +
        '<div class="snav-lang-panel" id="snavLangPanel" role="dialog" aria-label="' + esc(L('lang.title', 'Website language')) + '" hidden>' +
        '<p class="snav-lang-t">' + esc(L('lang.title', 'Website language')) + '</p><div class="snav-lang-grid">' + langItems + '</div>' +
        '<p class="snav-lang-help">' + esc(L('lang.help', 'Changes the website only. To find a tutor who speaks a language, use the “Teaches in” filter.')) + '</p></div></div>'
    : '';
  var LANG_ROW = langOn
    ? '<button type="button" class="snav-lang-row" aria-haspopup="dialog">' + GLOBE + '<span class="t">' + esc(L('lang.title', 'Website language')) +
        '</span><span class="v">' + esc(curName) + (curLang === 'ar' ? ' ‹' : ' ›') + '</span></button>'
    : '';
  var langCss = '.snav-lang{position:relative}' +
    '.snav-lang-btn{display:flex;align-items:center;gap:6px;height:36px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:none;color:#fff;font-size:.8rem;font-weight:800;letter-spacing:.04em;cursor:pointer}' +
    '.snav-lang-btn:hover,.snav-lang-btn[aria-expanded="true"]{background:#fff;color:' + NAVY + '}' +
    '.snav-lang-panel{position:absolute;right:0;top:calc(100% + 10px);width:400px;max-width:calc(100vw - 24px);background:#fff;border-radius:14px;box-shadow:0 16px 40px rgba(8,18,48,.28);padding:16px;z-index:960}' +
    '.snav-lang-panel[hidden]{display:none}' +
    '.snav-lang-t{margin:0 0 10px;font-size:.92rem;font-weight:800;color:' + NAVY + '}' +
    '.snav-lang-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
    '.snav-lang-opt{display:flex;flex-direction:column;justify-content:center;min-height:52px;padding:7px 12px;border:1px solid #e2e8f0;border-radius:10px;text-decoration:none;color:#1e293b}' +
    '.snav-lang-opt:hover,.snav-lang-opt:focus-visible{border-color:#1747b8;outline:none}' +
    '.snav-lang-opt b{font-size:.92rem;font-weight:700}.snav-lang-opt small{font-size:.74rem;color:#5b6b82}' +
    '.snav-lang-opt[aria-current="true"]{border:2px solid #1747b8;background:#eef4ff;color:#1747b8}.snav-lang-opt[aria-current="true"] small{color:#1747b8}' +
    '.snav-lang-opt[lang="ar"] b{font-size:1rem}' +
    '.snav-lang-help{margin:12px 0 0;font-size:.76rem;line-height:1.5;color:#5b6b82}' +
    '.snav-lang-row{display:none}' +
    '.snav-sheet{position:fixed;inset:0;z-index:2000;display:flex;align-items:flex-end;background:rgba(8,18,48,.55)}' +
    '.snav-sheet>div{width:100%;background:#fff;border-radius:20px 20px 0 0;padding:10px 16px max(24px,env(safe-area-inset-bottom,0px));box-sizing:border-box;font-family:"Manrope",system-ui,sans-serif}' +
    '.snav-sheet .grip{width:40px;height:4px;border-radius:4px;background:#cbd5e1;margin:0 auto 14px}' +
    '.snav-sheet h2{margin:0 4px 4px;font-size:1.1rem;font-weight:800;color:' + NAVY + '}.snav-sheet p{margin:0 4px 10px;font-size:.82rem;line-height:1.45;color:#5b6b82}' +
    '.snav-sheet .snav-lang-opt{min-height:56px;flex-direction:row;align-items:center;justify-content:space-between;border:0;border-bottom:1px solid #eef1f5;border-radius:12px;font-size:1rem}' +
    '.snav-lang-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 5%;background:#e8f4fc;border-bottom:1px solid #c4e3f6;color:' + NAVY + ';font-family:"Manrope",system-ui,sans-serif;font-size:.875rem}' +
    '.snav-lang-bar p{margin:0;flex:1;min-width:200px}.snav-lang-bar a{background:#1747b8;color:#fff;font-weight:700;padding:8px 14px;border-radius:8px;text-decoration:none}' +
    '.snav-lang-bar button{background:none;border:0;color:' + NAVY + ';font:inherit;font-weight:600;padding:8px 10px;cursor:pointer;border-radius:8px}' +
    '@media(max-width:960px){.snav-lang{display:none}' +
      '.snav-m .snav-lang-row{display:flex;align-items:center;gap:10px;min-height:48px;width:100%;padding:0;border:0;border-bottom:1px solid rgba(255,255,255,.08);background:none;color:#fff;font-size:1rem;font-weight:600;cursor:pointer;text-align:left}' +
      '.snav-m .snav-lang-row .t{flex:1}.snav-m .snav-lang-row .v{color:rgba(255,255,255,.7);font-weight:500}}';
  if (langOn) { var langStyle = document.createElement('style'); langStyle.textContent = langCss; document.head.appendChild(langStyle); }

  root.className = 'snav';
  root.innerHTML =
    '<a class="snav-logo" href="index.html" aria-label="' + esc(L('nav.home', 'UniSkilled home')) + '"><img src="uniskilled-logo-white-sm.png?v=20261101" alt="UniSkilled" width="153" height="38"></a>' +
    '<div class="snav-links" role="navigation" aria-label="' + esc(L('nav.main', 'Main')) + '">' + main + '</div>' +
    '<div class="snav-end">' + LANG_BTN + end + '</div>' +
    '<button class="snav-burger" type="button" aria-label="' + esc(L('nav.openMenu', 'Open menu')) + '" aria-expanded="false" aria-controls="snavMenu">' + BURGER + CLOSE + '</button>' +
    '<div class="snav-m" id="snavMenu" role="navigation" aria-label="' + esc(L('nav.mainMenu', 'Main menu')) + '">' + main + LANG_ROW + mEnd + '</div>';

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
    burger.setAttribute('aria-label', open ? L('nav.closeMenu', 'Close menu') : L('nav.openMenu', 'Open menu'));
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

  // ── Website language: panel (desktop), sheet (phone), saving the choice, first-visit banner ──
  // Saving: on this device (localStorage) and, when signed in, on the account (user metadata
  // ui_locale) so other devices and emails know it. Never decided by location. Never forced.
  function pageClient() { return (typeof _sb !== 'undefined' && _sb) || (typeof _supabase !== 'undefined' && _supabase) || null; }
  function choose(code, href) {
    store(PREF, code);
    var go = function () { location.href = href; };
    var client = pageClient();
    if (user && client && client.auth && ((user.user_metadata || {}).ui_locale !== code)) {
      var t = setTimeout(go, 1200);   // never keep the visitor waiting on the network
      client.auth.updateUser({ data: { ui_locale: code } }).then(function () { clearTimeout(t); go(); }, function () { clearTimeout(t); go(); });
    } else go();
  }
  // A choice made before signing in is saved on the account once signed in, so emails use it too.
  window.addEventListener('load', function () {
    var pref = stored(PREF), client = pageClient();
    if (!user || !pref || !client || !client.auth || (user.user_metadata || {}).ui_locale === pref) return;
    try { client.auth.updateUser({ data: { ui_locale: pref } }).then(function () {}, function () {}); } catch (e) { /* not important */ }
  });
  document.addEventListener('click', function (e) {
    var opt = e.target.closest && e.target.closest('.snav-lang-opt');
    if (!opt) return;
    e.preventDefault();
    if (opt.getAttribute('aria-current') === 'true') { closeLang(); closeSheet(); return; }
    choose(opt.getAttribute('data-lang'), opt.getAttribute('href'));
  });

  var langBtn = root.querySelector('.snav-lang-btn'), langPanel = root.querySelector('.snav-lang-panel');
  function closeLang() { if (langPanel && !langPanel.hidden) { langPanel.hidden = true; langBtn.setAttribute('aria-expanded', 'false'); } }
  if (langBtn) {
    langBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = langPanel.hidden;
      langPanel.hidden = !open; langBtn.setAttribute('aria-expanded', String(open));
      if (open) { var cur = langPanel.querySelector('[aria-current="true"]') || langPanel.querySelector('a'); if (cur) cur.focus(); }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.snav-lang')) closeLang(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && langPanel && !langPanel.hidden) { closeLang(); langBtn.focus(); } });
  }

  var sheetEl = null, sheetOpener = null;
  function closeSheet() {
    if (!sheetEl) return;
    sheetEl.remove(); sheetEl = null; document.body.style.overflow = '';
    if (sheetOpener) sheetOpener.focus();
  }
  var langRow = root.querySelector('.snav-lang-row');
  if (langRow) langRow.addEventListener('click', function () {
    sheetOpener = langRow;
    sheetEl = document.createElement('div');
    sheetEl.className = 'snav-sheet';
    sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true'); sheetEl.setAttribute('aria-label', L('lang.title', 'Website language'));
    sheetEl.innerHTML = '<div><div class="grip" aria-hidden="true"></div><h2>' + esc(L('lang.title', 'Website language')) + '</h2><p>' +
      esc(L('lang.help', 'Changes the website only. To find a tutor who speaks a language, use the “Teaches in” filter.')) + '</p>' + langItems + '</div>';
    sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl) closeSheet(); });
    sheetEl.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    document.body.appendChild(sheetEl); document.body.style.overflow = 'hidden';
    var first = sheetEl.querySelector('[aria-current="true"]') || sheetEl.querySelector('a'); if (first) first.focus();
  });

  // First-visit suggestion: English pages only, for a language that is live. Shown when the visitor
  // chose that language before (this device or their account) or their browser prefers it, and
  // they haven't said "stay in English" or closed it. The page itself never changes by itself.
  (function () {
    if (curLang !== 'en') return;
    var live = LANGS.filter(function (l) { return l.live && l.code !== 'en'; }).map(function (l) { return l.code; });
    if (!live.length || stored(BANNER_KEY)) return;
    var pref = stored(PREF) || ((user && user.user_metadata) || {}).ui_locale || null;
    if (pref === 'en') return;
    var want = live.indexOf(pref) !== -1 ? pref : null;
    if (!want && !pref) {
      var list = []; try { list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]; } catch (e) {}
      for (var i = 0; i < list.length && !want; i++) { var b = String(list[i] || '').toLowerCase().split('-')[0]; if (b === 'en') break; if (live.indexOf(b) !== -1) want = b; }
    }
    if (!want || !BANNER[want]) return;
    var bar = document.createElement('div');
    bar.className = 'snav-lang-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', L('lang.title', 'Website language'));
    bar.innerHTML = '<p lang="' + want + '" dir="' + (want === 'ar' ? 'rtl' : 'ltr') + '"><b>' + esc(BANNER[want][0]) + '</b></p>' +
      '<a class="snav-lang-opt-go" href="' + esc(langHref(want)) + '" lang="' + want + '">' + esc(BANNER[want][1]) + '</a>' +
      '<button type="button" data-stay>' + esc(L('lang.banner.stay', 'Stay in English')) + '</button>' +
      '<button type="button" data-close aria-label="' + esc(L('lang.banner.close', 'Close')) + '">✕</button>';
    bar.addEventListener('click', function (e) {
      if (e.target.closest('.snav-lang-opt-go')) { e.preventDefault(); choose(want, langHref(want)); }
      else if (e.target.closest('[data-stay]')) { store(PREF, 'en'); store(BANNER_KEY, 'stay'); bar.remove(); }
      else if (e.target.closest('[data-close]')) { store(BANNER_KEY, 'closed'); bar.remove(); }
    });
    root.parentNode.insertBefore(bar, root);
  })();

  // Sign out: use the page's Supabase client if it has one, otherwise clear the stored session
  root.addEventListener('click', function (e) {
    if (!e.target.closest('[data-signout]')) return;
    function done() { try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem('keepSignedIn'); } catch (x) {} location.href = 'index.html?loggedout=1'; }
    var client = (typeof _sb !== 'undefined' && _sb) || (typeof _supabase !== 'undefined' && _supabase) || null;
    if (client && client.auth) client.auth.signOut().then(done, done); else done();
  });
})();
