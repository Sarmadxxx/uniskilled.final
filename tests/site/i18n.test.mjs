// Translation system: dictionaries, glossary, runtime (i18n.js) and the language build.
// Run: node --test tests/site/*.test.mjs   (also: npm run test:i18n)
//
// These checks fail the pull request when a translation would show broken or inconsistent text:
// missing or extra keys, placeholders that differ from English, missing plural forms, banned words,
// French spacing, HTML tags that differ from English, unreviewed payment text in a live language,
// or an English page that would change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { loadLanguages, loadDictionary, translatePage, stripMarkers, rootRelative, scriptKeys, build }
  from '../../scripts/build-locales.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const conf = loadLanguages(ROOT);
const codes = conf.languages.map(l => l.code);
const others = codes.filter(c => c !== conf.default);
const glossary = JSON.parse(readFileSync(join(ROOT, 'locales/glossary.json'), 'utf8'));
const review = JSON.parse(readFileSync(join(ROOT, 'locales/review.json'), 'utf8'));

const areas = lang => readdirSync(join(ROOT, 'locales', lang)).filter(f => f.endsWith('.json'));
const readArea = (lang, f) => JSON.parse(readFileSync(join(ROOT, 'locales', lang, f), 'utf8'));
const placeholders = s => [...String(s).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]).sort();
const tags = s => [...String(s).matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)].map(m => m[0].toLowerCase()).sort();
const values = v => (v && typeof v === 'object') ? Object.values(v) : [v];

// ---------- languages.json and the runtime agree ------------------------------------------------
function loadRuntime({ boot, search = '', languages = ['en-US'] } = {}) {
  const window = { __I18N: boot, location: { search, pathname: '/find-tutors.html', hash: '' },
    navigator: { languages }, localStorage: new Map() };
  window.localStorage.getItem = k => window.localStorage.get(k) ?? null;
  window.localStorage.setItem = (k, v) => window.localStorage.set(k, v);
  vm.runInNewContext(readFileSync(join(ROOT, 'i18n.js'), 'utf8'), { window, Intl, Date, Number, String, Math, Array, Object, JSON });
  return window.I18N;
}

test('languages.json lists the six languages and matches i18n.js', () => {
  assert.deepEqual(codes, ['en', 'de', 'ar', 'tr', 'fr', 'es']);
  const L = loadRuntime()._langs;
  for (const l of conf.languages) {
    assert.ok(L[l.code], `${l.code} missing in i18n.js`);
    assert.equal(L[l.code].dir, l.dir, `${l.code} direction`);
    assert.equal(L[l.code].intl, l.intl, `${l.code} Intl locale`);
  }
  assert.equal(conf.languages.find(l => l.code === 'ar').dir, 'rtl');
  assert.equal(conf.languages.find(l => l.code === 'ar').logoStaysLeft, true, 'Arabic keeps the logo on the left (10 Nov)');
  assert.equal(conf.languages.find(l => l.code === 'en').live, true);
});

// ---------- dictionaries ------------------------------------------------------------------------
test('every language has exactly the English keys, no more', () => {
  for (const lang of others) {
    for (const f of areas('en')) {
      const en = readArea('en', f);
      const file = join(ROOT, 'locales', lang, f);
      if (!existsSync(file)) continue;                     // area not started in this language yet
      const tr = readArea(lang, f);
      const extra = Object.keys(tr).filter(k => !k.startsWith('_') && !(k in en));
      assert.deepEqual(extra, [], `${lang}/${f} has keys English does not`);
      const live = conf.languages.find(l => l.code === lang).live;
      const missing = Object.keys(en).filter(k => !k.startsWith('_') && (tr[k] == null || tr[k] === ''));
      if (live) assert.deepEqual(missing, [], `${lang}/${f} is live but missing keys`);
    }
  }
});

test('translations keep the same {{placeholders}} and HTML tags as English', () => {
  for (const lang of others) for (const f of areas(lang)) {
    const en = readArea('en', f), tr = readArea(lang, f);
    for (const [k, v] of Object.entries(tr)) {
      if (k.startsWith('_')) continue;
      const enForms = values(en[k]);
      for (const form of values(v)) {
        assert.deepEqual(placeholders(form), placeholders(enForms.at(-1)), `${lang} ${k}: placeholders differ from English`);
        assert.deepEqual(tags(form), tags(enForms.at(-1)), `${lang} ${k}: HTML tags differ from English`);
      }
    }
  }
});

