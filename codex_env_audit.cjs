const fs = require('fs');

// Verifier que toutes les variables d\u2019env declarees dans env.d.ts sont utilisees
// et qu\u2019aucun fichier source ne reference une variable non declaree.

const envDecls = [];
const envSrc = fs.readFileSync('src/env.d.ts', 'utf8');
const re = /readonly\s+([A-Z_][A-Z0-9_]*)/g;
let m;
while ((m = re.exec(envSrc))) {
  envDecls.push(m[1]);
}
console.log('Variables declarees dans env.d.ts :');
for (const v of envDecls) console.log('  ' + v);

const reUse = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g;
const used = new Set();
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}\\${item.name}`;
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== 'dist' && item.name !== '.astro') walk(p);
    } else if (/\\.(astro|ts|tsx)$/.test(item.name)) {
      const src = fs.readFileSync(p, 'utf8');
      let mm;
      while ((mm = reUse.exec(src))) used.add(mm[1]);
    }
  }
}
walk('src');

console.log('\\nVariables utilisees (import.meta.env.X) :');
for (const v of [...used].sort()) console.log('  ' + v);

console.log('\\nVariables declarees mais non utilisees :');
for (const v of envDecls) if (!used.has(v)) console.log('  - ' + v);

console.log('\\nVariables utilisees mais non declarees :');
for (const v of used) if (!envDecls.includes(v)) console.log('  ! ' + v);
