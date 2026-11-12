// Search engines: translated pages name their own address and list every live language version;
// English pages are not changed (their language links are in sitemap.xml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seoTags, pageUrl } from '../../scripts/build-locales.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('pageUrl: English at the root, other languages in their folder, home page as /', () => {
  assert.equal(pageUrl('en', 'index.html'), 'https://uniskilled.com/');
  assert.equal(pageUrl('ar', 'index.html'), 'https://uniskilled.com/ar/');
  assert.equal(pageUrl('ar', 'find-tutors.html'), 'https://uniskilled.com/ar/find-tutors.html');
});

test('seoTags: canonical and og:url point at the translated page, with hreflang for each version', () => {
  const html = '<head>\n<link rel="canonical" href="https://uniskilled.com/courses.html">\n<meta property="og:url" content="https://uniskilled.com/courses.html">\n</head>';
  const out = seoTags(html, { lang: 'ar', page: 'courses.html', langs: ['en', 'ar'] });
  assert.match(out, /<link rel="canonical" href="https:\/\/uniskilled\.com\/ar\/courses\.html">/);
  assert.match(out, /<meta property="og:url" content="https:\/\/uniskilled\.com\/ar\/courses\.html">/);
  assert.match(out, /hreflang="en" href="https:\/\/uniskilled\.com\/courses\.html"/);
  assert.match(out, /hreflang="ar" href="https:\/\/uniskilled\.com\/ar\/courses\.html"/);
  assert.match(out, /hreflang="x-default" href="https:\/\/uniskilled\.com\/courses\.html"/);
});

test('seoTags: pages without their own canonical (private pages, other addresses) are left alone', () => {
  const none = '<head><title>x</title></head>';
  assert.equal(seoTags(none, { lang: 'ar', page: 'messages.html', langs: ['en', 'ar'] }), none);
  const other = '<head><link rel="canonical" href="https://uniskilled.com/">\n</head>';
  assert.equal(seoTags(other, { lang: 'ar', page: 'signin-old.html', langs: ['en', 'ar'] }), other);
});

test('robots.txt: every private page is also kept out of search in the language folders', () => {
  const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  for (const m of robots.matchAll(/^Disallow: \/([\w-]+\.html)$/gm)) assert.ok(robots.includes('Disallow: /*/' + m[1]), m[1]);
});
