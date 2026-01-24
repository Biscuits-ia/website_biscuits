
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE_NAME = `biscuits-ia-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `biscuits-ia-dynamic-${CACHE_VERSION}`;
const API_CACHE_NAME = `biscuits-ia-api-${CACHE_VERSION}`;

// Liste des fichiers statiques à mettre en cache lors de l'installation
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/global.css',
  '/css/theme.css',
  '/js/app.js',
  '/js/main.js',
  '/manifest.json'
];

// Durée de validité du cache API (en millisecondes)
const API_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// INSTALLATION DU SERVICE WORKER
// ============================================================================
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation en cours...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Mise en cache des fichiers statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Installation terminée');
        // Force l'activation immédiate sans attendre
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Erreur lors de l\'installation:', error);
      })
  );
});

// ============================================================================
// ACTIVATION DU SERVICE WORKER
// ============================================================================
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation en cours...');
  
  event.waitUntil(
    // Nettoyer les anciens caches
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Supprimer tous les caches qui ne correspondent pas à la version actuelle
              return cacheName.startsWith('biscuits-ia-') && 
                     !cacheName.includes(CACHE_VERSION);
            })
            .map((cacheName) => {
              console.log('[Service Worker] Suppression ancien cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activation terminée');
        // Prendre le contrôle immédiat de toutes les pages
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('[Service Worker] Erreur lors de l\'activation:', error);
      })
  );
});

// ============================================================================
// INTERCEPTION DES REQUÊTES (FETCH)
// ============================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-HTTP/HTTPS
  if (!request.url.startsWith('http')) {
    return;
  }

  // Stratégie selon le type de requête
  if (isApiRequest(url)) {
    // REQUÊTES API : Network First avec fallback cache
    event.respondWith(networkFirstStrategy(request));
  } else if (isStaticAsset(url)) {
    // FICHIERS STATIQUES : Cache First avec mise à jour en arrière-plan
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // AUTRES REQUÊTES : Stratégie par défaut (Cache First)
    event.respondWith(cacheFirstStrategy(request));
  }
});

// ============================================================================
// STRATÉGIES DE CACHE
// ============================================================================

/**
 * Cache First Strategy
 * Sert depuis le cache si disponible, sinon réseau
 * Met à jour le cache en arrière-plan
 */
async function cacheFirstStrategy(request) {
  try {
    // Chercher dans le cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // Mise à jour du cache en arrière-plan (stale-while-revalidate)
      updateCacheInBackground(request);
      return cachedResponse;
    }

    // Si pas en cache, faire la requête réseau
    const networkResponse = await fetch(request);
    
    // Mettre en cache la réponse si elle est valide
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('[Service Worker] Erreur Cache First:', error);
    
    // Fallback vers page offline pour les pages HTML
    if (request.destination === 'document') {
      const offlineResponse = await caches.match('/offline.html');
      return offlineResponse || new Response('Offline', { status: 503 });
    }
    
    return new Response('Network error', { status: 503 });
  }
}

/**
 * Network First Strategy
 * Essaie le réseau d'abord, fallback vers le cache
 * Idéal pour les requêtes API
 */
async function networkFirstStrategy(request) {
  try {
    // Tenter la requête réseau avec timeout
    const networkResponse = await fetchWithTimeout(request, 3000);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(API_CACHE_NAME);
      const responseToCache = networkResponse.clone();
      
      const headers = new Headers(responseToCache.headers);
      headers.append('sw-cache-time', Date.now().toString());
      
      cache.put(request, new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      }));
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('[Service Worker] Réseau indisponible, utilisation du cache API');
    
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      const cacheTime = cachedResponse.headers.get('sw-cache-time');
      if (cacheTime && (Date.now() - parseInt(cacheTime)) < API_CACHE_TIME) {
        return cachedResponse;
      }
    }
    
    return new Response(JSON.stringify({ 
      error: 'Offline', 
      message: 'Impossible de récupérer les données' 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || 
         url.hostname.includes('api.') ||
         url.pathname.includes('/graphql');
}

function isStaticAsset(url) {
  const staticExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', 
                           '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

function updateCacheInBackground(request) {
  fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        caches.open(DYNAMIC_CACHE_NAME)
          .then(cache => cache.put(request, response));
      }
    })
    .catch(() => {
    });
}

function fetchWithTimeout(request, timeout = 5000) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Notification push reçue');
  
  let notificationData = {
    title: 'Biscuits IA',
    body: 'Nouvelle notification',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    tag: 'biscuits-ia-notification',
    requireInteraction: false
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.error('[Service Worker] Erreur parsing notification:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data || {}
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Clic sur notification');
  
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si une fenêtre est déjà ouverte, la mettre au premier plan
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon, ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Synchronisation en arrière-plan:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Logique de synchronisation personnalisée
      syncData()
    );
  }
});

async function syncData() {
  try {
    console.log('[Service Worker] Synchronisation des données...');
    // Implémenter la logique de synchronisation ici
    return Promise.resolve();
  } catch (error) {
    console.error('[Service Worker] Erreur de synchronisation:', error);
    return Promise.reject(error);
  }
}

self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message reçu:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});