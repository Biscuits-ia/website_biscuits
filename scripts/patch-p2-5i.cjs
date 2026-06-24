const fs = require('fs');
const NL = '\n';
const path = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(path, 'utf8');

// Remove dead `if (!ctx)` after the discriminator already narrowed - just remove the line
s = s.replace("  if (!ctx) return jsonError('Non autorise.', 401);" + NL, '');
fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-5i dead check removed');
