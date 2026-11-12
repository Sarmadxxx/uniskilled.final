#!/usr/bin/env node
/* UniSkilled — sitemap.xml generator.
 *
 * Writes sitemap.xml = the fixed public pages + every tutor profile that is complete enough to index.
 * Run by .github/workflows/sitemap.yml once a day (and on demand from the Actions tab).
 *
 *   node scripts/build-sitemap.mjs                      # live: reads tutors from Supabase
 *   node scripts/build-sitemap.mjs --data tutors.json   # offline test: [{id, subjects, bio}]
 *
 * Only public data is read, with the same publishable (anon) key every page already ships.
 * Suspended tutors are excluded automatically (public_tutors filters them out).
 *
 * Languages: every page that is fully translated in a live language (locales/languages.json) is
 * listed in each language, with <xhtml:link hreflang> links between the versions (+ x-default =
 * English). The same check as the website build decides whether a translated page exists.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadLanguages, loadDictionary, translatePage, pageScriptKeys, pageUrl } from './build-locales.mjs';

const SITE = 'https://uniskilled.com';
const SUPABASE_URL = 'https://orghkbbohnabcietidiv.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2hrYmJvaG5hYmNpZXRpZGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzcwMTMsImV4cCI6MjA5MjcxMzAxM30.3bOnZuga8a4xY4mbKdgLnw6EwAV5UuQDz26JI_vM-u8';

// Tutor accounts to keep out of the sitemap even when complete (e.g. internal test accounts).
// Use the full user id from Supabase.
const EXCLUDE_TUTOR_IDS = new Set([
]);

// Public, indexable pages. Private/app pages are never listed here (they are noindexed and in robots.txt).
const STATIC_PAGES = [
  { path: '/',                    file: 'index.html',          changefreq: 'weekly',  priority: '1.0' },
  { path: '/find-tutors.html',    file: 'find-tutors.html',    changefreq: 'daily',   priority: '0.9' },
  { path: '/group-sessions.html', file: 'group-sessions.html', changefreq: 'daily',   priority: '0.8' },
  { path: '/courses.html',        file: 'courses.html',        changefreq: 'daily',   priority: '0.8' },
  { path: '/about.html',          file: 'about.html',          changefreq: 'monthly', priority: '0.7' },
  { path: '/onboarding.html',     file: 'onboarding.html',     changefreq: 'monthly', priority: '0.6' },
  { path: '/legal.html',          file: 'legal.html',          changefreq: 'yearly',  priority: '0.3' },
];

// Same rule as applyTutorSeo() in tutor-profile.html — keep the two in sync.
export function isCompleteProfile(t) {
  const subjects = Array.isArray(t.subjects) ? t.subjects.filter(s => String(s || '').trim()) : [];
  return subjects.length > 0 && String(t.bio || '').trim().length >= 50;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lastCommitDate(file) {
  try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' }).trim() || null; }
  catch { return null; }
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${path} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function loadTutors() {
  const i = process.argv.indexOf('--data');
  if (i !== -1) return JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
  // public_tutors = non-suspended tutors with their public user bio; tutor_profiles holds subjects + tutor bio.
  const [people, profiles] = await Promise.all([
    rest('public_tutors?select=id,bio'),
    rest('tutor_profiles?select=user_id,subjects,bio'),
  ]);
  const byId = new Map(profiles.map(p => [p.user_id, p]));
  return people.map(u => {
    const tp = byId.get(u.id) || {};
    return { id: u.id, subjects: tp.subjects, bio: (tp.bio || '').trim() || u.bio || '' };
  });
}

const tutors = (await loadTutors())
  .filter(t => t.id && !EXCLUDE_TUTOR_IDS.has(t.id) && isCompleteProfile(t))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

// Course pages: only courses at least one active tutor has passed (pages without tutors are noindexed).
async function loadCourses() {
  if (process.argv.includes('--data')) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_courses`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_query: null, p_limit: 200 }),
  });
  if (!res.ok) throw new Error(`Supabase list_courses → HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).filter(c => c.course_key && c.tutor_count > 0).map(c => c.course_key).sort();
}
const courses = await loadCourses();

// Which live languages each page exists in (fully translated), always English first.
const conf = loadLanguages();
const live = conf.languages.filter(l => l.live && l.code !== conf.default);
const dicts = Object.fromEntries(live.map(l => [l.code, loadDictionary(l.code)]));
const langsCache = {};
export function languagesOf(file) {
  if (langsCache[file]) return langsCache[file];
  const src = readFileSync(file, 'utf8');
  const out = [conf.default];
  if (/\sdata-i18n(?:-attr)?="/.test(src)) for (const l of live) {
    const r = translatePage(src, dicts[l.code], { lang: l.code, dir: l.dir, inlineKeys: pageScriptKeys(l.code, file, src) });
    if (!r.missing.length) out.push(l.code);
  }
  return (langsCache[file] = out);
}

// One <url> per language version, each listing all versions (Google needs the full set on every entry).
function entries(file, query, tail) {
  const langs = languagesOf(file);
  const at = l => esc(pageUrl(l, file, conf.default) + query);
  const links = langs.length > 1
    ? langs.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${at(l)}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${at(conf.default)}"/>`
    : '';
  return langs.map(l => `  <url><loc>${at(l)}</loc>${links}${tail}</url>`);
}

const urls = STATIC_PAGES.flatMap(p => {
  const lm = lastCommitDate(p.file);
  return entries(p.file, '', `${lm ? `<lastmod>${lm}</lastmod>` : ''}<changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority>`);
}).concat(tutors.flatMap(t =>
  entries('tutor-profile.html', `?id=${encodeURIComponent(t.id)}`, '<changefreq>weekly</changefreq><priority>0.7</priority>')
)).concat(courses.flatMap(k =>
  entries('course.html', `?c=${encodeURIComponent(k)}`, '<changefreq>weekly</changefreq><priority>0.6</priority>')
));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
writeFileSync('sitemap.xml', xml);
console.log(`sitemap.xml: ${STATIC_PAGES.length} pages + ${tutors.length} tutor profile(s) + ${courses.length} course page(s); ${urls.length} addresses in ${[conf.default, ...live.map(l => l.code)].join(', ')}`);
