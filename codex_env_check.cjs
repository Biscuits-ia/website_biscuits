const fs = require('fs');

const envSrc = fs.readFileSync('src/env.d.ts', 'utf8');
const re = /readonly\s+([A-Z_][A-Z0-9_]*)/g;
const declared = new Set();
let m;
while ((m = re.exec(envSrc))) declared.add(m[1]);

const re2 = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g;
const used = new Set();
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== 'dist' && item.name !== '.astro') walk(p);
    } else if (/\.(astro|ts|tsx)$/.test(item.name)) {
      const src = fs.readFileSync(p, 'utf8');
      let mm;
      const localRe = new RegExp(re2.source, 'g');
      while ((mm = localRe.exec(src))) used.add(mm[1]);
    }
  }
}
walk('src');

console.log('Variables declarees mais non utilisees :');
for (const v of declared) if (!used.has(v)) console.log('  - ' + v);
console.log('\\nVariables utilisees mais non declarees dans env.d.ts :');
for (const v of used) if (!declared.has(v)) console.log('  ! ' + v);
