const fs = require('fs');
const path = 'src/components/Hero.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

// Hero is the LCP element. Add fetchpriority="high" to the Image (LCP optimization).
const old = '          loading="eager"';
const newB = '          loading="eager"\n          fetchpriority="high"';
const c = s.split(old).length - 1;
console.log('hero loading matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK hero fetchpriority added');
