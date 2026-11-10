#!/usr/bin/env node
/* UniSkilled — compares a built site with what uniskilled.com serves right now.
 *
 *   node scripts/compare-live.mjs --site _site [--allow-changes] [--base https://uniskilled.com]
 *
 * Every English file in the build (everything outside the language folders) is downloaded from the
 * live site and compared byte for byte. Any difference stops the publish unless --allow-changes is
 * given (used only for a release you approved that is meant to change English).
 * Files that are new in the build (not live yet) are listed, not treated as errors.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const site = args[args.indexOf('--site') + 1];
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'https://uniskilled.com';
const allow = args.includes('--allow-changes');
const langs = JSON.parse(readFileSync('locales/languages.json', 'utf8')).languages.map(l => l.code).filter(c => c !== 'en');

function walk(dir) {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const sha = b => createHash('sha256').update(b).digest('hex');

const files = walk(site).map(p => relative(site, p)).filter(p => !langs.some(l => p.startsWith(l + '/')) && p !== 'CNAME');
const changed = [], added = [], failed = [];
let i = 0;
async function worker() {
  while (i < files.length) {
    const f = files[i++];
    try {
      const res = await fetch(`${base}/${f.split('/').map(encodeURIComponent).join('/')}`, { headers: { 'cache-control': 'no-cache' } });
      if (res.status === 404) { added.push(f); continue; }
      if (!res.ok) { failed.push(`${f} (HTTP ${res.status})`); continue; }
      const live = Buffer.from(await res.arrayBuffer());
      if (sha(live) !== sha(readFileSync(join(site, f)))) changed.push(f);
    } catch (e) { failed.push(`${f} (${e.message})`); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

console.log(`Compared ${files.length} English files with ${base}.`);
if (added.length) console.log(`New files (not live yet, fine): ${added.sort().join(', ')}`);
if (failed.length) console.log(`Could not download: ${failed.sort().join(', ')}`);
if (changed.length) {
  console.log(`DIFFERENT from the live site: ${changed.sort().join(', ')}`);
  if (!allow) {
    console.log('::error::English files differ from the live site. Not publishing. (Use "allow changes" only for an approved release.)');
    process.exit(1);
  }
  console.log('Allowed: this release was approved to change the files above.');
} else {
  console.log('Every English file is identical to the live site.');
}
if (failed.length) process.exit(1);
