/* Hutch service worker — offline app shell.
   No user financial data is ever cached or transmitted; the app state
   lives only in the page's encrypted IndexedDB, never here.
   STRATEGY: network-first for the page itself (so deployed fixes reach
   buyers immediately), cache-first for fonts/icons/manifest (speed),
   with the cached shell as the offline fallback. */
const CACHE = "hutch-shell-v7";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
// fonts are EMBEDDED in index.html as data: URIs (truly single-file, and
// immune to file:// font-loading restrictions); nothing external, ever

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  const isPage = e.request.mode === "navigate" ||
    (u.origin === self.location.origin && (u.pathname.endsWith("/index.html") || u.pathname.endsWith("/")));
  if (isPage) {
    // network-first: always try for the freshest app, fall back to cache offline
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }
  // everything else: cache-first (fonts, icons, manifest)
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const cacheable = u.origin === self.location.origin;
      if (res && res.ok && cacheable) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
