// Service Worker pour Biscuits IA
// Version: 4.0.0
// Strategie: stale-while-revalidate pour les pages publiques, bypass strict
// pour les extensions navigateur, les schemes non http(s), les API, l'auth
// et tout ce qui sort du perimetre du site.
//
// FIX 4.0 : le `cache.put` peut recevoir des reponses dont l'URL cible un
// scheme non http(s) (ex: `chrome-extension://...` injecte par certaines
// extensions via BroadcastChannel postMessage). On revérifie protocole,
// same-origin, type de réponse et statut AVANT le put, et on swallow
// toute exception résiduelle via .catch() pour ne jamais casser le
// handler fetch du SW.

// Le nom du cache est incremente a chaque changement de PRECACHE_URLS :
// `cache.addAll` est atomique, une seule URL en 404 ferait echouer tout le
// lot, et les clients existants garderaient sinon l'ancienne liste.
const CACHE_NAME = 'biscuits-ia-v5';
const RUNTIME_CACHE = 'biscuits-ia-runtime-v5';
const PRECACHE_URLS = ['/', '/og-default.webp', '/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name).catch(() => undefined))
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
  '/verifier-code-',
  '/reinitialisation',
  '/mot-de-passe-',
];

function isHttpProtocol(protocol) {
  return protocol === 'http:' || protocol === 'https:';
}

function safeParseRequestUrl(request) {
  try {
    return new URL(request.url);
  } catch {
    return null;
  }
}

function isHttpRequest(request) {
  const url = safeParseRequestUrl(request);
  return !!url && isHttpProtocol(url.protocol);
}

function isSameOrigin(url) {
  return !!url && url.origin === self.location.origin;
}

function isNonCacheable(pathname) {
  return NON_CACHEABLE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function safeCachePut(cache, request, response) {
  // Le `Cache.put` exige une URL http(s) same-origin et un body lisible.
  // On revérifie tout avant d'écrire pour absorber les cas pathologiques
  // (extensions navigateur, redirects opaques, blob: invalides...).
  try {
    const reqUrl = safeParseRequestUrl(request);
    const resUrl = safeParseRequestUrl(response);
    if (!reqUrl || !resUrl) return;
    if (!isHttpProtocol(reqUrl.protocol) || !isHttpProtocol(resUrl.protocol)) return;
    if (reqUrl.origin !== self.location.origin) return;
    if (response.status !== 200 || response.type !== 'basic') return;
    cache.put(request, response.clone()).catch(() => undefined);
  } catch {
    /* swallow: ne jamais casser le fetch handler */
  }
}

function trimCache(cache, maxEntries) {
  cache.keys().then((keys) => {
    if (keys.length > maxEntries) {
      cache.delete(keys[0]).catch(() => undefined);
    }
  }).catch(() => undefined);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Bypass: requetes non GET, schemes non http(s), origines externes,
  // requetes chrome-extension, tracking, analytics.
  // Note: on parse l'URL via safeParseRequestUrl : un scheme inconnu
  // (chrome-extension://, file://...) renvoie null et on bypass.
  if (request.method !== 'GET') return;
  if (!isHttpRequest(request)) return;
  const url = safeParseRequestUrl(request);
  if (!url) return;
  if (!isSameOrigin(url)) return;
  if (isNonCacheable(url.pathname)) return;

  // Stale-while-revalidate pour le contenu public
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response) {
              safeCachePut(cache, request, response);
              trimCache(cache, 50);
            }
            return response;
          })
          .catch(() => cached || new Response('offline', { status: 503 }));
        return cached || fetchPromise;
      })
    ).catch(() => fetch(request))
  );
});