/* Narrator service worker.

   The app shell is fetched with cache:'reload' so it bypasses the browser's
   HTTP cache. Without that, GitHub Pages' Cache-Control: max-age=600 means a
   freshly deployed index.html can keep serving stale for ten minutes — and the
   installed app, which always goes through this worker, never sees the update.

   Icons stay cache-first. Audio is never touched here; it lives in IndexedDB.

   Bump CACHE on every release. Changing these bytes is what makes the browser
   notice there is a new worker at all. */
const CACHE = 'narrator-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u =>
        fetch(new Request(u, { cache: 'reload' }))
          .then(r => (r.ok ? c.put(u, r) : null))
          .catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const isShell = req.mode === 'navigate' ||
                  req.url.endsWith('.html') ||
                  req.url.endsWith('/') ||
                  req.url.endsWith('manifest.json');

  if (isShell) {
    // network first, HTTP cache bypassed, cache only as the offline fallback
    e.respondWith(
      fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req.url, copy));
          }
          return res;
        })
        .catch(() => caches.match(req.url).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});