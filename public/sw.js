// Minimal service worker whose only job is to satisfy PWA installability
// checks — several browsers require a controlling service worker with a
// fetch handler before they'll offer "Add to Home Screen"/"Install app".
//
// It intentionally does NOT cache anything. This app renders someone's
// real GPS history; a caching service worker would leave copies of that
// data (API responses, rendered pages) sitting in Cache Storage on disk
// even after the person signs out. Every request just passes straight
// through to the network, so there's no offline mode and nothing here
// to clear on logout.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
