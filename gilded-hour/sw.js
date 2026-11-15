/* =====================================================================
   THE GILDED HOUR — KILL WORKER (Review Pass 7, 2026-11-14)

   The Party-Proof Shell is retired: the show plays ONLINE ONLY.
   This file exists for one job — reaching browsers that still hold
   a registration from the shell era and standing it down cleanly:

   - install: skipWaiting, so the kill lands on the first check-in.
   - activate: delete every cache in the shell's own family
     ("gilded-hour-shell-*"), unregister this registration, then
     navigate every open client back to its own URL so the page it
     is looking at reloads from the network, worker-free.
   - no fetch handler, ever: this worker serves nothing.

   The sweep is PREFIX-SCOPED on purpose. Caches are origin-wide,
   and this origin hosts every sibling game on the hub; their
   caches are theirs and are never touched here. Scope stays this
   directory by this file's location, exactly as the shell's was.

   The page side helps from the other direction: index.html no
   longer registers anything and carries a small cleanup that
   unregisters a lingering registration and sweeps the same cache
   family, so a browser is reached whichever check-in comes first.
   Once both have run, nothing about this file matters any more —
   it stays in the repo as the standing answer to any old
   registration that comes looking for sw.js.
   ===================================================================== */
"use strict";

var PREFIX = "gilded-hour-shell-";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (n) {
          if (n.indexOf(PREFIX) === 0) return caches.delete(n);
          return null;
        }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) {
        clients.forEach(function (c) {
          if (c.url && typeof c.navigate === "function") {
            try { c.navigate(c.url); } catch (err) { /* a closing tab owes nothing */ }
          }
        });
      })
  );
});
