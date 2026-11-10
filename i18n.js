/* UniSkilled — interface translation runtime (no dependencies, ~3 KB minified).

   How text gets translated
   ------------------------
   • Text written in a page's HTML is translated when the site is BUILT (scripts/build-locales.mjs):
     each language folder (/de/, /ar/, …) gets finished HTML. Nothing here runs for that text.
   • Text that pages build in JavaScript calls this file:
         I18N.t('booking.sent', 'Request sent to {{tutor}}', { tutor: name })      → plain text
         I18N.h('booking.sent', 'Request sent to <b>{{tutor}}</b>', { tutor: name }) → HTML-safe
     The English wording is written right there in the code, so English pages never need a
     dictionary and can never show a raw key. Other languages read the dictionary the build
     inlines into the page as window.__I18N = { lang, dict }.
   • Plurals: pass { count } and give the English as { one: '…', other: '…' }. Each language's
     dictionary holds the forms its grammar needs (Arabic: zero, one, two, few, many, other).
   • Missing translation → the English text is shown and reported once to Sentry (if loaded).

   English stays exactly as before: for 'en' every formatter below uses the browser default the
   pages already used (toLocaleDateString([]…)), so dates and numbers on English pages do not change.

   Loaded as a classic script; exposes window.I18N. Nothing here touches payments or sign-in. */
