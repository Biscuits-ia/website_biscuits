// Service Worker pour Biscuits IA
// Version: 3.0.0
// Strategie: stale-while-revalidate pour les pages publiques, bypass strict
// pour les extensions navigateur, les schemes non-http(s), les API, l'auth
// et tout ce qui sort du perimetre du site.

const CACHE_NAME = 'biscuits-ia-v3';
const RUNTIME_CACHE = 'biscuits-ia-runtime-v3';
const PRECACHE_URLS = ['/', '/og-default.webp', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

const NON_CACHEABLE_PREFIXES = [
  '/api/',
  '/auth/',
  '/dashboard/',
  '/connexion',
  '/inscription',
  '/utilisateurs',
  '/trombinoscope',
  '/verifier-code-',
  '/reinitialisation',
  '/mot-de-passe-',
];

function isHttpRequest(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNonCacheable(pathname) {
  return NON_CACHEABLE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass: requetes non GET, schemes non http(s), origines externes,
  // requetes chrome-extension, tracking, analytics
  if (request.method !== 'GET') return;
  if (!isHttpRequest(url)) return;
  if (!isSameOrigin(url)) return;
  if (isNonCacheable(url.pathname)) return;

  // Stale-while-revalidate pour le contenu public
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              cache.put(request, response.clone());
              cache.keys().then((keys) => {
                if (keys.length > 50) cache.delete(keys[0]);
              });
            }
            return response;
          })
          .catch(() => cached || new Response('offline', { status: 503 }));
        return cached || fetchPromise;
      })
    )
  );
});