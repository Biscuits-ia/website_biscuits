const fs = require('fs');

const re = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g;
const used = new Set();
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}\\${item.name}`;
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== 'dist' && item.name !== '.astro') walk(p);
    } else if (/\\.(astro|ts|tsx)$/.test(item.name)) {
      const src = fs.readFileSync(p, 'utf8');
      let mm;
      const localRe = new RegExp(re.source, 'g');
      while ((mm = localRe.exec(src))) used.add(mm[1]);
    }
  }
}
walk('src');
console.log('Variables utilisees :');
for (const v of [...used].sort()) console.log('  ' + v);
