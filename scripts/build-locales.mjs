#!/usr/bin/env node
/* UniSkilled — builds the language versions of the website.
 *
 *   node scripts/build-locales.mjs --site _site            # after the normal (Jekyll) build
 *   node scripts/build-locales.mjs --site _site --preview  # also build languages not yet live
 *   node scripts/build-locales.mjs --site _site --rtl-preview index.html,find-tutors.html --out /tmp/rtl
 *        # mirrored (right-to-left) copies of English pages, for checking layouts; never published
 *
 * What it does, in order:
 *   1. English pages: removes the translation markers (data-i18n…) so every English file is
 *      byte-for-byte what it was before the markers were added. Nothing else in English changes.
 *   2. For each language in locales/languages.json that is live (or every language with --preview):
 *      writes /<lang>/<page>.html for each page whose marked text is FULLY translated in that
 *      language. A page with any missing text is not written (visitors get the English page),
 *      so Google never sees English under /de/ and nobody sees half-translated pages.
 *   3. Languages not live yet are written with <meta name="robots" content="noindex"> and are
 *      not linked from anywhere.
 *
 * Marking text in a page (done page by page from stage 4 on):
 *   <h1 data-i18n="home.hero.title">Find a tutor who has taken your exact course</h1>
 *   <input data-i18n-attr="placeholder:find.search.placeholder" placeholder="Search a subject">
 *   <meta name="description" data-i18n-attr="content:home.meta.description" content="…">
 * The English stays in the HTML; the key points at the translation in locales/<lang>/*.json.
 *
 * The logo is never touched: its <img>/<a> carry no markers, and in Arabic it stays on the left
 * (CSS keeps .snav-logo / [data-keep-ltr] in place; see locales/languages.json logoStaysLeft).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rtlPage, flipSharedScripts } from './rtl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- small helpers -----------------------------------------------------------------------
export function loadLanguages(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'locales/languages.json'), 'utf8'));
}

export function loadDictionary(lang, root = ROOT) {
  const dir = join(root, 'locales', lang);
  const dict = {};
  if (!existsSync(dir)) return dict;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const part = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const [k, v] of Object.entries(part)) {
      if (k.startsWith('_')) continue;
      if (k in dict) throw new Error(`Duplicate key "${k}" in locales/${lang}/${f}`);
      dict[k] = v;
    }
  }
  return dict;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

// Markers are always written as ` data-i18n="…"` / ` data-i18n-attr="…"` (one leading space,
// double quotes). Removing exactly that restores the original bytes.
const MARKER_RE = / data-i18n(?:-attr)?="[^"]*"/g;
export function stripMarkers(html) { return html.replace(MARKER_RE, ''); }

/** Find the element that starts at `start` (its opening tag) and return [openEnd, closeStart, closeEnd]. */
function elementBounds(html, start, tag) {
  const openEnd = html.indexOf('>', start) + 1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = openEnd;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [openEnd, m.index, m.index + m[0].length];
  }
  return null;
}

/**
 * Translate one HTML page. Returns { html, missing: [keys], used: [keys] }.
 * dict = the target language's dictionary; lang/dir = target language.
 */
export function translatePage(source, dict, { lang, dir, robots, inlineKeys = [] }) {
  let html = source;
  const missing = new Set(), used = new Set();
  const lookup = key => {
    used.add(key);
    const v = dict[key];
    if (v == null || v === '' || typeof v === 'object') { missing.add(key); return null; }
    return v;
  };

  // 1) Attributes: data-i18n-attr="placeholder:key;aria-label:key2"
  html = html.replace(/<[a-zA-Z][^>]*\sdata-i18n-attr="([^"]*)"[^>]*>/g, (tagText, spec) => {
    let out = tagText;
    for (const pair of spec.split(';').map(s => s.trim()).filter(Boolean)) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      const v = lookup(key);
      if (v == null) continue;
      const attrRe = new RegExp(`(\\s${attr.replace(/[-]/g, '\\-')}=")[^"]*(")`);
      out = attrRe.test(out) ? out.replace(attrRe, `$1${escAttr(v)}$2`) : out;
    }
    return out;
  });

  // 2) Element text: <tag data-i18n="key">English</tag> → translation (may contain inline <b>, <a>…
  //    only when the English did; translators keep the same tags, checked by tests).
  const openRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>/g;
  let result = '', last = 0, m;
  while ((m = openRe.exec(html))) {
    const [openTag, tag, key] = m;
    const bounds = elementBounds(html, m.index, tag);
    if (!bounds) throw new Error(`Unclosed <${tag} data-i18n="${key}">`);
    const v = lookup(key);
    result += html.slice(last, bounds[0]) + (v == null ? html.slice(bounds[0], bounds[1]) : v);
    last = bounds[1];
    openRe.lastIndex = bounds[1];
  }
  html = result + html.slice(last);

  // 3) Language and direction on <html>
  html = html.replace(/<html\b([^>]*)>/i, (all, attrs) => {
    let a = attrs.replace(/\s(lang|dir)="[^"]*"/g, '');
    return `<html lang="${lang}" dir="${dir}"${a}>`;
  });

  // 4) Robots for languages not live yet
  if (robots && !/<meta name="robots"/i.test(html)) {
    html = html.replace(/<head>/i, `<head>\n<meta name="robots" content="${robots}">`);
  }

  // 5) Dictionary for text built in JavaScript (only the keys this page's scripts use)
  const jsDict = {};
  for (const k of inlineKeys) if (dict[k] != null) jsDict[k] = dict[k];
  const boot = `<script>window.__I18N=${JSON.stringify({ lang, dict: jsDict }).replace(/</g, '\\u003c')};</script>`;
  html = html.replace(/<\/head>/i, `${boot}\n</head>`);

  return { html: stripMarkers(html), missing: [...missing], used: [...used] };
}

