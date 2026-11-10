// Right-to-left (Arabic) build: mirroring is correct, never touches program logic, never moves or
// breaks the logo, and never changes an English file.
// Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { tokenizer, parse } from 'acorn';
import { flipCss, flipDeclarations, swapDeclarations, flipScript, rtlPage, flipSharedScripts, HEADER_RTL } from '../../scripts/rtl.mjs';
import { writeLanguage, redirectStub, rootRelative } from '../../scripts/build-locales.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const ACORN = { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true };

test('stylesheets are mirrored', () => {
  assert.match(flipCss('.a{margin-left:8px;text-align:left;border-left:3px solid red}'), /margin-right:8px;text-align:right;border-right:3px solid red/);
  assert.match(flipCss('.a{padding:1px 2px 3px 4px}'), /padding:1px 4px 3px 2px/);
});

test('style="…" values are mirrored, untouched when nothing is sided', () => {
  assert.equal(flipDeclarations('color:red;font-weight:600'), 'color:red;font-weight:600');
  assert.match(flipDeclarations('margin-left:4px;color:red'), /margin-right:4px/);
  assert.match(flipDeclarations('margin:${a}px 0 0 8px'), /\$\{a\}px 8px 0 0/);
});

test('centred things (left:50%) stay where they are', () => {
  assert.equal(swapDeclarations('position:fixed;left:50%;transform:translateX(-50%)'), 'position:fixed;left:50%;transform:translateX(-50%)');
  assert.equal(swapDeclarations('left:50%;margin-left:-2px'), 'left:50%;margin-right:-2px');
});

test('scripts: only text strings change, never code', () => {
  const code = "var o={left:1,right:2};el.style.left=x+'px';var re=/['\"]/g;var s='<span style=\"margin-left:4px\">';var c='.x{border-left-color:red}';var t=`a ${b} padding-right:2px;`";
  const out = flipScript(code);
  assert.ok(out.startsWith("var o={left:1,right:2};el.style.left=x+'px';var re=/['\"]/g;"), out);
  assert.match(out, /margin-right:4px/);
  assert.match(out, /border-right-color:red/);
  assert.match(out, /padding-left:2px/);
  parse(out, ACORN);
});

test('plain words in messages are never changed ("left" without CSS around it)', () => {
  assert.equal(flipScript("alert('2 seats left: book now')"), "alert('2 seats left: book now')");
});

function nonStringTokens(code) {
  return [...tokenizer(code, ACORN)].filter(t => t.type.label !== 'string' && t.type.label !== 'template')
    .map(t => `${t.type.label}:${t.value ?? ''}`);
}

test('every script on the site still parses after mirroring, with identical code (only strings differ)', () => {
  const sources = [];
  for (const f of readdirSync(ROOT).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'))) sources.push([f, readFileSync(join(ROOT, f), 'utf8')]);
  for (const f of readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    const html = readFileSync(join(ROOT, f), 'utf8');
    let i = 0;
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/ld\+json|module/.test(m[1]) || !m[2].trim()) continue;
      sources.push([`${f} <script #${i++}>`, m[2]]);
    }
  }
  let changed = 0;
  for (const [name, code] of sources) {
    const out = flipScript(code);
    if (out === code) continue;
    changed++;
    assert.doesNotThrow(() => parse(out, ACORN), `${name} no longer parses`);
    assert.deepEqual(nonStringTokens(out), nonStringTokens(code), `${name}: code (not just text) changed`);
  }
  assert.ok(changed > 0, 'expected some scripts with styles to be mirrored');
});

const PAGE = '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<link rel="stylesheet" href="/fonts/fonts.css">\n' +
  '<style>.card{margin-left:12px}</style>\n</head>\n<body>\n' +
  '<header class="topbar"><a href="index.html"><img src="uniskilled-logo-sm.png?v=1" alt="UniSkilled"></a><a href="signin.html">دخول</a></header>\n' +
  '<p style="text-align:left">نص</p>\n<script src="/ui.js"></script>\n<script>var h=\'<b style="margin-left:2px">x</b>\';</script>\n</body>\n</html>\n';

