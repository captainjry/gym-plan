// Bump APP_VERSION on every deploy → new shell cache → page shows "Update available".
const APP_VERSION = '4';
const SHELL = `gp-shell-${APP_VERSION}`;
const RUNTIME = 'gp-runtime'; // RepDB JSON/images + fonts: kept across app versions (offline pictures)
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'manifest.webmanifest',
  'history.js', 'plan.js', 'explore.js', 'history.css', 'plan.css', 'explore.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'plans/upperlower.json', 'plans/ppl.json'];

// No skipWaiting here: a new version waits until the user taps the update bar.
self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))) /* bypass HTTP cache (Pages max-age=600) */)));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function cacheFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}
async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    return (await c.match(req, { ignoreSearch: true })) || Response.error();
  }
}
async function swr(req, cacheName, e) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/plans/')) return e.respondWith(networkFirst(req, SHELL)); // plan updates detectable
    const r = req.mode === 'navigate' ? new Request('index.html') : req;
    e.respondWith(cacheFirst(r, SHELL)); // shell is pinned to this APP_VERSION
  } else if (url.hostname === 'exercise-dataset.com') {
    e.respondWith(url.pathname.endsWith('.json') ? swr(req, RUNTIME, e) : cacheFirst(req, RUNTIME));
  } else if (url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, RUNTIME));
  } else if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(swr(req, RUNTIME, e));
  }
});
