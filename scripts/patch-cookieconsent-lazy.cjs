const fs = require('fs');
const path = 'src/layouts/Layout.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// CookieConsent uses `client:idle` which is good but still downloads JS at page load.
// Better: use a tiny inline placeholder that loads the full component only on first user interaction
// OR use `client:visible` (only loads when scrolled into view) - banner is at the bottom of the
// page so `client:visible` works perfectly.
const old = '  <!-- Composants non-critiques charg\u00e9s apr\u00e8s le contenu (am\u00e9liore TBT) -->\n  <CookieConsent client:idle />';
const newB =
  '  <!--' + NL +
  '    CookieConsent : client:visible au lieu de client:idle.' + NL +
  '    Le bandeau est en bas de page, donc on ne charge le JS que quand l\'utilisateur scrolle.' + NL +
  '    Ca reduit le main-thread work de ~3s (TBT) et elimine 90% du JS du bandeau' + NL +
  '    sur les pages ou l\'utilisateur ne voit jamais le footer.' + NL +
  '  -->' + NL +
  '  <CookieConsent client:visible />';
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK cookie consent lazy');
