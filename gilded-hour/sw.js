/* =====================================================================
   THE GILDED HOUR — PARTY-PROOF SHELL (service worker)
   After one online visit, the whole show loads and plays offline.

   SCOPE: this file lives in the gilded-hour directory, so its default
   (and maximum) scope IS that directory — a service worker can never
   govern pages above its own folder without a Service-Worker-Allowed
   header, which this static host does not send. The hub and every
   sibling game sit outside the fence by construction.

   CACHE COUPLING — READ THIS BEFORE BUMPING ANYTHING:
   BUILD below must match the game.js cache-bust in index.html
   (game.js?v=80 <-> BUILD 74). Whenever a future pass bumps the
   ?v= busts in index.html, bump BUILD here to the new game.js
   number in the same commit. The cache name carries BUILD, so a
   bumped build installs into a fresh cache and activate deletes
   the old one — no stale shell can survive its own build.

   UPDATE STRATEGY (no stale-forever trap):
   - Navigations are NETWORK-FIRST: when the network answers, the
     fresh page is served (and re-cached); the cache is only the
     offline fallback.
   - The shell assets are versioned by their ?v= URLs, so a new
     build asks for new URLs; cache-first on an exact URL can never
     hand an old file to a new build, and a miss is filled from the
     network and runtime-cached.
   - The browser re-checks this file on navigation; a changed sw.js
     installs alongside, skipWaiting + clients.claim take over, and
     activate sweeps every older gilded-hour cache.
   ===================================================================== */
"use strict";

var BUILD = 82; /* == the game.js?v= bust in index.html — keep coupled */
var CACHE = "gilded-hour-shell-v" + BUILD;
var PREFIX = "gilded-hour-shell-";

/* The complete shell — the page requests exactly these same-origin
   files at load and nothing else (audited: the display font is a
   data: URI inside style.css; every illustration is inline SVG).
   The three *.workers.dev endpoints are gameplay-time fetches that
   fail soft in the game itself; they are cross-origin, are never
   touched by this worker, and are deliberately NOT precached. */
var PRECACHE = [
  "./",
  "index.html",
  "style.css?v=86",
  "questions.js?v=7",
  "qr.js?v=1",
  "game.js?v=82"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (n) {
          if (n.indexOf(PREFIX) === 0 && n !== CACHE) return caches.delete(n);
          return null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                       /* posts pass through */
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        /* workers.dev etc.: untouched */

  if (req.mode === "navigate") {
    /* Network-first: a reachable new build is always the fresh one;
       the cache answers only when the network cannot. */
    e.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) {
            c.put("index.html", copy.clone());
            c.put("./", copy);
          });
        }
        return resp;
      }).catch(function () {
        return caches.match("index.html", { ignoreSearch: true })
          .then(function (hit) { return hit || caches.match("./", { ignoreSearch: true }); });
      })
    );
    return;
  }

  /* Versioned shell assets: cache-first on the exact URL (the ?v=
     bust makes a stale hit impossible for a new build); a miss is
     fetched, runtime-cached, and — offline with only an older bust
     in the cache — the older copy beats a hole in the show. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true });
      });
    })
  );
});