test('plural entries have every form the language needs', () => {
  for (const lang of codes) for (const f of areas(lang)) {
    const L = conf.languages.find(l => l.code === lang);
    const need = new Intl.PluralRules(L.intl || 'en').resolvedOptions().pluralCategories;
    for (const [k, v] of Object.entries(readArea(lang, f))) {
      if (!v || typeof v !== 'object' || k.startsWith('_')) continue;
      for (const c of need) assert.ok(v[c] != null, `${lang} ${k}: missing plural form "${c}"`);
    }
  }
});

test('no banned words (glossary.banned) in translations; English leftovers are listed as a warning', () => {
  const englishLeftovers = [];
  for (const lang of codes) {
    const banned = (glossary.banned[lang] || []).map(w => w.toLowerCase());
    for (const f of areas(lang)) for (const [k, v] of Object.entries(readArea(lang, f))) {
      if (k.startsWith('_')) continue;
      for (const form of values(v)) {
        const s = String(form).toLowerCase();
        for (const w of banned) {
          if (!s.includes(w)) continue;
          // English page text is the site's existing wording; it is changed only with approval.
          if (lang === 'en') englishLeftovers.push(`${k} ("${w}")`);
          else assert.fail(`${lang} ${k}: uses banned word "${w}"`);
        }
      }
    }
  }  if (englishLeftovers.length) console.log(`WARNING: English text still uses banned words (needs approval to change): ${englishLeftovers.join(', ')}`);
});

test('French typography: narrow no-break space before : ; ! ? and inside « »', () => {
  for (const f of areas('fr')) for (const [k, v] of Object.entries(readArea('fr', f))) {
    if (k.startsWith('_')) continue;
    for (const form of values(v)) {
      const s = String(form).replace(/\{\{[^}]*\}\}/g, 'X').replace(/https?:\/\/\S+/g, '');
      for (const m of s.matchAll(/[:;!?]/g)) {
        assert.ok(/[  ]/.test(s[m.index - 1] || ''), `fr ${k}: needs a narrow no-break space (U+202F) before "${m[0]}"`);
      }
      assert.ok(!/«(?! )|(?<! )»/.test(s), `fr ${k}: use U+202F inside « »`);
    }
  }
});

test('formal, respectful register: German Sie, French vous, Spanish usted (decision 10 Nov)', () => {
  const informal = {
    de: /(^|[^\p{L}])(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euch|euer|eure)(?=[^\p{L}]|$)|[a-zäöü]’s\b/iu,
    fr: /(^|[^\p{L}])(tu|toi|ton|tes|ça)(?=[^\p{L}]|$)/iu,
    es: /(^|[^\p{L}])(tú|tu|tus|te|ti|contigo|vosotros|vuestro|vuestra|usa|elige|haz|busca|escribe)(?=[^\p{L}]|$)/iu,
  };
  for (const [lang, re] of Object.entries(informal)) for (const f of areas(lang)) {
    for (const [k, v] of Object.entries(readArea(lang, f))) {
      if (k.startsWith('_')) continue;
      for (const form of values(v)) {
        const m = String(form).replace(/\{\{[^}]*\}\}/g, '').match(re);
        assert.ok(!m, `${lang} ${k}: informal wording "${m && m[0].trim()}" — use the formal form`);
      }
    }
  }
});

test('glossary: every term has all six languages', () => {
  for (const t of glossary.terms) for (const c of codes) assert.ok(t[c], `glossary ${t.id}: missing ${c}`);
  const brand = glossary.terms.find(t => t.id === 'brand');
  for (const c of codes) assert.equal(brand[c], 'UniSkilled');
});

