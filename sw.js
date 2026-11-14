const CACHE_NAME = 'moneylog-cache-v48';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './css/style.css',
  './main.js',
  './card.js',
  './queryDexie.js',
  './favicon.ico',
  './icons/icon-192.png',
  './libs/dexie.mjs',
  './libs/echarts.min.js',
  './libs/flatpickr.min.css',
  './libs/flatpickr.js',
  './libs/flatpickr_it.js'
];

self.addEventListener('install', event => {
  const requests = APP_SHELL.map(path => new Request(
    new URL(path, self.registration.scope), { cache: 'reload' }
  ));
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(requests))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('moneylog-cache-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;

  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const url = request.mode === 'navigate'
      ? new URL('./index.html', self.registration.scope).href
      : request;
    return (await cache.match(url)) || fetch(request);
  }));
});