test('a page is mirrored, the logo markup is untouched and its bar keeps the logo on the left', () => {
  const out = rtlPage(PAGE, { lang: 'ar', flippedScripts: new Set(['ui.js']) });
  assert.ok(out.includes('<header class="topbar"><a href="index.html"><img src="uniskilled-logo-sm.png?v=1" alt="UniSkilled"></a>'));
  assert.match(out, /\.card\{margin-right:12px\}/);
  assert.match(out, /style="text-align:right"/);
  assert.match(out, /<script src="\/ar\/ui\.js"><\/script>/);
  assert.match(out, /margin-right:2px/);
  assert.match(out, /<link rel="stylesheet" href="\/fonts\/arabic\.css">/);
  assert.ok(out.includes(HEADER_RTL));
  assert.match(HEADER_RTL, /\.snav\{direction:ltr\}/, 'shared header stays LTR so the logo stays left');
  assert.match(HEADER_RTL, /:has\(img\[src\*="uniskilled-logo"\]\)[^{]*\{direction:ltr\}/, 'other headers with the logo stay LTR');
});

test('the shared header script is never mirrored (logo stays left)', () => {
  const shared = { 'site-nav.js': readFileSync(join(ROOT, 'site-nav.js'), 'utf8'), 'ui.js': readFileSync(join(ROOT, 'ui.js'), 'utf8') };
  const out = flipSharedScripts(shared);
  assert.ok(!('site-nav.js' in out));
  assert.ok('ui.js' in out);
});

test('Arabic fonts: Arabic letters only, under the names the pages already use', () => {
  const css = readFileSync(join(ROOT, 'fonts/arabic.css'), 'utf8');
  for (const fam of ['Manrope', 'Plus Jakarta Sans', 'Lora', 'Fraunces', 'Playfair Display'])
    assert.ok(css.includes(`font-family: '${fam}'`), fam);
  for (const m of css.matchAll(/unicode-range: ([^;]+);/g)) assert.match(m[1], /^U\+0600-06FF/, 'Arabic range only');
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) assert.ok(existsSync(join(ROOT, 'fonts', m[1])), m[1]);
  const pages = readdirSync(ROOT).filter(f => f.endsWith('.html'));
  for (const p of pages) assert.ok(!readFileSync(join(ROOT, p), 'utf8').includes('arabic.css'), `${p}: English pages must not load the Arabic font`);
});

test('videos stay shared; script paths to them point at the site root', () => {
  const out = rootRelative(`<video poster="media/a.jpg"><source src="media/b.mp4"></video><style>.x{background:url(media/c.jpg)}</style><script>v.src='media/d.mp4'</script>`, new Set());
  assert.ok(!/["'(]media\//.test(out), out);
});

test('a language folder: shared files copied, untranslated pages send visitors to English, English untouched', () => {
  const site = mkdtempSync(join(tmpdir(), 'usk-rtl-'));
  const files = {
    'index.html': '<html><head><link rel="stylesheet" href="fonts/fonts.css"></head><body></body></html>',
    'legal.html': '<p>legal</p>', 'ui.js': "x='.t{border-left:1px solid}'", 'site-nav.js': "img='uniskilled-logo-white-sm.png'",
    'uniskilled-logo-white-sm.png': 'PNG', 'fonts/fonts.css': '/*f*/', 'media/v.mp4': 'MP4', 'CNAME': 'uniskilled.com',
  };
  for (const [f, c] of Object.entries(files)) { mkdirSync(join(site, f, '..'), { recursive: true }); writeFileSync(join(site, f), c); }
  const shared = { 'ui.js': files['ui.js'], 'site-nav.js': files['site-nav.js'] };
  writeLanguage({ site, lang: 'ar', dir: 'rtl', pages: ['index.html', 'legal.html'], ready: new Set(['index.html']),
    results: { 'index.html': '<html lang="ar" dir="rtl"><head><link rel="stylesheet" href="fonts/fonts.css"></head><body></body></html>' }, shared });
  for (const [f, c] of Object.entries(files)) assert.equal(readFileSync(join(site, f), 'utf8'), c, `English ${f} changed`);
  assert.ok(existsSync(join(site, 'ar/uniskilled-logo-white-sm.png')), 'logo must exist inside the language folder');
  assert.ok(existsSync(join(site, 'ar/fonts/fonts.css')));
  assert.ok(!existsSync(join(site, 'ar/media')), 'videos are not copied');
  assert.ok(!existsSync(join(site, 'ar/CNAME')));
  assert.equal(readFileSync(join(site, 'ar/site-nav.js'), 'utf8'), files['site-nav.js'], 'header script not mirrored');
  assert.match(readFileSync(join(site, 'ar/ui.js'), 'utf8'), /border-right/);
  assert.equal(readFileSync(join(site, 'ar/legal.html'), 'utf8'), redirectStub('legal.html'));
  assert.match(redirectStub('legal.html'), /location\.replace\("\/legal\.html"\+location\.search\+location\.hash\)/);
  assert.match(readFileSync(join(site, 'ar/index.html'), 'utf8'), /href="\/fonts\/arabic\.css"/);
});