test('glossary terms are used in the dictionaries where the English uses them', () => {
  // e.g. wherever English says "Find Tutors", German must use Tutor:innen, Arabic مدرّس, …
  const checks = [
    { en: /\btutors?\b/i, id: 'tutor', stem: { de: 'Tutor', ar: 'مدرّس', tr: 'eğitmen', fr: 'tuteur', es: 'tutor' } },
    { en: /\bteaches in\b/i, id: 'teaches_in', stem: { de: 'Unterrichtet auf', ar: 'لغة التدريس', tr: 'Ders dili', fr: 'Enseigne en', es: 'Enseña en' } },
  ];
  for (const f of areas('en')) {
    const en = readArea('en', f);
    for (const lang of others) {
      if (!existsSync(join(ROOT, 'locales', lang, f))) continue;
      const tr = readArea(lang, f);
      for (const [k, v] of Object.entries(en)) {
        if (k.startsWith('_') || tr[k] == null) continue;
        const words = x => values(x).join(' ').replace(/<[^>]+>/g, ' ');   // words only, not tags or link addresses
        for (const c of checks) if (c.en.test(words(v))) {
          assert.ok(words(tr[k]).toLowerCase().includes(c.stem[lang].toLowerCase()),
            `${lang} ${k}: should use the glossary term for "${c.id}" (${c.stem[lang]})`);
        }
      }
    }
  }
});

test('payment, account, email and legal text is only live once reviewed', () => {
  const rank = { draft: 0, reviewed: 1, 'legal-reviewed': 2 };
  for (const L of conf.languages.filter(l => l.live && l.code !== conf.default)) {
    for (const [area, needed] of Object.entries(review.gated)) {
      if (!existsSync(join(ROOT, 'locales', L.code, area + '.json'))) continue;
      const got = review.status[area]?.[L.code] || 'draft';
      assert.ok(rank[got] >= rank[needed], `${L.code} is live but ${area} is "${got}" (needs "${needed}")`);
    }
  }
});

// ---------- runtime -----------------------------------------------------------------------------
test('English: t() returns the English written in the code, never a key', () => {
  const I = loadRuntime();
  assert.equal(I.lang, 'en');
  assert.equal(I.t('nav.findTutors', 'Find Tutors'), 'Find Tutors');
  assert.equal(I.t('x.y', 'Hi {{name}}', { name: 'Lena' }), 'Hi Lena');
  assert.equal(I.t('x.count', { one: '{{count}} tutor', other: '{{count}} tutors' }, { count: 1 }), '1 tutor');
  assert.equal(I.t('x.count', { one: '{{count}} tutor', other: '{{count}} tutors' }, { count: 3 }), '3 tutors');
});

test('English formatting is exactly what the pages already did (browser default locale)', () => {
  const I = loadRuntime();
  const d = new Date('2026-11-10T15:30:00Z');
  assert.equal(I.date(d, { day: 'numeric', month: 'short' }), d.toLocaleDateString([], { day: 'numeric', month: 'short' }));
  assert.equal(I.time(d), d.toLocaleTimeString([]));
});

test('another language: dictionary, fallback to English, plurals, escaping', () => {
  const de = loadDictionary('de', ROOT);
  const I = loadRuntime({ boot: { lang: 'de', dict: { ...de, 'x.count': { one: '{{count}} Tutor:in', other: '{{count}} Tutor:innen' } } } });
  assert.equal(I.lang, 'de');
  assert.equal(I.t('nav.findTutors', 'Find Tutors'), 'Tutor:innen finden');
  assert.equal(I.t('not.there', 'Fallback English'), 'Fallback English');
  assert.equal(I.t('x.count', { one: '', other: '' }, { count: 2 }), '2 Tutor:innen');
  assert.equal(I.h('nav.accountMenuFor', 'Account menu for {{name}}', { name: '<img onerror=x>' }),
    'Kontomenü von &lt;img onerror=x&gt;');
});

test('Arabic: right-to-left, Western digits, six plural forms', () => {
  const ar = loadDictionary('ar', ROOT);
  const forms = { zero: 'لا يوجد مدرّسون', one: 'مدرّس واحد', two: 'مدرّسان', few: '{{count}} مدرّسين', many: '{{count}} مدرّسًا', other: '{{count}} مدرّس' };
  const I = loadRuntime({ boot: { lang: 'ar', dict: { ...ar, 'x.count': forms } } });
  assert.equal(I.dir, 'rtl');
  assert.equal(I.t('x.count', { one: '', other: '' }, { count: 0 }), 'لا يوجد مدرّسون');
  assert.equal(I.t('x.count', { one: '', other: '' }, { count: 2 }), 'مدرّسان');
  assert.equal(I.t('x.count', { one: '', other: '' }, { count: 5 }), '5 مدرّسين');
  assert.equal(I.t('x.count', { one: '', other: '' }, { count: 11 }), '11 مدرّسًا');
  assert.match(I.money(25, 'EUR'), /25[.,]00/);                 // Western digits
  assert.doesNotMatch(I.money(25, 'EUR'), /[٠-٩]/);              // no Arabic-Indic digits
});

