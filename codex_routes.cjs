const fs = require('fs');
const path = require('path');

// Inventaire complet des routes API et pages Astro
function walk(dir, ext, results = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) walk(p, ext, results);
    else if (item.name.endsWith(ext)) results.push(p);
  }
  return results;
}

const apis = walk('src/pages/api', '.ts').sort();
const pages = walk('src/pages', '.astro')
  .filter(p => !p.includes('/api/'))
  .sort();
const auths = walk('src/pages/auth', '.ts').sort();

console.log('=== Pages Astro (' + pages.length + ') ===');
for (const p of pages) console.log('  ' + p.replace(/\\/g, '/').replace('src/', ''));

console.log('\\n=== Pages /auth SSR (' + auths.length + ') ===');
for (const p of auths) console.log('  ' + p.replace(/\\/g, '/').replace('src/', ''));

console.log('\\n=== API routes (' + apis.length + ') ===');
for (const p of apis) console.log('  ' + p.replace(/\\/g, '/').replace('src/', ''));
