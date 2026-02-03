// Service Worker optimisé pour Lighthouse 100
// Version 2026 avec meilleures pratiques

const CACHE_VERSION = 'v2026.1';
const CACHE_NAMES = {
  static: `static-${CACHE_VERSION}`,
  dynamic: `dynamic-${CACHE_VERSION}`,
  images: `images-${CACHE_VERSION}`,
};

// Assets à mettre en cache immédiatement
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/assets/logo.webp',
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...', event);
  
  event.waitUntil(
    caches.open(CACHE_NAMES.static).then((cache) => {
      console.log('[SW] Precaching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Force l'activation immédiate
      return self.skipWaiting();
    })
  );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...', event);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            // Supprime les anciens caches
            return !Object.values(CACHE_NAMES).includes(cacheName);
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      // Prend le contrôle immédiatement
      return self.clients.claim();
    })
  );
});

// Stratégies de cache
const strategies = {
  // Cache First (pour assets statiques)
  cacheFirst: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    try {
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      console.error('[SW] Cache First error:', error);
      return new Response('Offline', { status: 503 });
    }
  },
  
  // Network First (pour pages HTML)
  networkFirst: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    
    try {
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      
      // Page offline de fallback
      return caches.match('/offline');
    }
  },
  
  // Stale While Revalidate (pour API)
  staleWhileRevalidate: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    });
    
    return cached || fetchPromise;
  },
};

// Gestion des requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignore les requêtes non-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignore les requêtes Chrome extension
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Stratégie selon le type de ressource
  if (request.destination === 'image') {
    // Cache First pour images
    event.respondWith(strategies.cacheFirst(request, CACHE_NAMES.images));
  } else if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font'
  ) {
    // Cache First pour CSS/JS/Fonts
    event.respondWith(strategies.cacheFirst(request, CACHE_NAMES.static));
  } else if (request.destination === 'document' || url.pathname.endsWith('.html')) {
    // Network First pour pages HTML
    event.respondWith(strategies.networkFirst(request, CACHE_NAMES.dynamic));
  } else if (url.pathname.startsWith('/api/')) {
    // Stale While Revalidate pour API
    event.respondWith(strategies.staleWhileRevalidate(request, CACHE_NAMES.dynamic));
  } else {
    // Par défaut: Network First
    event.respondWith(strategies.networkFirst(request, CACHE_NAMES.dynamic));
  }
});

// Gestion des messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    caches.open(CACHE_NAMES.dynamic).then((cache) => {
      cache.addAll(event.data.urls);
    });
  }
});

// Background Sync (pour actions offline)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-forms') {
    event.waitUntil(syncForms());
  }
});

async function syncForms() {
  // Synchronise les formulaires en attente
  const cache = await caches.open('forms-pending');
  const requests = await cache.keys();
  
  return Promise.all(
    requests.map(async (request) => {
      try {
        await fetch(request.clone());
        await cache.delete(request);
      } catch (error) {
        console.error('[SW] Sync error:', error);
      }
    })
  );
}

// Push Notifications (optionnel)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nouvelle notification',
    icon: '/assets/icon-192.png',
    badge: '/assets/badge-72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: 'explore',
        title: 'Voir',
      },
      {
        action: 'close',
        title: 'Fermer',
      },
    ],
  };
  
  event.waitUntil(
    self.registration.showNotification('Biscuits IA', options)
  );
});

// Click sur notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});