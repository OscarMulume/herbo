// Service Worker Herbo — cache-first assets + network-first navigation
const CACHE_STATIC  = 'herbo-static-v1';
const CACHE_DYNAMIC = 'herbo-dynamic-v1';
const PRECACHE = [
  '/herbo/',
  '/herbo/icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(
        ks.filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigation: network-first
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/herbo/'))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_DYNAMIC).then(c => c.put(request, clone));
        }
        return resp;
      });
    })
  );
});
