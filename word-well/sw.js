/* Word Well service worker — offline-first app shell + PWA icon serving.
 *
 * The PNG icons live as base64 bundles in icons/icon-data.js (the GitHub push
 * path is text-only, so binaries ride along as text and are decoded here).
 * Bump CACHE on every push so installed apps pick up updates.
 */
importScripts('icons/icon-data.js');

const CACHE = 'word-well-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'style.css?v=3',
  'words.js',
  'ladder.js',
  'game.js?v=2',
  'icons/icon.svg',
];

const ICON_PATHS = {
  '/icons/icon-180.png': '180',
  '/icons/icon-192.png': '192',
  '/icons/icon-512.png': '512',
  '/icons/icon-512-maskable.png': '512-maskable',
};

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function iconKeyFor(pathname) {
  for (const p in ICON_PATHS) {
    if (pathname.endsWith(p)) return ICON_PATHS[p];
  }
  return null;
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;

  const iconKey = iconKeyFor(url.pathname);
  if (iconKey && self.WW_ICONS && self.WW_ICONS[iconKey]) {
    e.respondWith(
      new Response(b64ToBytes(self.WW_ICONS[iconKey]), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          })
          .catch(() => caches.match('index.html'))
    )
  );
});
