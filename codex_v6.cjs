const fs = require('fs');
const path = require('path');

const apis = {};
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.ts')) {
      const norm = p.replace(/\\/g, '/');
      const re = /\/pages\/(api|auth)\/(.+)\.ts$/;
      const m = norm.match(re);
      let rel = '';
      if (m) {
        rel = '/' + m[1] + '/' + m[2];
        apis[rel] = fs.readFileSync(p, 'utf8');
      }
    }
  }
}
walk('src/pages/api');
walk('src/pages/auth');

console.log('Total routes:', Object.keys(apis).length);
console.log('Sample:', Object.keys(apis).slice(0, 5));