(function (root) {
  'use strict';

  // Keep in step with locales/languages.json (tests/i18n_checks.mjs fails if they differ).
  var LANGS = {
    en: { dir: 'ltr', intl: null },               // null = browser default, exactly as pages did before
    de: { dir: 'ltr', intl: 'de-DE' },
    ar: { dir: 'rtl', intl: 'ar-u-nu-latn' },     // Western digits 0–9 (decision 4, 10 Nov 2026)
    tr: { dir: 'ltr', intl: 'tr-TR' },
    fr: { dir: 'ltr', intl: 'fr-FR' },
    es: { dir: 'ltr', intl: 'es-ES' },
    qps: { dir: 'ltr', intl: 'en-GB', pseudo: true } // test-only pseudo-language, never published
  };
  var DEFAULT = 'en';
  var PREF_KEY = 'uniskilled_lang';

  var boot = root.__I18N || {};
  var lang = LANGS[boot.lang] ? boot.lang : DEFAULT;
  try {
    // Test hook only: ?i18n=qps shows the pseudo-language so leftover English is easy to spot.
    if (/[?&]i18n=qps\b/.test(root.location && root.location.search || '')) lang = 'qps';
  } catch (e) {}
  var dict = (lang !== DEFAULT && boot.dict && typeof boot.dict === 'object') ? boot.dict : {};
  var conf = LANGS[lang];
  var reported = {};

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function report(key) {
    if (reported[key]) return;
    reported[key] = 1;
    try {
      if (root.Sentry && typeof root.Sentry.captureMessage === 'function') {
        root.Sentry.captureMessage('i18n: missing "' + key + '" for ' + lang, 'warning');
      }
    } catch (e) {}
  }

  var pluralRules = {};
  function pluralForm(l, n) {
    var tag = (LANGS[l] && LANGS[l].intl) || 'en';
    try {
      if (!pluralRules[tag]) pluralRules[tag] = new Intl.PluralRules(tag);
      return pluralRules[tag].select(n);
    } catch (e) { return n === 1 ? 'one' : 'other'; }
  }

  function pick(entry, l, vars) {
    if (entry && typeof entry === 'object') {
      var n = vars && typeof vars.count === 'number' ? vars.count : NaN;
      var form = isNaN(n) ? 'other' : pluralForm(l, n);
      // Arabic uses 'zero' only when the dictionary spells it; Intl returns 'zero' for 0 in ar.
      return entry[form] != null ? entry[form] : entry.other;
    }
    return entry;
  }

  // ASCII → accented look-alikes, wrapped in ⟦ ⟧ and ~30% longer (German-length test).
  var PSEUDO = { a: 'á', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ĺ', m: 'ṁ',
    n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
    A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'É', F: 'Ƒ', G: 'Ğ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ĺ', M: 'Ṁ',
    N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž' };
  function pseudo(s) {
    // Leave {{placeholders}} and HTML tags untouched.
    var out = String(s).replace(/(\{\{[^}]*\}\}|<[^>]+>|&[a-z#0-9]+;)|([A-Za-z])/g, function (m, keep, ch) {
      return keep || PSEUDO[ch] || ch;
    });
    var pad = Math.ceil(String(s).replace(/\{\{[^}]*\}\}|<[^>]+>/g, '').length * 0.3);
    return '⟦' + out + (pad ? ' ' + new Array(pad + 1).join('·') : '') + '⟧';
  }

  function fill(template, vars, escapeVars) {
    return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (m, name) {
      if (!vars || !(name in vars)) return m;
      return escapeVars ? esc(vars[name]) : String(vars[name] == null ? '' : vars[name]);
    });
  }

  function resolve(key, en, vars) {
    if (conf.pseudo) return pseudo(pick(en, 'en', vars));
    if (lang !== DEFAULT) {
      var entry = dict[key];
      if (entry != null) {
        var v = pick(entry, lang, vars);
        if (v != null && v !== '') return v;
      }
      report(key);
    }
    return pick(en, 'en', vars);
  }

  /** Plain text (for textContent, attributes set via setAttribute, alerts, document.title). */
  function t(key, en, vars) { return fill(resolve(key, en, vars), vars, false); }

  /** HTML-safe: values are escaped; the template itself is trusted (it comes from our own files). */
  function h(key, en, vars) { return fill(resolve(key, en, vars), vars, true); }

  // ---- Formatting: dates, times, numbers, money -----------------------------------------------
  function locales() { return conf.intl ? [conf.intl] : []; }   // [] = browser default (English as before)
  function toDate(d) { return d instanceof Date ? d : new Date(d); }

  function date(d, opts) { return toDate(d).toLocaleDateString(locales(), opts); }
  function time(d, opts) { return toDate(d).toLocaleTimeString(locales(), opts); }
  function dateTime(d, opts) { return toDate(d).toLocaleString(locales(), opts); }
  function number(n, opts) { return Number(n).toLocaleString(locales(), opts); }

  /** Money in the reader's language: de → "25,00 €", fr → "25,00 €", ar → "‏25.00 €", en-GB → "€25.00". */
  function money(amount, currency, opts) {
    var o = { style: 'currency', currency: String(currency || 'EUR').toUpperCase() };
    for (var k in opts || {}) o[k] = opts[k];
    try { return new Intl.NumberFormat(conf.intl || 'en-GB', o).format(Number(amount)); }
    catch (e) { return (o.currency === 'USD' ? '$' : '€') + Number(amount).toFixed(2); }
  }

  /** A language's name written in the reader's language, e.g. name('ar') on a German page → "Arabisch". */
  function languageName(code, inLang) {
    var l = inLang || lang;
    try { return new Intl.DisplayNames([(LANGS[l] && LANGS[l].intl) || 'en'], { type: 'language' }).of(code); }
    catch (e) { return code; }
  }

  // ---- Language URLs and the visitor's choice -------------------------------------------------
  /** The same page in another language: path('de', 'find-tutors.html?x=1') → '/de/find-tutors.html?x=1'. */
  function path(target, page) {
    var p = String(page == null ? (root.location.pathname.split('/').pop() || 'index.html') + root.location.search + root.location.hash : page);
    p = p.replace(/^\/+/, '').replace(/^(?:de|ar|tr|fr|es)\//, '');
    return (target === DEFAULT ? '/' : '/' + target + '/') + p;
  }

  function saved() {
    try { var v = root.localStorage.getItem(PREF_KEY); return LANGS[v] && !LANGS[v].pseudo ? v : null; }
    catch (e) { return null; }
  }
  function save(l) {
    try { if (LANGS[l] && !LANGS[l].pseudo) root.localStorage.setItem(PREF_KEY, l); } catch (e) {}
  }

  /** First supported language in the browser's own list (never IP/location). Null if none. */
  function browserPreference(available) {
    var list = [];
    try { list = (root.navigator.languages && root.navigator.languages.length) ? root.navigator.languages : [root.navigator.language]; } catch (e) {}
    for (var i = 0; i < list.length; i++) {
      var base = String(list[i] || '').toLowerCase().split('-')[0];
      if (available ? available.indexOf(base) !== -1 : (LANGS[base] && !LANGS[base].pseudo)) return base;
    }
    return null;
  }

  root.I18N = {
    lang: lang,
    dir: conf.dir,
    t: t,
    h: h,
    esc: esc,
    date: date,
    time: time,
    dateTime: dateTime,
    number: number,
    money: money,
    languageName: languageName,
    path: path,
    saved: saved,
    save: save,
    browserPreference: browserPreference,
    _langs: LANGS
  };
})(typeof window !== 'undefined' ? window : globalThis);