test('money is written the local way', () => {
  assert.equal(loadRuntime({ boot: { lang: 'de', dict: {} } }).money(25, 'EUR').replace(/\s/g, ' '), '25,00 €');
  assert.equal(loadRuntime({ boot: { lang: 'fr', dict: {} } }).money(25, 'EUR').replace(/\s/g, ' '), '25,00 €');
  assert.equal(loadRuntime({ boot: { lang: 'es', dict: {} } }).money(25, 'EUR').replace(/\s/g, ' '), '25,00 €');
  assert.equal(loadRuntime().money(25, 'EUR'), '€25.00');
});

test('language names come out in the reader’s language', () => {
  assert.equal(loadRuntime({ boot: { lang: 'de', dict: {} } }).languageName('ar'), 'Arabisch');
  assert.equal(loadRuntime({ boot: { lang: 'ar', dict: {} } }).languageName('en'), 'الإنجليزية');
});

test('language URLs keep the page and its query', () => {
  const I = loadRuntime();
  assert.equal(I.path('de', 'find-tutors.html?subject=math'), '/de/find-tutors.html?subject=math');
  assert.equal(I.path('en', '/de/find-tutors.html'), '/find-tutors.html');
  assert.equal(I.path('ar', '/de/index.html#how'), '/ar/index.html#how');
});

test('browser preference uses the browser list only, never location', () => {
  assert.equal(loadRuntime({ languages: ['de-DE', 'en'] }).browserPreference(), 'de');
  assert.equal(loadRuntime({ languages: ['nl-NL', 'ar-IQ'] }).browserPreference(), 'ar');
  assert.equal(loadRuntime({ languages: ['nl-NL'] }).browserPreference(), null);
  assert.equal(loadRuntime({ languages: ['de-DE'] }).browserPreference(['en']), null, 'only languages that are live');
});

test('pseudo-language makes leftover English obvious and keeps placeholders', () => {
  const I = loadRuntime({ search: '?i18n=qps' });
  const s = I.t('k', 'Find {{n}} tutors', { n: 3 });
  assert.match(s, /^⟦.*⟧$/);
  assert.ok(s.includes('3'));
  assert.ok(!/Find/.test(s));
});

// ---------- the build ---------------------------------------------------------------------------
const PAGE = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<title data-i18n="t.title">Find a Tutor — UniSkilled</title>\n' +
  '<link rel="stylesheet" href="fonts/fonts.css">\n</head>\n<body>\n' +
  '<a class="snav-logo" href="index.html"><img src="uniskilled-logo-white-sm.png" alt="UniSkilled"></a>\n' +
  '<h1 data-i18n="t.h1">Find a <b>tutor</b></h1>\n<input data-i18n-attr="placeholder:t.ph" placeholder="Search">\n' +
  '<a href="book-session.html">Book</a>\n<script src="i18n.js"></script>\n<script>I18N.t(\'t.js\', \'Sent\')</script>\n</body>\n</html>\n';
const ORIGINAL = PAGE.replace(/ data-i18n(?:-attr)?="[^"]*"/g, '');

test('removing the markers gives back the original English byte for byte', () => {
  assert.equal(stripMarkers(PAGE), ORIGINAL);
});

