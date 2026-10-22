// UniSkilled — load test (k6, https://k6.io). Simulates many visitors browsing at once:
// homepage → Find Tutors (reads public tutor data) → a tutor profile → platform settings.
// Read-only: it never signs in, books, pays or writes anything.
//
// Run it against STAGING, not production (it costs database capacity while it runs):
//   k6 run -e BASE=https://<staging-site> -e API=https://<staging-ref>.supabase.co -e KEY=<staging anon key> tests/load/browse.js
// or from GitHub: Actions → "Load test" → Run workflow.
//
// Pass/fail thresholds below are what "fine for real users" means for this site.
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE = __ENV.BASE || 'https://uniskilled.com';
const API = __ENV.API;
const KEY = __ENV.KEY;
const PEAK = Number(__ENV.PEAK || 50);

export const options = {
  stages: [
    { duration: '30s', target: Math.ceil(PEAK / 5) }, // warm up
    { duration: '1m', target: PEAK },                 // ramp to peak
    { duration: '2m', target: PEAK },                 // hold
    { duration: '30s', target: 0 },                   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],                  // fewer than 1% errors
    'http_req_duration{kind:page}': ['p(95)<1500'],  // 95% of pages under 1.5 s
    'http_req_duration{kind:api}': ['p(95)<800'],    // 95% of data requests under 0.8 s
  },
};

const apiHeaders = () => ({ headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, tags: { kind: 'api' } });

export default function () {
  group('homepage', () => {
    const r = http.get(`${BASE}/index.html`, { tags: { kind: 'page' } });
    check(r, { 'homepage 200': (x) => x.status === 200 });
  });
  sleep(1 + Math.random() * 2);

  let tutorId = null;
  group('find tutors', () => {
    const r = http.get(`${BASE}/find-tutors.html`, { tags: { kind: 'page' } });
    check(r, { 'find-tutors 200': (x) => x.status === 200 });
    if (API && KEY) {
      const t = http.get(`${API}/rest/v1/public_tutors?select=id,full_name,avatar_url,country&limit=24`, apiHeaders());
      check(t, { 'tutor list 200': (x) => x.status === 200 });
      try { const rows = t.json(); if (rows.length) tutorId = rows[Math.floor(Math.random() * rows.length)].id; } catch (_) { /* empty */ }
    }
  });
  sleep(1 + Math.random() * 3);

  group('tutor profile', () => {
    const r = http.get(`${BASE}/tutor-profile.html${tutorId ? `?id=${tutorId}` : ''}`, { tags: { kind: 'page' } });
    check(r, { 'profile 200': (x) => x.status === 200 });
    if (API && KEY && tutorId) {
      const p = http.get(`${API}/rest/v1/public_tutors?id=eq.${tutorId}&select=*`, apiHeaders());
      check(p, { 'profile data 200': (x) => x.status === 200 });
      const s = http.get(`${API}/functions/v1/get-platform-settings`, apiHeaders());
      check(s, { 'settings 200': (x) => x.status === 200 });
    }
  });
  sleep(2 + Math.random() * 3);
}
