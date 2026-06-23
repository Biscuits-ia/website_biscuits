const fs = require('fs');
const path = require('path');

const apis = {};
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of entries) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.ts')) {
      const norm = p.replace(/\\/g, '/');
      const re = /\/pages\/(api|auth)\/(.+)\.ts$/;
      const m = norm.match(re);
      let rel = '';
      if (m) rel = '/' + m[1] + '/' + m[2];
      if (rel) apis[rel] = fs.readFileSync(p, 'utf8');
    }
  }
}
walk('src/pages/api');
walk('src/pages/auth');
console.log('Total:', Object.keys(apis).length);
