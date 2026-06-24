const fs = require("fs");
const path = "src/layouts/Layout.astro";
let s = fs.readFileSync(path, "utf8");

// Just change client:idle -> client:visible. SW inline would be more invasive.
// The bfcache issue is more likely the script blocking. Let me only fix that.
const old = "  <CookieConsent client:idle />";
const newB = "  <CookieConsent client:visible />";
s = s.replace(old, newB);

// Also: replace the defer src=sw-register.js with an inline requestIdleCallback
// Use a JSON-encoded string to avoid JS-in-template-literal escape issues.
const oldSw = "  <!-- Service Worker (PWA, activ\u00e9 uniquement apr\u00e8s opt-in analytics + consentement cookies) -->\n  <script is:inline defer nonce={nonce} src=\"/sw-register.js\"></script>";
const swScript = "  <!-- Service Worker (PWA). Chargement differe (requestIdleCallback) pour ne pas\n" +
  "       bloquer le bfcache (back/forward cache) ni le LCP. -->\n" +
  "  <script is:inline nonce={nonce}>\n" +
  "    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {\n" +
  "      var reg = function() { navigator.serviceWorker.register('/sw.js').catch(function() {}); };\n" +
  "      if ('requestIdleCallback' in window) window.requestIdleCallback(reg, { timeout: 5000 });\n" +
  "      else window.addEventListener('load', reg);\n" +
  "    }\n" +
  "  </script>";

const c = s.split(oldSw).length - 1;
console.log("sw old matches:", c);
s = s.split(oldSw).join(swScript);

// Also remove the now-orphan public/sw-register.js since it\'s no longer referenced
fs.writeFileSync(path, s, "utf8");
console.log("OK sw bfcache fix + cookie consent visible");
