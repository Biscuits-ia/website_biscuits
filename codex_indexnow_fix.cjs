const fs = require('fs');
const path = 'src/pages/api/indexnow.ts';
let src = fs.readFileSync(path, 'utf8');
// Fix: le / dans </loc> a ferme la regex. Il faut l\u2019echapper.
const before = src;
src = src.replace(
  /Array\.from\(xml\.matchAll\(\/<loc>\(\[\^<\]\+\)<\/loc>\/g\)\)/,
  'Array.from(xml.matchAll(/<loc>([^<]+)<\\/loc>/g))'
);
if (src !== before) {
  fs.writeFileSync(path, src, 'utf8');
  console.log('regex fixee dans indexnow.ts');
} else {
  console.log('pas de changement');
}
