/* Study Campus service worker. Registered only by studyhq.html with scope "/studyhq", so it controls
 * Study Campus pages and nothing else on uniskilled.com. It keeps a copy of Study Campus's own files so the
 * page opens offline (notes written offline wait on the device and sync later). It never touches
 * requests to other sites (Supabase, payments, analytics) and never caches API responses. */
var CACHE = 'studyhq-v4';
var SHELL = ['studyhq.html', 'studyhq.js', 'studyhq-logic.js', 'studyhq-sky.js', 'studyhq-skin-garden.js', 'studyhq.webmanifest',
  'site.css', 'ui.js', 'site-nav.js', 'supabase-config.js', 'vendor/supabase-js/2.39.3/supabase.js', 'fonts/fonts.css'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('studyhq-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;           // other sites: untouched
  var path = url.pathname.replace(/^\//, '');
  if (SHELL.indexOf(path) === -1) return;                                             // only Study Campus's own files
  // Network first so updates arrive at once; the cached copy is used only when offline.
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
});