test('a fully translated page is translated; the logo is untouched', () => {
  const dict = { 't.title': 'Tutor:in finden — UniSkilled', 't.h1': '<b>Tutor:in</b> finden', 't.ph': 'Suchen', 't.js': 'Gesendet' };
  const r = translatePage(PAGE, dict, { lang: 'de', dir: 'ltr', robots: 'noindex, nofollow', inlineKeys: scriptKeys(PAGE) });
  assert.deepEqual(r.missing, []);
  assert.match(r.html, /<html lang="de" dir="ltr">/);
  assert.match(r.html, /<title>Tutor:in finden — UniSkilled<\/title>/);
  assert.match(r.html, /<h1><b>Tutor:in<\/b> finden<\/h1>/);
  assert.match(r.html, /placeholder="Suchen"/);
  assert.match(r.html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(r.html, /window\.__I18N=\{"lang":"de","dict":\{"t\.js":"Gesendet"\}\}/);
  assert.ok(r.html.includes('<a class="snav-logo" href="index.html"><img src="uniskilled-logo-white-sm.png" alt="UniSkilled"></a>'));
  assert.doesNotMatch(r.html, /data-i18n/);
});

test('a page with any missing text is reported, so it is not published in that language', () => {
  const r = translatePage(PAGE, { 't.title': 'x' }, { lang: 'de', dir: 'ltr' });
  assert.deepEqual(r.missing.sort(), ['t.h1', 't.ph']);
});

test('Arabic pages get dir="rtl"', () => {
  const r = translatePage(PAGE, { 't.title': 'أ', 't.h1': 'ب <b>ج</b>', 't.ph': 'د' }, { lang: 'ar', dir: 'rtl' });
  assert.match(r.html, /<html lang="ar" dir="rtl">/);
});

test('language folders load shared files from the site root and link to translated pages', () => {
  const out = rootRelative('<link href="fonts/fonts.css"><a href="book-session.html"><a href="legal.html#x"><img src="https://x.y/a.png"><a href="#top">',
    new Set(['book-session.html']));
  assert.equal(out, '<link href="/fonts/fonts.css"><a href="book-session.html"><a href="/legal.html#x"><img src="https://x.y/a.png"><a href="#top">');
});

test('build: English files are untouched; languages not live yet are built hidden (noindex)', () => {
  const site = mkdtempSync(join(tmpdir(), 'usk-site-'));
  const files = { 'index.html': readFileSync(join(ROOT, 'index.html'), 'utf8'), 'site-nav.js': '/* nav */', 'sub/x.html': '<p>x</p>' };
  for (const [f, c] of Object.entries(files)) { mkdirSync(join(site, f, '..'), { recursive: true }); writeFileSync(join(site, f), c); }
  const report = build({ site, root: ROOT, log: () => {} });
  assert.equal(readFileSync(join(site, 'index.html'), 'utf8'), stripMarkers(files['index.html']), 'English index changed beyond removing markers');
  assert.equal(readFileSync(join(site, 'site-nav.js'), 'utf8'), files['site-nav.js']);
  for (const [code, r] of Object.entries(report)) {
    const L = conf.languages.find(l => l.code === code);
    for (const p of r.pages) {
      const html = readFileSync(join(site, code, p), 'utf8');
      if (!L.live) assert.match(html, /<meta name="robots" content="noindex, nofollow">/, `${code}/${p} must be hidden while not live`);
      assert.match(html, new RegExp(`<html lang="${code}" dir="${L.dir}"`));
    }
  }
});

test('the header (site-nav.js) offers exactly the configured languages, with the dictionary banner text', () => {
  const nav = readFileSync(join(ROOT, 'site-nav.js'), 'utf8');
  const langs = [...nav.matchAll(/\{ code: '(\w+)', name: '([^']+)', live: (true|false) \}/g)].map(m => ({ code: m[1], name: m[2], live: m[3] === 'true' }));
  assert.deepEqual(langs, conf.languages.map(l => ({ code: l.code, name: l.nativeName, live: l.live })), 'site-nav.js LANGS must match locales/languages.json');
  for (const l of conf.languages.filter(l => l.code !== 'en')) {
    const c = readArea(l.code, 'common.json');
    const m = nav.match(new RegExp(`${l.code}: \\['([^']+)', '([^']+)'\\]`));
    assert.ok(m, `site-nav.js BANNER missing ${l.code}`);
    assert.deepEqual([m[1], m[2]], [c['lang.banner.text'], c['lang.banner.switch']], `site-nav.js BANNER.${l.code} must match common.json`);
  }
});

test('every interface string a page uses in its scripts exists in English, and in each language that has the page', () => {
  for (const f of areas('en').filter(f => f.startsWith('page.'))) {
    const en = readArea('en', f);
    for (const lang of others) {
      if (!existsSync(join(ROOT, 'locales', lang, f))) continue;
      const tr = readArea(lang, f);
      const missing = Object.keys(en).filter(k => tr[k] == null);
      assert.deepEqual(missing, [], `${lang}/${f} is missing ${missing.length} strings`);
    }
  }
});
