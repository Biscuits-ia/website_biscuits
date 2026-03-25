// Service Worker pour Biscuits IA
// Version: 1.0.0

const CACHE_NAME = 'biscuits-ia-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Ressources à mettre en cache statique
const STATIC_ASSETS = [
  '/',
  '/assets/logo.png',
  '/assets/favicon.ico',
  '/assets/favicon.svg',
  '/assets/404.webp',
  '/assets/logos/helloassologo.webp',
  '/assets/logos/o2switch-logo.webp',
  '/assets/logos/solidatech.png',
  '/styles/global.css',
  '/styles/theme.css',
  '/scripts/contactForm.js'
];

// Stratégie de cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
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

  // Stratégie pour les ressources statiques
  if (STATIC_ASSETS.includes(request.url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // Stratégie pour les pages HTML
  if (request.destination === 'document') {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        });
      }).catch(() => {
        // Fallback vers la page d'accueil en cas d'erreur
        return caches.match('/');
      })
    );
    return;
  }

  // Stratégie pour les autres ressources (images, CSS, JS)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Vérifier l'âge de la ressource mise en cache
        const cacheDate = new Date(cached.headers.get('date'));
        const now = new Date();
        const age = (now.getTime() - cacheDate.getTime()) / 1000;
        
        // Si la ressource est vieille de plus de 1 heure, la rafraîchir en arrière-plan
        if (age > 3600) {
          fetch(request).then(response => {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }).catch(() => {
            // En cas d'erreur, garder la version mise en cache
          });
        }
        
        return cached;
      }
      
      return fetch(request).then(response => {
        const responseClone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, responseClone);
        });
        return response;
      });
    })
  );
});

// Notification push (optionnel)
self.addEventListener('push', (event) => {
  const options = {
    body: 'Nouvelle mise à jour disponible',
    icon: '/assets/logo.png',
    badge: '/assets/favicon.ico',
    tag: 'biscuits-ia-update',
    data: {
      url: '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification('Biscuits IA', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});