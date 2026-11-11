#!/usr/bin/env node
/* UniSkilled — prepares a page for translation by marking its text.
 *
 *   node scripts/i18n-mark.mjs index.html            # marks the page, writes locales/en/page.index.json
 *   node scripts/i18n-mark.mjs index.html --dry      # only reports what it would mark
 *
 * It reads the page with a real HTML parser (parse5) and inserts ` data-i18n="key"` and
 * ` data-i18n-attr="attr:key"` right after the tag name of each element that holds text. Nothing else
 * in the file changes, so removing the markers (the language build does this for English) gives back
 * the original file byte for byte. The tool checks that before writing.
 *
 * A "translation unit" is the highest element whose content is only text and inline elements
 * (a, b, strong, em, span, br, small, svg icons…). Its English (with the inline tags) goes to
 * locales/en/page.<name>.json; translators keep the same inline tags.
 * Text that cannot be marked without changing the page (loose text next to block elements) is
 * listed so it can be handled by hand.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse } from 'parse5';
import { stripMarkers } from './build-locales.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const INLINE = new Set(['a', 'b', 'strong', 'em', 'i', 'span', 'br', 'small', 'code', 'sup', 'sub', 'mark', 'u', 's', 'abbr',
  'time', 'wbr', 'svg', 'img', 'bdi', 'q', 'cite', 'kbd', 'del', 'ins', 'input', 'button', 'label']);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head', 'iframe', 'video', 'audio', 'canvas', 'textarea']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const ATTRS_SET = new Set(ATTRS);
const META_NAMES = /^(description|og:title|og:description|twitter:title|twitter:description)$/;
const hasWords = s => /\p{L}{2,}/u.test(s);
const BRAND_ONLY = /^\s*(UniSkilled|·|—|–|-|\||×|✕|✓|→|←|\d+|[€$£]\s?\d*)\s*$/u;

const textOf = n => n.nodeName === '#text' ? n.value : (n.childNodes || []).map(textOf).join('');
const isInlineOnly = n => (n.childNodes || []).every(c =>
  c.nodeName === '#text' || c.nodeName === '#comment' || (INLINE.has(c.nodeName) && (c.nodeName === 'svg' || c.nodeName === 'img' || c.nodeName === 'input' || isInlineOnly(c))));
const attr = (n, name) => (n.attrs || []).find(a => a.name === name);
// A block may not contain an element whose own attributes need translating (e.g. an input's
// placeholder): those are marked on that element, and must not be copied inside a block.
const hasAttrText = n => (n.childNodes || []).some(c => (c.attrs || []).some(a => ATTRS_SET.has(a.name) && /\p{L}{2,}/u.test(a.value)) || hasAttrText(c));

function slug(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().split(/\s+/).slice(0, 4).join('-').slice(0, 32) || 'text';
}

export function markPage(src, page) {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const units = [], attrs = [], loose = [];
  const used = new Set();
  const keyFor = (text) => {
    let k = `${page}.${slug(text.replace(/<[^>]+>/g, ' '))}`, i = 2;
    while (used.has(k)) k = `${page}.${slug(text.replace(/<[^>]+>/g, ' '))}-${i++}`;
    used.add(k); return k;
  };

  function visit(n, inUnit) {
    if (!n.childNodes && !n.attrs) return;
    const tag = n.nodeName;
    if (tag === 'title' && n.sourceCodeLocation) {
      const t = textOf(n);
      if (hasWords(t)) units.push({ node: n, key: `${page}.title`, en: src.slice(n.sourceCodeLocation.startTag.endOffset, n.sourceCodeLocation.endTag.startOffset) });
      used.add(`${page}.title`);
      return;
    }
    if (tag === 'meta' && n.sourceCodeLocation) {
      const nm = attr(n, 'name') || attr(n, 'property'), c = attr(n, 'content');
      if (nm && c && META_NAMES.test(nm.value) && hasWords(c.value)) attrs.push({ node: n, pairs: [['content', `${page}.meta.${nm.value.replace(/[^a-z]+/gi, '-')}`, c.value]] });
      return;
    }
    // Skipped elements' content is never translated, but a <textarea>'s own placeholder/title is.
    const skipInside = SKIP.has(tag) && tag !== 'head';
    if (skipInside && tag !== 'textarea') return;
    if (n.sourceCodeLocation && n.attrs) {
      const pairs = [];
      for (const a of ATTRS) {
        const v = attr(n, a);
        if (v && hasWords(v.value) && !BRAND_ONLY.test(v.value) && !/[{}$<>]/.test(v.value)) pairs.push([a, keyFor(v.value) + '.' + a.replace(/[^a-z]/g, ''), v.value]);
      }
      if (attr(n, 'data-i18n') || attr(n, 'data-i18n-attr')) return;   // already marked
      if (pairs.length) attrs.push({ node: n, pairs });
    }
    if (skipInside) return;
    if (!inUnit && n.sourceCodeLocation?.startTag && n.sourceCodeLocation.endTag && !INLINE_TOP_EXCLUDE.has(tag)) {
      const t = textOf(n);
      if (hasWords(t) && !BRAND_ONLY.test(t) && isInlineOnly(n) && !hasAttrText(n) && tag !== 'body' && tag !== 'html') {
        const en = src.slice(n.sourceCodeLocation.startTag.endOffset, n.sourceCodeLocation.endTag.startOffset);
        if (!/\$\{|\{\{/.test(en)) { units.push({ node: n, key: keyFor(t.trim()), en }); inUnit = true; }
      } else if (!isInlineOnly(n)) {
        for (const c of n.childNodes || []) if (c.nodeName === '#text' && hasWords(c.value)) loose.push(c.value.trim().slice(0, 60));
      }
    }
    for (const c of n.childNodes || []) visit(c, inUnit);
    if (n.content) visit(n.content, inUnit);
  }
  visit(doc, false);

  // Insert markers right after each tag name, from the end of the file backwards.
  const inserts = new Map();
  const at = n => n.sourceCodeLocation.startTag ? n.sourceCodeLocation.startTag.startOffset + 1 + n.tagName.length
                                                : n.sourceCodeLocation.startOffset + 1 + n.tagName.length;
  for (const u of units) inserts.set(at(u.node), (inserts.get(at(u.node)) || '') + ` data-i18n="${u.key}"`);
  for (const a of attrs) inserts.set(at(a.node), (inserts.get(at(a.node)) || '') + ` data-i18n-attr="${a.pairs.map(p => `${p[0]}:${p[1]}`).join(';')}"`);
  let out = src;
  for (const pos of [...inserts.keys()].sort((x, y) => y - x)) out = out.slice(0, pos) + inserts.get(pos) + out.slice(pos);

  const en = {};
  for (const u of units) en[u.key] = u.en.trim() === u.en ? u.en : u.en.trim();
  for (const a of attrs) for (const [, k, v] of a.pairs) en[k] = v;
  return { html: out, en, loose, units: units.length, attrs: attrs.reduce((s, a) => s + a.pairs.length, 0) };
}
// Never mark a whole <button>/<a> that sits inside an already-marked unit (handled by inUnit), and
// never treat these containers as a unit themselves.
const INLINE_TOP_EXCLUDE = new Set(['#document', '#document-fragment', 'html', 'body', 'main', 'section', 'header', 'footer', 'nav', 'article', 'aside', 'form', 'ul', 'ol', 'dl', 'table', 'tbody', 'thead', 'tr']);

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const file = process.argv[2];
  const dry = process.argv.includes('--dry');
  const page = basename(file, '.html');
  const src = readFileSync(join(ROOT, file), 'utf8');
  if (/\sdata-i18n(?:-attr)?="/.test(src)) { console.error(`${file} is already marked.`); process.exit(1); }
  const r = markPage(src, page);
  if (stripMarkers(r.html) !== src) { console.error('Removing the markers would not give back the original file. Nothing written.'); process.exit(1); }
  console.log(`${file}: ${r.units} text blocks + ${r.attrs} attributes marked.`);
  if (r.loose.length) console.log(`Loose text to handle by hand (${r.loose.length}):\n  ` + r.loose.join('\n  '));
  if (!dry) {
    writeFileSync(join(ROOT, file), r.html);
    const out = join(ROOT, 'locales/en', `page.${page}.json`);
    writeFileSync(out, JSON.stringify(r.en, null, 2) + '\n');
    console.log(`Wrote ${out}`);
  }
}
