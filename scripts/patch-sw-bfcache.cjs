const fs = require('fs');
const path = 'src/layouts/Layout.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

// 1. client:idle -> client:visible (Lighthouse main-thread work reduction)
const old = '  <CookieConsent client:idle />';
const newB = '  <CookieConsent client:visible />';
s = s.replace(old, newB);

// 2. SW registration - load on idle, not on window load (back/forward cache restoration)
// The bfcache failure is typically because the SW is registered with window.addEventListener("load").
// Change to wait for requestIdleCallback.
const oldSw = '  <!-- Service Worker (PWA, activ\u00e9 uniquement apr\u00e8s opt-in analytics + consentement cookies) -->\n  <script is:inline defer nonce={nonce} src="/sw-register.js"></script>';
const newSw = '  <!-- Service Worker (PWA). Chargement differe (requestIdleCallback) pour ne pas\n       bloquer le bfcache (back/forward cache) ni le LCP. Le SW lui-meme est\n       mis en cache par Vercel (max-age=2592000). -->\n  <script is:inline nonce={nonce}>\n    (function() {\n      if (!'serviceWorker' in navigator) return;\n      var reg = function() {\n        navigator.serviceWorker.register(\'/sw.js\')\n          .then(function(r) { if (window.__GTM_DEBUG__) console.log(\'SW:\', r.scope); })\n          .catch(function(e) { if (window.__GTM_DEBUG__) console.warn(\'SW failed:\', e); });\n      };\n      if (\'requestIdleCallback\' in window) {\n        window.requestIdleCallback(reg, { timeout: 5000 });\n      } else {\n        window.addEventListener(\'load\', reg);\n      }\n    })();\n  </script>';
const c = s.split(oldSw).length - 1;
console.log('sw old matches:', c);
s = s.split(oldSw).join(newSw);
fs.writeFileSync(path, s, 'utf8');
console.log('OK sw deferred + bfcache fix');
