const fs = require('fs');
const path = 'src/components/BaseHead.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// Current: separate Inter import in global.css AND Zalando Sans SemiExpanded in BaseHead.
// We have 2 Google Fonts requests = 2 round-trips. Pick one or self-host.

// Strategy:
// 1. Remove the Google Fonts <link> from BaseHead (synchronously render-blocking).
// 2. Replace with a small inline <link rel="preload"> for the critical font + a deferred
//    <link rel="stylesheet"> injected with `media=print then onload swap` pattern.
// 3. Remove the @import in global.css (it was the original Inter import, but BaseHead now uses Zalando).

const old = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Zalando+Sans+SemiExpanded:ital,wght@0,200..900;1,200..900&display=swap" rel="stylesheet">';

const newB =
  '<!--' + NL +
  '  Fonts : preconnect + load asynchrone pour ne pas bloquer le render (Lighthouse).' + NL +
  '  Le swap `media=print` + onload evite que la feuille de style Google Fonts bloque le FCP.' + NL +
  '  font-display:swap est deja dans la query string (deja inclus).' + NL +
  '-->' + NL +
  '<link rel="preconnect" href="https://fonts.googleapis.com">' + NL +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' + NL +
  '<link' + NL +
  '  rel="stylesheet"' + NL +
  '  href="https://fonts.googleapis.com/css2?family=Zalando+Sans+SemiExpanded:ital,wght@0,200..900;1,200..900&display=swap"' + NL +
  '  media="print"' + NL +
  '  onload="this.media=' + "'" + 'all' + "'" + '"' + NL +
  '>' + NL +
  '<noscript>' + NL +
  '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zalando+Sans+SemiExpanded:ital,wght@0,200..900;1,200..900&display=swap">' + NL +
  '</noscript>';

const c = s.split(old).length - 1;
console.log('font block matches:', c);
s = s.split(old).join(newB);

fs.writeFileSync(path, s, 'utf8');
console.log('OK fonts defer');