/** Pages under /de/ etc. load shared files from the site root, and link to English pages that have no translation. */
export function rootRelative(html, translatedPages) {
  // Videos and their posters are shared by all languages (not copied into language folders).
  // Covers CSS url(media/…) and paths written in scripts ("media/…", 'media/…', `media/…`).
  html = html.replace(/(url\(\s*['"]?|['"`])media\//g, '$1/media/');
  return html.replace(/(\s(?:src|href)=")(?![a-z]+:|\/|#|\{|\$)([^"]+)"/gi, (all, pre, url) => {
    const file = url.split(/[?#]/)[0];
    if (extname(file) === '.html' && translatedPages.has(file)) return all; // stays inside the language folder
    return `${pre}/${url}"`;
  });
}

/** Keys that a page's own JavaScript passes to I18N.t / I18N.h (literal first arguments only). */
export function scriptKeys(html, sharedScripts = {}) {
  const keys = new Set();
  const grab = code => { for (const m of code.matchAll(/I18N\.[th]\(\s*['"]([\w.-]+)['"]/g)) keys.add(m[1]); };
  grab(html);
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"?#]+)/g)) if (sharedScripts[m[1]]) grab(sharedScripts[m[1]]);
  return [...keys];
}

// ---------- the build ---------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

export function build({ site, preview = false, root = ROOT, log = console.log }) {
  const conf = loadLanguages(root);
  const codes = conf.languages.map(l => l.code);
  const pages = readdirSync(site).filter(f => f.endsWith('.html')).sort();   // top-level pages only
  const shared = {};
  for (const f of readdirSync(site).filter(f => f.endsWith('.js'))) shared[f] = readFileSync(join(site, f), 'utf8');

  // 1) English: strip markers in place (no-op when a page has none).
  let englishChanged = 0;
  for (const p of walk(site).filter(f => f.endsWith('.html') && !codes.some(c => relative(site, f).startsWith(c + '/')))) {
    const src = readFileSync(p, 'utf8');
    const out = stripMarkers(src);
    if (out !== src) { writeFileSync(p, out); englishChanged++; }
  }
  // 2) Other languages
  const report = {};
  for (const L of conf.languages) {
    if (L.code === conf.default) continue;
    if (!L.live && !preview) continue;
    const dict = loadDictionary(L.code, root);
    const sources = Object.fromEntries(pages.map(p => [p, readFileSync(join(root, p), 'utf8')]));
    const ready = new Set(), skipped = {};
    const results = {};
    for (const p of pages) {
      const src = sources[p];
      if (!/\sdata-i18n(?:-attr)?="/.test(src)) continue;          // page not prepared for translation yet
      const r = translatePage(src, dict, {
        lang: L.code, dir: L.dir,
        robots: L.live ? null : 'noindex, nofollow',
        inlineKeys: scriptKeys(src, shared),
      });
      if (r.missing.length) { skipped[p] = r.missing; continue; }
      ready.add(p); results[p] = r.html;
    }
    writeLanguage({ site, lang: L.code, dir: L.dir, pages, ready, results, shared });
    report[L.code] = { live: !!L.live, pages: [...ready], skipped };
    log(`${L.code}: ${ready.size} page(s) written${L.live ? '' : ' (hidden, noindex)'}; ${Object.keys(skipped).length} skipped for missing text`);
  }
  log(`en: ${englishChanged} page(s) had markers removed; every English file is otherwise untouched`);
  return report;
}

/** Files a language folder needs besides its pages: a copy of every shared file (scripts, images,
 *  fonts, styles) so that paths a script builds relative to the page (e.g. the logo in site-nav.js)
 *  work inside /de/, /ar/ … exactly as at the root. Videos (media/) are shared, not copied. */
const NOT_MIRRORED = /^(media\/|CNAME$|sitemap\.xml$|robots\.txt$|i18n-build-report\.json$)/;
export function mirrorStatic(site, lang, codes) {
  let n = 0;
  for (const f of walk(site)) {
    const rel = relative(site, f);
    if (rel.endsWith('.html') || NOT_MIRRORED.test(rel) || codes.some(c => rel === c || rel.startsWith(c + '/'))) continue;
    const out = join(site, lang, rel);
    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(f, out); n++;
  }
  return n;
}

/** A page not translated yet: /de/<page> sends the visitor to the English page, keeping ?query and #hash. */
export function redirectStub(page) {
  const target = '/' + page;
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="robots" content="noindex">\n' +
    `<link rel="canonical" href="https://uniskilled.com${target}">\n` +
    `<script>location.replace(${JSON.stringify(target)}+location.search+location.hash);</script>\n` +
    `<meta http-equiv="refresh" content="0; url=${target}">\n<title>UniSkilled</title>\n</head>\n<body></body>\n</html>\n`;
}

/** Write one language folder: shared files, translated pages (mirrored for right-to-left), stubs for the rest. */
export function writeLanguage({ site, lang, dir, pages, ready, results, shared, codes = ['en', 'de', 'ar', 'tr', 'fr', 'es'] }) {
  if (!ready.size) return;
  mirrorStatic(site, lang, codes);
  let flipped = {};
  if (dir === 'rtl') {
    flipped = flipSharedScripts(shared);
    for (const [name, code] of Object.entries(flipped)) writeFileSync(join(site, lang, name), code);
  }
  for (const p of pages) {
    const out = join(site, lang, p);
    if (!ready.has(p)) { writeFileSync(out, redirectStub(p)); continue; }
    let page = rootRelative(results[p], ready);
    if (dir === 'rtl') page = rtlPage(page, { lang, flippedScripts: new Set(Object.keys(flipped)) });
    writeFileSync(out, page);
  }
}

/** Mirrored copies of English pages (English text, Arabic layout) for checking; written to outDir/ar/. */
export function rtlPreview({ site, pages, outDir, lang = 'ar' }) {
  // Works on a copy so the source folder is never written to.
  for (const f of walk(site)) {
    const rel = relative(site, f);
    if (/^(\.git|node_modules|db|supabase|tests|scripts|locales|test-results|playwright-report)\//.test(rel)) continue;
    mkdirSync(dirname(join(outDir, rel)), { recursive: true });
    copyFileSync(f, join(outDir, rel));
  }
  const all = readdirSync(outDir).filter(f => f.endsWith('.html')).sort();
  const shared = {};
  for (const f of readdirSync(outDir).filter(f => f.endsWith('.js'))) shared[f] = readFileSync(join(outDir, f), 'utf8');
  const results = {};
  for (const p of pages) {
    const html = stripMarkers(readFileSync(join(outDir, p), 'utf8'));
    results[p] = html.replace(/<html\b([^>]*)>/i, (a, attrs) => `<html lang="${lang}" dir="rtl"${attrs.replace(/\s(lang|dir)="[^"]*"/g, '')}>`);
  }
  writeLanguage({ site: outDir, lang, dir: 'rtl', pages: all, ready: new Set(pages), results, shared });
  return Object.keys(flipSharedScripts(shared));
}

// ---------- CLI ---------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const site = args[args.indexOf('--site') + 1];
  if (!site || !existsSync(site)) { console.error('Usage: node scripts/build-locales.mjs --site <built site dir> [--preview]'); process.exit(2); }
  if (args.includes('--rtl-preview')) {
    const pages = args[args.indexOf('--rtl-preview') + 1].split(',');
    const outDir = args[args.indexOf('--out') + 1];
    const flipped = rtlPreview({ site, pages, outDir });
    console.log(`RTL preview of ${pages.length} page(s) in ${outDir}/ar/ (mirrored scripts: ${flipped.join(', ') || 'none'})`);
  } else {
    const report = build({ site, preview: args.includes('--preview') });
    writeFileSync(join(site, '..', 'i18n-build-report.json'), JSON.stringify(report, null, 2));
  }
}
