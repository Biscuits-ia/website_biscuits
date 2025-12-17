const CACHE_NAME = 'biscuits-dev-v1';
const urlsToCache = [
  '/',
  '/styles/global.css',
  '/hero-tech.webp',
  '/logo.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});