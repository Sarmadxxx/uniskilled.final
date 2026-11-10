/* UniSkilled — the languages a person speaks or teaches in (NOT the website language).
 *
 * One fixed list of language codes (ISO 639), each with a level. Names are shown in the reader's
 * language by the browser itself (Intl.DisplayNames), so "ar" reads "Arabic" on English pages,
 * "Arabisch" on German pages and "العربية" on Arabic pages. Nothing here is free text, so it can be
 * filtered reliably and shown safely.
 *
 *   const picker = USKLangs.mount(el, { value: [{ code: 'ar', level: 'native' }], required: true });
 *   picker.get()        → [{ code, level }]
 *   USKLangs.name('ar') → 'Arabic'
 *   USKLangs.list([{code:'ar'},{code:'en'}]) → 'Arabic, English'
 *   await USKLangs.load(client, userIds) → { userId: [{ code, level }] }
 *   await USKLangs.save(client, rows)   // the signed-in person's own list only
 */
(function (root) {
  'use strict';

  // Europe, the Middle East and North Africa first in mind, plus the most widely spoken others.
  var CODES = ['en', 'ar', 'de', 'fr', 'es', 'tr', 'it', 'pt', 'nl', 'pl', 'ro', 'el', 'cs', 'sk', 'hu', 'sv', 'da', 'no',
    'fi', 'ru', 'uk', 'bg', 'hr', 'sr', 'bs', 'sl', 'sq', 'mk', 'lt', 'lv', 'et', 'ga', 'fa', 'ku', 'ckb', 'ur', 'hi',
    'bn', 'pa', 'ta', 'zh', 'ja', 'ko', 'vi', 'th', 'id', 'ms', 'tl', 'sw', 'am', 'so', 'ha', 'yo', 'he', 'hy', 'ka',
    'az', 'uz', 'kk', 'ps', 'ber'];
  var LEVELS = ['native', 'fluent', 'conversational'];
  var EN_LEVEL = { native: 'Native', fluent: 'Fluent', conversational: 'Conversational' };

  function T(key, en, vars) { return root.I18N ? root.I18N.t(key, en, vars) : en.replace(/\{\{(\w+)\}\}/g, function (m, k) { return vars && k in vars ? vars[k] : m; }); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uiLocale() {
    var l = (root.I18N && root.I18N.lang) || 'en';
    var map = { en: 'en', de: 'de', ar: 'ar', tr: 'tr', fr: 'fr', es: 'es' };
    return map[l] || 'en';
  }
  var namer = null;
  function name(code) {
    try { namer = namer || new Intl.DisplayNames([uiLocale()], { type: 'language' }); var n = namer.of(code); if (n && n !== code) return n; } catch (e) {}
    return code === 'ber' ? 'Berber' : code;
  }
  function levelLabel(l) { return T('langs.level.' + l, EN_LEVEL[l] || l); }
  function valid(code) { return CODES.indexOf(code) !== -1; }
  function clean(rows) {
    var seen = {}, out = [];
    (rows || []).forEach(function (r) {
      var c = String(r && r.code || r && r.lang || '').toLowerCase();
      if (!valid(c) || seen[c]) return;
      seen[c] = 1;
      out.push({ code: c, level: LEVELS.indexOf(r.level) !== -1 ? r.level : 'fluent' });
    });
    return out;
  }
  function list(rows) { return clean(rows).map(function (r) { return name(r.code); }).join(', '); }

  var CSS = '.ulp{display:flex;flex-direction:column;gap:8px}' +
    '.ulp-row{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}' +
    '.ulp-row b{flex:1;min-width:0;font-weight:600;font-size:.92rem;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ulp-row select{height:38px;border:1px solid #cbd5e1;border-radius:8px;padding:0 8px;font:inherit;font-size:.86rem;background:#fff;color:#0f172a}' +
    '.ulp-x{width:38px;height:38px;flex:none;border:0;background:none;border-radius:8px;color:#64748b;font-size:1.05rem;cursor:pointer}' +
    '.ulp-x:hover,.ulp-x:focus-visible{background:#f1f5f9;color:#0f172a}' +
    '.ulp-add{height:42px;border:1px dashed #94a3b8;border-radius:10px;padding:0 10px;font:inherit;font-size:.9rem;background:#f8fafc;color:#1e3a8a;width:100%}' +
    '.ulp-empty{font-size:.85rem;color:#64748b;margin:0}';
  function ensureCss() {
    if (document.getElementById('ulp-css')) return;
    var s = document.createElement('style'); s.id = 'ulp-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function mount(el, opts) {
    opts = opts || {};
    ensureCss();
    var rows = clean(opts.value);
    var onChange = opts.onChange || function () {};
    function render() {
      var chosen = {};
      rows.forEach(function (r) { chosen[r.code] = 1; });
      var options = CODES.filter(function (c) { return !chosen[c]; })
        .map(function (c) { return [c, name(c)]; })
        .sort(function (a, b) { return a[1].localeCompare(b[1], uiLocale()); })
        .map(function (p) { return '<option value="' + p[0] + '">' + esc(p[1]) + '</option>'; }).join('');
      el.innerHTML = '<div class="ulp">' +
        (rows.length ? '' : '<p class="ulp-empty">' + esc(T('langs.none', 'No languages added yet.')) + '</p>') +
        rows.map(function (r, i) {
          var n = name(r.code);
          return '<div class="ulp-row" data-i="' + i + '"><b>' + esc(n) + '</b>' +
            '<select aria-label="' + esc(T('langs.levelFor', 'Level for {{language}}', { language: n })) + '">' +
            LEVELS.map(function (l) { return '<option value="' + l + '"' + (l === r.level ? ' selected' : '') + '>' + esc(levelLabel(l)) + '</option>'; }).join('') +
            '</select><button type="button" class="ulp-x" aria-label="' + esc(T('langs.remove', 'Remove {{language}}', { language: n })) + '">✕</button></div>';
        }).join('') +
        '<select class="ulp-add" aria-label="' + esc(T('langs.add', 'Add a language')) + '"><option value="">' + esc('+ ' + T('langs.add', 'Add a language')) + '</option>' + options + '</select>' +
        '</div>';
    }
    el.addEventListener('change', function (e) {
      if (e.target.classList.contains('ulp-add')) {
        var c = e.target.value;
        if (valid(c)) { rows.push({ code: c, level: rows.length ? 'fluent' : 'native' }); render(); onChange(rows.slice()); var a = el.querySelector('.ulp-add'); if (a) a.focus(); }
        return;
      }
      var row = e.target.closest('.ulp-row');
      if (row && e.target.tagName === 'SELECT') { rows[+row.getAttribute('data-i')].level = e.target.value; onChange(rows.slice()); }
    });
    el.addEventListener('click', function (e) {
      var x = e.target.closest('.ulp-x'); if (!x) return;
      rows.splice(+x.closest('.ulp-row').getAttribute('data-i'), 1); render(); onChange(rows.slice());
      var a = el.querySelector('.ulp-add'); if (a) a.focus();
    });
    render();
    return {
      get: function () { return rows.map(function (r) { return { code: r.code, level: r.level }; }); },
      set: function (v) { rows = clean(v); render(); }
    };
  }

  /** Languages for several people at once (tutors' are public; anyone else's only for themselves). */
  function load(client, userIds) {
    var ids = (userIds || []).filter(Boolean);
    if (!ids.length || !client) return Promise.resolve({});
    return client.from('user_languages').select('user_id,lang,level,position').in('user_id', ids)
      .order('position', { ascending: true }).then(function (res) {
        var out = {};
        (res.data || []).forEach(function (r) { (out[r.user_id] = out[r.user_id] || []).push({ code: r.lang, level: r.level }); });
        return out;
      }, function () { return {}; });
  }

  /** Replace the signed-in person's own list, all or nothing (database function set_my_languages). */
  function save(client, rows) {
    return client.rpc('set_my_languages', { p_langs: clean(rows) }).then(function (res) { return { error: res.error || null }; });
  }

  root.USKLangs = { CODES: CODES, LEVELS: LEVELS, mount: mount, name: name, list: list, clean: clean, levelLabel: levelLabel, load: load, save: save };
})(typeof window !== 'undefined' ? window : globalThis);
