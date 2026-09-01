/* Service worker minimal : coquille hors-ligne (cache des fichiers statiques). */
const CACHE = 'hacklab-v1';
const CORE = ['/', '/index.html', '/style.css', '/app.js', '/vendor/xterm.js', '/vendor/xterm.css', '/vendor/xterm-addon-fit.js', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // On ne touche jamais à l'API, au terminal ni aux cibles proxifiées.
  if (req.method !== 'GET' || url.origin !== location.origin ||
      url.pathname.startsWith('/api') || url.pathname.startsWith('/terminal') || url.pathname.startsWith('/target')) {
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('/')))
  );
});
