const fs = require('fs');
const NL = '\n';

// Update 2 call-sites (groupes/index.ts + groupes/[id]/adherents.ts) to use the flat helper.

const files = [
  { path: 'src/pages/api/groupes/index.ts', from: "getAdherentsAuthContext", to: "getAdherentsAuthContextFlat" },
  { path: 'src/pages/api/groupes/[id]/adherents.ts', from: "getAdherentsAuthContext", to: "getAdherentsAuthContextFlat" },
];

for (const { path, from, to } of files) {
  let s = fs.readFileSync(path, 'utf8');
  if (!s.includes('import {')) { console.error('IMPORT NOT FOUND', path); process.exit(1); }
  s = s.replace(new RegExp(from + '([^F])', 'g'), to + '$1');
  fs.writeFileSync(path, s, 'utf8');
  console.log('OK', path);
}
