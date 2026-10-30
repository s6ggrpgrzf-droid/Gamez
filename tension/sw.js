/* Tension service worker — the shell, cached for offline play.
   Bump SHELL whenever the game's assets change, or the cache will
   keep serving the old build. Worker calls (daily boards, locklore)
   are never cached: the game's own fallbacks carry it offline. */
const SHELL = 'tn-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sim.js?v=20261030c',
  './render.js?v=20261030c',
  './audio.js?v=20261030c',
  './font-fraunces.css?v=20261030c',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // worker API: network only
  e.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
