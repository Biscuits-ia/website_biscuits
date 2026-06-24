const fs = require('fs');
const path = 'astro.config.mjs';
let s = fs.readFileSync(path, 'utf8');
// Move the vite block to be inside the config (right after the integrations)
// and merge with the build block. Currently we have: build {...}, vite {...}
// which is invalid syntax - they need to be siblings not concatenated.
const old = "  build: {\n    assets: '_astro',\n    inlineStylesheets: 'always',\n  }, vite: {";
const newB = "  build: {";
if (!s.includes(old)) { console.error('NOT FOUND'); process.exit(1); }
s = s.replace(old, newB);

const old2 = "  build: {\n    assets: '_astro',\n    inlineStylesheets: 'always',\n  },\n\n  vite: {";
const newB2 = "  build: {";
s = s.replace(old2, newB2);

fs.writeFileSync(path, s, 'utf8');
console.log('OK vite merged');
