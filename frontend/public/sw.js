const CACHE_NAME = 'maintenance-calendar-v2';
const OFFLINE_FALLBACK = '/index.html';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      // No skipWaiting here: the user is told a new build is ready and chooses
      // when to reload, so a technician never loses the form they are typing.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/**
 * The outbox lives in the page (it holds the session token), so the sync event
 * cannot replay writes itself. It asks the open clients to flush instead.
 */
async function flushOutbox() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage({ type: 'FLUSH_OUTBOX' });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'mcc-outbox') event.waitUntil(flushOutbox());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API reads are cached in the page layer, where they can be scoped to the
  // signed-in user; caching them here would leak across sessions.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a successful shell response so it can be replayed when the
          // server is unreachable or returns a non-ok status (e.g. 404 on a
          // client route that the Express SPA fallback hasn't caught yet).
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_FALLBACK, copy));
            return response;
          }
          // Server returned non-ok (e.g. 404). Serve the cached shell instead
          // so React Router can take over on the client side.
          return caches.match(OFFLINE_FALLBACK).then((cached) => cached || response);
        })
        .catch(() =>
          caches.match(OFFLINE_FALLBACK).then((cached) => {
            if (cached) return cached;
            // Ultimate fallback so a navigation never resolves to an empty
            // response (which the browser treats as a network error).
            return new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Maintenance Calendar</title></head><body><div id="root"></div><script src="/index.html"></script></body></html>',
              { status: 200, headers: { 'content-type': 'text/html' } },
            );
          })
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(OFFLINE_FALLBACK).then((cached) => cached || new Response(null, { status: 204 })));
    })
  );
});
