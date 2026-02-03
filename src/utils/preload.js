// src/utils/preload.js
export function registerPreload() {
  if ('serviceWorker' in navigator) {
    // Précharger les pages les plus visitées
    const popularPages = [
      '/blog/',
      '/services/',
      '/contact/',
      '/guides-ressources/'
    ];
    
    // Envoyer au Service Worker
    navigator.serviceWorker.ready.then(registration => {
      registration.active.postMessage({
        type: 'PRELOAD',
        urls: popularPages
      });
    });
    
    // Précharger les images au-dessus de la ligne de flottaison
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.getAttribute('data-src') || img.src;
          
          if (src) {
            fetch(src, { mode: 'no-cors' })
              .then(() => console.log('Image préchargée:', src))
              .catch(() => {});
          }
        }
      });
    });
    
    // Observer les images
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      observer.observe(img);
    });
  }
}