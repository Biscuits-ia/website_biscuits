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

function findApi(url) {
  if (url.includes('/[')) {
    const base = url.split('/[')[0];
    return apis[base];
  }
  return apis[url];
}

const c = { url: '/api/user-appointments/[id]', need: 'DELETE' };
const src = findApi(c.url);
console.log('Found src:', !!src, 'len:', src ? src.length : 0);
if (src) {
  const re = new RegExp('export\\s+const\\s+' + c.need + '\\b');
  console.log('Regex test:', re.test(src));
  console.log('Match:', src.match(re)?.[0]);
}
