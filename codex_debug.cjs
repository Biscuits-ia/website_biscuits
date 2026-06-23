const fs = require('fs');
const path = require('path');

const apis = {};
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.ts')) {
      const norm = p.replace(/\\/g, '/');
      let rel = '';
      if (norm.includes('/pages/api/')) {
        rel = '/api/' + norm.split('/pages/api/')[1].replace(/\.ts$/, '');
      } else if (norm.includes('/pages/auth/')) {
        rel = '/auth/' + norm.split('/pages/auth/')[1].replace(/\.ts$/, '');
      }
      if (rel) apis[rel] = fs.readFileSync(p, 'utf8');
    }
  }
}
walk('src/pages/api');
walk('src/pages/auth');

// Verifions que la cle dynamique est bien creee
const keys = Object.keys(apis);
console.log('user-appointments present?', keys.filter(k => k.includes('user-appointments')));
