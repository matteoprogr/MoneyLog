const CACHE_NAME = 'moneylog-cache-v19';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css?v=19',
  '/main.js?v=19',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/libs/dexie.mjs',
  '/libs/echarts.min.js',
  '/libs/flatpickr.min.css',
  '/libs/flatpickr.js',
  '/libs/flatpickr_it.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);

        return response || fetchPromise;
      })
    )
  );
});
