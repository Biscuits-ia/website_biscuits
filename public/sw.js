// sw.js - Version optimisée pour Astro + Svelte
const CACHE_VERSION = 'v2026.2';
const CACHE_NAMES = {
  static: `static-${CACHE_VERSION}`,
  dynamic: `dynamic-${CACHE_VERSION}`,
  api: `api-${CACHE_VERSION}`,
  images: `images-${CACHE_VERSION}`,
  fonts: `fonts-${CACHE_VERSION}`,
};

// Optimisation : TTL (Time To Live) pour le cache
const CACHE_TTL = {
  static: 30 * 24 * 60 * 60 * 1000, // 30 jours
  images: 7 * 24 * 60 * 60 * 1000,  // 7 jours
  api: 5 * 60 * 1000,               // 5 minutes
  dynamic: 24 * 60 * 60 * 1000,     // 24 heures
};

// Assets critiques pour Astro (premier chargement)
const CRITICAL_ASSETS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  // Fichiers Astro générés (ajustez selon votre build)
  '/_astro/client.xxxx.js', // Remplacez xxxx par le hash réel
  '/_astro/root.xxxx.css',
];

// Assets statiques (CSS, JS, Fonts)
const STATIC_ASSETS = [
  // Polices Google Fonts (self-hosted si possible)
  '/fonts/inter-var.woff2',
  '/fonts/inter-var-latin.woff2',
  
  // Assets générés par Astro
  '/_astro/*.css',
  '/_astro/*.js',
  
  // Images critiques
  '/assets/logo.svg',
  '/assets/hero-image.webp',
];

// Liste des requêtes à ne jamais mettre en cache
const NEVER_CACHE = [
  '/admin',
  '/api/auth',
  '/api/webhooks',
  '/wp-admin',
  '/wp-login.php',
  /\/api\/.*\/delete/,
  /\/api\/.*\/update/,
  /\/api\/.*\/create/,
];

// Fonction utilitaire : vérifie si l'URL doit être mise en cache
function shouldCache(url) {
  const urlString = url.toString();
  
  // Vérifie les patterns à ne pas cacher
  for (const pattern of NEVER_CACHE) {
    if (pattern instanceof RegExp) {
      if (pattern.test(urlString)) return false;
    } else if (urlString.includes(pattern)) {
      return false;
    }
  }
  
  // Ne pas cacher les requêtes POST, PUT, DELETE
  return true;
}

// Fonction pour nettoyer les anciens caches avec TTL
async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const currentTime = Date.now();
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const cachedTime = new Date(dateHeader).getTime();
          const cacheAge = currentTime - cachedTime;
          
          // Détermine le TTL selon le type de cache
          let ttl = CACHE_TTL.dynamic;
          if (cacheName.includes('static')) ttl = CACHE_TTL.static;
          if (cacheName.includes('images')) ttl = CACHE_TTL.images;
          if (cacheName.includes('api')) ttl = CACHE_TTL.api;
          
          if (cacheAge > ttl) {
            await cache.delete(request);
          }
        }
      }
    }
  }
}

// Dans votre sw.js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Bloquer les requêtes vers les APIs dépréciées
  const deprecatedPatterns = [
    'shared-storage',
    'attribution-reporting',
    '.well-known/attribution-reporting',
  ];
  
  for (const pattern of deprecatedPatterns) {
    if (url.pathname.includes(pattern)) {
      event.respondWith(new Response(null, {
        status: 410, // Gone
        statusText: 'API Deprecated',
      }));
      return;
    }
  }
  
  // Continuer avec la logique normale...
});

// Installation
self.addEventListener('install', (event) => {
  console.log('[SW] Installation v2026.2');
  
  event.waitUntil(
    (async () => {
      // Ouvrir tous les caches
      const staticCache = await caches.open(CACHE_NAMES.static);
      const fontsCache = await caches.open(CACHE_NAMES.fonts);
      
      // Cache des assets critiques immédiatement
      await staticCache.addAll(CRITICAL_ASSETS);
      
      // Pré-cache asynchrone pour les autres assets
      Promise.all(
        STATIC_ASSETS.map(url => 
          fetch(url).then(res => {
            if (res.ok) staticCache.put(url, res);
          }).catch(() => {})
        )
      );
      
      await self.skipWaiting();
    })()
  );
});

// Activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation v2026.2');
  
  event.waitUntil(
    (async () => {
      // Nettoyer les anciens caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => !Object.values(CACHE_NAMES).includes(name))
          .map(name => caches.delete(name))
      );
      
      // Nettoyage avec TTL
      await cleanupOldCaches();
      
      // Claim clients immédiatement
      await self.clients.claim();
      
      // Envoyer un message à tous les clients
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_ACTIVATED',
          version: CACHE_VERSION
        });
      });
    })()
  );
});

