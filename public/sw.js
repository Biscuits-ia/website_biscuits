// Service Worker pour Biscuits IA
// Version: 2.0.0

const CACHE_NAME = 'biscuits-ia-v2';

// Stratégie de cache : network-first avec fallback
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Mettre en cache la page d'accueil
        return cache.addAll(['/']);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ne pas intercepter les requêtes POST
  if (request.method !== 'GET') {
    return;
  }

  // Stratégie network-first pour tout
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cloner la réponse pour la mettre en cache
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Fallback en cas d'erreur réseau
        if (request.destination === 'document') {
          // Pour les pages HTML, fallback vers la page d'accueil
          return caches.match('/').then(cached => {
            if (cached) return cached;
            throw new Error('Aucune page de secours disponible');
          });
        }
        // Pour les autres ressources, échouer (pas de cache)
        throw new Error('Requête échouée');
      })
  );
});