// Stratégies de cache optimisées
const strategies = {
  // Stale While Revalidate (pour contenu fréquemment mis à jour)
  staleWhileRevalidate: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    
    try {
      // D'abord, essayer le réseau
      const networkResponse = await fetch(request);
      
      if (networkResponse.ok) {
        // Mettre à jour le cache en arrière-plan
        event.waitUntil(
          cache.put(request, networkResponse.clone())
        );
        return networkResponse;
      }
      
      // Si réseau échoue, utiliser le cache
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;
      
      throw new Error('Network failed and no cache');
      
    } catch (error) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;
      
      // Fallback générique
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  },
  
  // Cache First (pour assets statiques)
  cacheFirst: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
      // Vérifier si le cache est encore frais
      const dateHeader = cached.headers.get('date');
      if (dateHeader) {
        const cacheAge = Date.now() - new Date(dateHeader).getTime();
        const ttl = CACHE_TTL[cacheName.split('-')[0]] || CACHE_TTL.static;
        
        if (cacheAge < ttl) {
          // Renvoyer la version en cache si elle est fraîche
          return cached;
        }
      }
    }
    
    // Sinon, aller sur le réseau
    try {
      const response = await fetch(request);
      if (response.ok && shouldCache(request.url)) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      // Si hors ligne et pas de cache, fallback
      if (cached) return cached;
      
      // Fallback spécifique selon le type
      if (request.destination === 'image') {
        return caches.match('/assets/placeholder.webp');
      }
      if (request.destination === 'font') {
        return new Response(null, { status: 404 });
      }
      
      return new Response('Offline', { status: 503 });
    }
  },
  
  // Network First (pour HTML)
  networkFirst: async (request) => {
    try {
      const response = await fetch(request);
      
      if (response.ok && shouldCache(request.url)) {
        const cache = await caches.open(CACHE_NAMES.dynamic);
        cache.put(request, response.clone());
      }
      
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAMES.dynamic);
      const cached = await cache.match(request);
      
      if (cached) {
        return cached;
      }
      
      // Page offline
      const offlinePage = await caches.match('/offline');
      if (offlinePage) return offlinePage;
      
      // Fallback HTML minimal
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Hors ligne</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: system-ui; padding: 2rem; text-align: center; }
            </style>
          </head>
          <body>
            <h1>Vous êtes hors ligne</h1>
            <p>Cette page n'est pas disponible hors ligne.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
  },
  
  // Network Only (pour les données sensibles)
  networkOnly: async (request) => {
    return fetch(request);
  }
};

// Gestion des requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorer certaines requêtes
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  
  // Ignorer les requêtes de Partytown pour éviter les warnings
  if (url.pathname.includes('partytown')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Ignorer les URLs de développement
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    // En développement, on peut utiliser networkOnly
    event.respondWith(strategies.networkOnly(request));
    return;
  }
  
  // Stratégie selon le type de ressource
  if (request.destination === 'image') {
    event.respondWith(strategies.cacheFirst(request, CACHE_NAMES.images));
  } else if (request.destination === 'font') {
    event.respondWith(strategies.cacheFirst(request, CACHE_NAMES.fonts));
  } else if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    url.pathname.includes('_astro/')
  ) {
    event.respondWith(strategies.cacheFirst(request, CACHE_NAMES.static));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(strategies.staleWhileRevalidate(request, CACHE_NAMES.api));
  } else if (
    request.headers.get('accept')?.includes('text/html') ||
    request.destination === 'document'
  ) {
    event.respondWith(strategies.networkFirst(request));
  } else {
    event.respondWith(strategies.staleWhileRevalidate(request, CACHE_NAMES.dynamic));
  }
});

// Gestion des messages
self.addEventListener('message', (event) => {
  switch (event.data?.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
      break;
      
    case 'PRELOAD':
      if (event.data.urls) {
        caches.open(CACHE_NAMES.dynamic).then(cache => {
          event.data.urls.forEach(url => cache.add(url).catch(() => {}));
        });
      }
      break;
      
    case 'GET_CACHE_INFO':
      caches.keys().then(names => {
        event.ports[0]?.postMessage({
          cacheNames: names,
          version: CACHE_VERSION
        });
      });
      break;
  }
});

// Background sync (si supporté)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests() {
  const cache = await caches.open('pending-requests');
  const requests = await cache.keys();
  
  for (const request of requests) {
    try {
      await fetch(request);
      await cache.delete(request);
    } catch (error) {
      console.log('[SW] Sync failed, will retry next sync');
    }
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});